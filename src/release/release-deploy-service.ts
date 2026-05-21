import { access, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EnvironmentPolicyService } from "../config/environment-policy.js";
import type { EnvironmentDefinition } from "../config/environment-types.js";
import { assertProfileEligible } from "../config/profile-eligibility.js";
import { resolveDeploymentVars, type DeploymentVars } from "../config/deployment-vars.js";
import type { ProjectProfile } from "../manifest/manifest-types.js";
import { managedFilesEnvironment, type ManagedFilesResult, type ManagedFilesService } from "../operation/managed-files-service.js";
import type { ProjectInspectionResult, ProjectInspectionService } from "../operation/project-inspection-service.js";
import {
  validateReleaseDeployInput,
  type ReleaseDeployPlan,
  type ReleaseImageTemplate
} from "./release-deploy-contract.js";
import { resolveReleaseArtifactTemplate, type ReleaseArtifactTemplate } from "./release-artifact.js";

export interface ReleaseDeployProjectMetadata {
  id: string;
  vars?: DeploymentVars;
  profiles?: ProjectProfile[];
}

export interface ReleaseDeployOperationRequest {
  projectId: string;
  gitRef?: string;
  component: string;
  action: string;
  profile?: string;
  project?: ReleaseDeployProjectMetadata;
  environmentVars?: DeploymentVars;
  releaseVars: DeploymentVars;
  images?: ReleaseImageTemplate[];
  artifact?: ReleaseArtifactTemplate;
  requiredFiles?: string[];
}

export interface ReleaseDeployOperationResult {
  plan: ReleaseDeployPlan;
  environmentId?: string;
  inspection?: ProjectInspectionResult;
  managedFiles?: ManagedFilesResult;
  releaseVarsFile?: string;
}

export class ReleaseDeployService {
  constructor(
    private readonly options: {
      environment?: EnvironmentDefinition;
      environmentPolicy?: EnvironmentPolicyService;
      inspection?: ProjectInspectionService;
      managedFiles?: ManagedFilesService;
    } = {}
  ) {}

  async prepare(request: ReleaseDeployOperationRequest): Promise<ReleaseDeployOperationResult> {
    if (request.gitRef) {
      return this.prepareFromCheckout(request);
    }

    if (!request.project) {
      throw new Error("Release deploy requires project metadata when gitRef is not provided");
    }
    return this.prepareFromMetadata(request, request.project);
  }

  private async prepareFromMetadata(
    request: ReleaseDeployOperationRequest,
    project: ReleaseDeployProjectMetadata,
    managedFiles?: ManagedFilesResult
  ): Promise<ReleaseDeployOperationResult> {
    assertProjectMetadataMatchesRequest(request, project);
    const vars = resolveDeploymentVars({
      project: project.vars,
      environment: {
        ...(this.options.environment?.vars ?? {}),
        ...(request.environmentVars ?? {})
      },
      release: request.releaseVars
    });

    const artifact = request.artifact ? resolveReleaseArtifactTemplate(request.artifact, vars) : undefined;
    const images = request.images ?? artifact?.images;
    if (!images) {
      throw new Error("Release deploy requires images or artifact.images");
    }

    const plan = validateReleaseDeployInput({
      projectId: request.projectId,
      component: request.component,
      action: request.action,
      ...(request.profile ? { profile: request.profile } : {}),
      vars,
      images,
      env: mergeReleaseEnv(artifact?.env ?? {}, managedFiles, undefined)
    });

    this.options.environmentPolicy?.assertActionAllowed({
      projectId: request.projectId,
      action: request.action,
      profile: request.profile
    });

    const profile = selectReleaseProfile(project.profiles, request.profile, this.options.environment);
    if (profile && this.options.environment) {
      assertProfileEligible(this.options.environment, profile);
    }

    return {
      plan,
      ...(managedFiles ? { managedFiles } : {}),
      ...(this.options.environment ? { environmentId: this.options.environment.id } : {})
    };
  }

  private async prepareFromCheckout(request: ReleaseDeployOperationRequest): Promise<ReleaseDeployOperationResult> {
    const gitRef = request.gitRef;
    if (!gitRef) {
      throw new Error("Release deploy checkout preparation requires gitRef");
    }
    if (request.project) {
      throw new Error("Release deploy request must provide either gitRef or project metadata, not both");
    }
    if (!this.options.inspection) {
      throw new Error("Release deploy checkout preparation is not configured");
    }
    if (!this.options.managedFiles) {
      throw new Error("Release deploy managed file preparation is not configured");
    }

    const inspection = await this.options.inspection.inspect({
      projectId: request.projectId,
      gitRef
    });
    const managedFiles = await this.options.managedFiles.prepare({
      projectId: inspection.projectId,
      workspacePath: inspection.workspacePath,
      registry: inspection.registry
    });

    await assertRequiredFiles(managedFiles.projectDir, request.requiredFiles ?? []);

    const project = {
      id: inspection.projectId,
      ...(inspection.registry.project.vars ? { vars: inspection.registry.project.vars } : {}),
      ...(inspection.registry.project.profiles ? { profiles: inspection.registry.project.profiles } : {})
    };
    const result = await this.prepareFromMetadata(request, project, managedFiles);
    const releaseVarsFile = path.join(managedFiles.artifactsDir, "release-vars.json");
    await writeFile(releaseVarsFile, `${JSON.stringify(result.plan.vars, null, 2)}\n`, "utf8");

    return {
      ...result,
      inspection,
      releaseVarsFile,
      plan: {
        ...result.plan,
        env: mergeReleaseEnv(result.plan.env, managedFiles, releaseVarsFile)
      }
    };
  }
}

function assertProjectMetadataMatchesRequest(
  request: ReleaseDeployOperationRequest,
  project: ReleaseDeployProjectMetadata
): void {
  if (project.id !== request.projectId) {
    throw new Error(`Release project metadata does not match request project: ${project.id} != ${request.projectId}`);
  }
}

function selectReleaseProfile(
  profiles: ProjectProfile[] | undefined,
  profileId: string | undefined,
  environment: EnvironmentDefinition | undefined
): ProjectProfile | undefined {
  if (!profiles?.length) {
    return undefined;
  }
  if (!profileId) {
    if (!environment) {
      return undefined;
    }
    throw new Error("Missing required profile for release profile eligibility validation");
  }

  const profile = profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error(`Release project metadata does not declare profile: ${profileId}`);
  }
  return profile;
}

function mergeReleaseEnv(
  env: Record<string, string>,
  managedFiles: ManagedFilesResult | undefined,
  releaseVarsFile: string | undefined
): Record<string, string> {
  const merged = { ...env };
  const managedEnv = managedFiles ? managedFilesEnvironment(managedFiles) : {};
  for (const [name, value] of Object.entries(managedEnv)) {
    addEnv(merged, name, value);
  }
  if (releaseVarsFile) {
    addEnv(merged, "HIVEFORGE_RELEASE_VARS_FILE", releaseVarsFile);
  }
  return merged;
}

function addEnv(env: Record<string, string>, name: string, value: string | undefined): void {
  if (!value) {
    return;
  }
  if (env[name] !== undefined && env[name] !== value) {
    throw new Error(`Release artifact env conflicts with HiveForge-managed env: ${name}`);
  }
  env[name] = value;
}

async function assertRequiredFiles(projectDir: string, requiredFiles: string[]): Promise<void> {
  const seen = new Set<string>();
  for (const requiredFile of requiredFiles) {
    if (seen.has(requiredFile)) {
      throw new Error(`Duplicate required runtime file: ${requiredFile}`);
    }
    seen.add(requiredFile);
    const resolved = safeProjectPath(projectDir, requiredFile);
    try {
      await access(resolved);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new Error(`Required runtime file missing: ${requiredFile}`);
      }
      throw error;
    }
  }
}

function safeProjectPath(projectDir: string, relativePath: string): string {
  if (relativePath.length === 0) {
    throw new Error("Required runtime file path must not be empty");
  }
  const resolvedRoot = path.resolve(projectDir);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Invalid required runtime file path: ${relativePath}`);
  }
  return resolvedPath;
}
