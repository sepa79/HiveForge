import type { EnvironmentDefinition } from "../config/environment-types.js";
import type { ProjectRegistryConfig } from "../config/project-registry-types.js";
import type { RuntimeEnvStore } from "../config/runtime-env-store.js";
import { evaluateProfileEligibility } from "../config/profile-eligibility.js";
import type { ProjectRegistry } from "../manifest/manifest-types.js";
import type { RequirementValidator } from "../validation/requirement-validator.js";
import type { ProjectInspectionService } from "./project-inspection-service.js";

export type PrerequisiteStatus = "present" | "missing" | "unknown" | "not_applicable";
export type DeploymentMode = "action" | "release";

export interface DeployPrerequisitesRequest {
  projectId: string;
  gitRef: string;
  component: string;
  action: string;
  profile?: string;
  deploymentMode?: DeploymentMode;
  vars?: Record<string, string>;
  releaseVars?: Record<string, string>;
  images?: unknown[];
  artifact?: unknown;
}

export interface PrerequisiteItem {
  type: string;
  status: PrerequisiteStatus;
  required?: string;
  reason: string;
}

export interface DeployPrerequisitesReport {
  ready: boolean;
  environment?: {
    id: string;
    name: string;
    kind: string;
  };
  manualPrerequisites: PrerequisiteItem[];
  hiveforgePrerequisites: PrerequisiteItem[];
  releasePrerequisites: PrerequisiteItem[];
}

export class DeployPrerequisitesService {
  constructor(
    private readonly projectRegistry: ProjectRegistryConfig,
    private readonly inspection: ProjectInspectionService,
    private readonly validator: RequirementValidator,
    private readonly runtimeEnv: RuntimeEnvStore | undefined,
    private readonly currentEnvironment: EnvironmentDefinition | undefined
  ) {}

  async explain(request: DeployPrerequisitesRequest): Promise<DeployPrerequisitesReport> {
    const manualPrerequisites: PrerequisiteItem[] = [];
    const hiveforgePrerequisites: PrerequisiteItem[] = [];
    const releasePrerequisites: PrerequisiteItem[] = [];
    const registeredProject = this.projectRegistry.projects.find((project) => project.id === request.projectId);

    hiveforgePrerequisites.push(
      registeredProject
        ? present("project_registration", request.projectId, "Project is registered in HiveForge")
        : missing("project_registration", request.projectId, "Project is not registered in HiveForge")
    );

    if (!registeredProject) {
      return report(this.currentEnvironment, manualPrerequisites, hiveforgePrerequisites, releasePrerequisites);
    }

    hiveforgePrerequisites.push(
      registeredProject.approvedRefs.includes(request.gitRef)
        ? present("approved_git_ref", request.gitRef, "Git ref is approved for this project")
        : missing("approved_git_ref", request.gitRef, "Git ref is not approved for this project")
    );

    const inspection = await this.inspectProject(request, hiveforgePrerequisites);
    if (!inspection) {
      return report(this.currentEnvironment, manualPrerequisites, hiveforgePrerequisites, releasePrerequisites);
    }

    this.explainComponentAction(request, inspection.registry, hiveforgePrerequisites);
    this.explainEnvironmentPolicy(request, hiveforgePrerequisites);
    this.explainProfileEligibility(request, inspection.registry, hiveforgePrerequisites);

    const runtimeEnv = this.runtimeEnv
      ? await this.runtimeEnv.resolve({
          projectId: request.projectId,
          ...(request.profile ? { profile: request.profile } : {})
        })
      : {};
    const requirementReport = await this.validator.validateProject(inspection.registry, {
      ...runtimeEnv,
      ...(request.profile ? { HIVEFORGE_PROFILE: request.profile } : {})
    });
    for (const issue of requirementReport.issues) {
      if (issue.requirementType === "volume") {
        manualPrerequisites.push(missing("docker_volume", issue.name, issue.message));
      }
      if (issue.requirementType === "secret") {
        manualPrerequisites.push(missing("docker_secret", issue.name, issue.message));
      }
      if (issue.requirementType === "environment") {
        hiveforgePrerequisites.push(missing("runtime_env", issue.name, issue.message));
      }
    }

    this.explainReleasePrerequisites(request, releasePrerequisites);
    return report(this.currentEnvironment, manualPrerequisites, hiveforgePrerequisites, releasePrerequisites);
  }

  private async inspectProject(
    request: DeployPrerequisitesRequest,
    hiveforgePrerequisites: PrerequisiteItem[]
  ): Promise<{ registry: ProjectRegistry } | undefined> {
    try {
      const inspection = await this.inspection.inspect({
        projectId: request.projectId,
        gitRef: request.gitRef
      });
      hiveforgePrerequisites.push(present("project_manifest", "hiveforge.yaml", "Project manifests loaded"));
      return inspection;
    } catch (error) {
      hiveforgePrerequisites.push(
        missing("project_manifest", "hiveforge.yaml", error instanceof Error ? error.message : "Project inspection failed")
      );
      return undefined;
    }
  }

  private explainComponentAction(
    request: DeployPrerequisitesRequest,
    registry: ProjectRegistry,
    hiveforgePrerequisites: PrerequisiteItem[]
  ): void {
    const component = registry.components.find((candidate) => candidate.name === request.component);
    if (!component) {
      hiveforgePrerequisites.push(
        missing("component", request.component, `Component is not managed by HiveForge: ${request.component}`)
      );
      return;
    }
    hiveforgePrerequisites.push(present("component", request.component, "Component is managed by HiveForge"));

    if (!component.manifest.deployment.actions[request.action]) {
      hiveforgePrerequisites.push(
        missing("component_action", request.action, `Action is not declared for ${request.component}: ${request.action}`)
      );
      return;
    }
    hiveforgePrerequisites.push(
      present("component_action", request.action, `Action is declared for ${request.component}: ${request.action}`)
    );
  }

  private explainEnvironmentPolicy(
    request: DeployPrerequisitesRequest,
    hiveforgePrerequisites: PrerequisiteItem[]
  ): void {
    if (!this.currentEnvironment) {
      hiveforgePrerequisites.push(unknown("environment_policy", "current", "Current environment is not configured"));
      return;
    }

    const policy = this.currentEnvironment.policy.projects.find((project) => project.id === request.projectId);
    if (!policy) {
      hiveforgePrerequisites.push(
        missing(
          "environment_policy",
          request.projectId,
          `Project is not allowed on environment ${this.currentEnvironment.id}: ${request.projectId}`
        )
      );
      return;
    }
    if (!(policy.actions as string[]).includes(request.action)) {
      hiveforgePrerequisites.push(
        missing(
          "environment_policy",
          request.action,
          `Action is not allowed on environment ${this.currentEnvironment.id} for ${request.projectId}: ${request.action}`
        )
      );
      return;
    }
    if (policy.profiles && !request.profile) {
      hiveforgePrerequisites.push(
        missing(
          "environment_policy",
          "profile",
          `Missing required profile for environment ${this.currentEnvironment.id}: ${request.projectId}`
        )
      );
      return;
    }
    if (policy.profiles && request.profile && !policy.profiles.includes(request.profile)) {
      hiveforgePrerequisites.push(
        missing(
          "environment_policy",
          request.profile,
          `Profile is not allowed on environment ${this.currentEnvironment.id} for ${request.projectId}: ${request.profile}`
        )
      );
      return;
    }
    hiveforgePrerequisites.push(
      present("environment_policy", request.projectId, "Environment policy allows project/action/profile")
    );
  }

  private explainProfileEligibility(
    request: DeployPrerequisitesRequest,
    registry: ProjectRegistry,
    hiveforgePrerequisites: PrerequisiteItem[]
  ): void {
    if (!registry.project.profiles?.length) {
      hiveforgePrerequisites.push(notApplicable("profile_eligibility", "profile", "Project manifest declares no profiles"));
      return;
    }
    if (!request.profile) {
      hiveforgePrerequisites.push(missing("profile_eligibility", "profile", "Project profile is required"));
      return;
    }
    const profile = registry.project.profiles.find((candidate) => candidate.id === request.profile);
    if (!profile) {
      hiveforgePrerequisites.push(
        missing("profile_eligibility", request.profile, `Project manifest does not declare profile: ${request.profile}`)
      );
      return;
    }
    if (!this.currentEnvironment) {
      hiveforgePrerequisites.push(unknown("profile_eligibility", request.profile, "Current environment is not configured"));
      return;
    }
    const result = evaluateProfileEligibility(this.currentEnvironment, profile);
    if (result.eligible) {
      hiveforgePrerequisites.push(
        present("profile_eligibility", request.profile, "Profile is eligible for the current environment")
      );
      return;
    }
    for (const issue of result.issues) {
      hiveforgePrerequisites.push(missing("profile_eligibility", issue.requirement, issue.message));
    }
  }

  private explainReleasePrerequisites(
    request: DeployPrerequisitesRequest,
    releasePrerequisites: PrerequisiteItem[]
  ): void {
    if ((request.deploymentMode ?? "action") !== "release") {
      return;
    }
    releasePrerequisites.push(
      request.releaseVars?.["release.imageTag"]
        ? present("release_var", "release.imageTag", "Release image tag is supplied")
        : missing("release_var", "release.imageTag", "Release image tag must be supplied explicitly")
    );
    releasePrerequisites.push(
      request.vars?.["imageRepository.project"]
        ? present("registry_var", "imageRepository.project", "Project image repository is supplied")
        : missing("registry_var", "imageRepository.project", "Project image repository must be supplied explicitly")
    );
    releasePrerequisites.push(
      request.images?.length || request.artifact
        ? present("release_images", "images or artifact", "Release image templates are supplied")
        : missing("release_images", "images or artifact", "Release image templates or artifact must be supplied")
    );
  }
}

function report(
  environment: EnvironmentDefinition | undefined,
  manualPrerequisites: PrerequisiteItem[],
  hiveforgePrerequisites: PrerequisiteItem[],
  releasePrerequisites: PrerequisiteItem[]
): DeployPrerequisitesReport {
  const all = [...manualPrerequisites, ...hiveforgePrerequisites, ...releasePrerequisites];
  return {
    ready: all.every((item) => item.status === "present" || item.status === "not_applicable"),
    ...(environment
      ? {
          environment: {
            id: environment.id,
            name: environment.name,
            kind: environment.kind
          }
        }
      : {}),
    manualPrerequisites,
    hiveforgePrerequisites,
    releasePrerequisites
  };
}

function present(type: string, required: string, reason: string): PrerequisiteItem {
  return { type, required, status: "present", reason };
}

function missing(type: string, required: string, reason: string): PrerequisiteItem {
  return { type, required, status: "missing", reason };
}

function unknown(type: string, required: string, reason: string): PrerequisiteItem {
  return { type, required, status: "unknown", reason };
}

function notApplicable(type: string, required: string, reason: string): PrerequisiteItem {
  return { type, required, status: "not_applicable", reason };
}
