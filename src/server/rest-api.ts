import type { ProjectRegistryConfig } from "../config/project-registry-types.js";
import type { EnvironmentPolicyService } from "../config/environment-policy.js";
import type { Journal } from "../journal/journal.js";
import type { DeployOrchestrator } from "../operation/deploy-orchestrator.js";
import type { DeploymentInventoryService } from "../operation/deployment-inventory-service.js";
import type { OperationLogService } from "../operation/operation-log-service.js";
import type { ProjectInspectionService } from "../operation/project-inspection-service.js";
import type { ProjectValidationService } from "../operation/project-validation-service.js";
import type { HiveForgeInfo } from "../app-info.js";
import type { ReleaseDeployOperationRequest } from "../release/release-deploy-service.js";
import type { ReleaseImageTemplate } from "../release/release-deploy-contract.js";
import { HttpError, readJsonBody } from "./json-http.js";
import type { HttpRoute } from "./http-types.js";

const LIFECYCLE_ACTIONS = new Set(["deploy", "remove", "purge", "update", "upgrade"]);

export interface RestApiServices {
  appInfo: HiveForgeInfo;
  projectRegistry: ProjectRegistryConfig;
  journal: Journal;
  inspection: ProjectInspectionService;
  validation: ProjectValidationService;
  deploy: DeployOrchestrator;
  releaseDeploy?: {
    prepare(request: ReleaseDeployOperationRequest): Promise<unknown>;
  };
  currentEnvironmentId?: string;
  environmentPolicy?: EnvironmentPolicyService;
  deploymentInventory?: DeploymentInventoryService;
  operations?: OperationLogService;
  repositoryInspection?: {
    inspect(request: { repository: string; gitRef: string }): Promise<unknown>;
  };
  projectRegistration?: {
    register(request: { repository: string; gitRef: string }): Promise<unknown>;
  };
  environments?: {
    current: unknown;
    known: unknown[];
  };
}

export function createRestRoutes(services: RestApiServices): HttpRoute[] {
  return [
    {
      method: "GET",
      pattern: /^\/health$/,
      async handle() {
        return {
          status: "ok",
          hiveforge: services.appInfo
        };
      }
    },
    {
      method: "GET",
      pattern: /^\/info$/,
      async handle() {
        return {
          hiveforge: services.appInfo
        };
      }
    },
    {
      method: "GET",
      pattern: /^\/projects$/,
      async handle() {
        return {
          projects: services.projectRegistry.projects.map((project) => ({
            id: project.id,
            name: project.name,
            source: project.source,
            repository: project.repository,
            approvedRefs: project.approvedRefs
          }))
        };
      }
    },
    {
      method: "GET",
      pattern: /^\/environments$/,
      async handle() {
        return services.environments ?? { current: null, known: [] };
      }
    },
    {
      method: "GET",
      pattern: /^\/deployments$/,
      async handle() {
        if (!services.deploymentInventory) {
          throw new HttpError(501, "Deployment inventory is not configured");
        }
        return services.deploymentInventory.list();
      }
    },
    {
      method: "GET",
      pattern: /^\/operations$/,
      async handle() {
        if (!services.operations) {
          throw new HttpError(501, "Operation logs are not configured");
        }
        return services.operations.list();
      }
    },
    {
      method: "GET",
      pattern: /^\/operations\/(?<operationId>[A-Za-z0-9_-]+)$/,
      async handle({ params }) {
        if (!services.operations) {
          throw new HttpError(501, "Operation logs are not configured");
        }
        const operation = services.operations.get(params.operationId);
        if (!operation) {
          throw new HttpError(404, `Operation not found: ${params.operationId}`);
        }
        return operation;
      }
    },
    {
      method: "POST",
      pattern: /^\/repositories\/inspect$/,
      async handle({ request }) {
        if (!services.repositoryInspection) {
          throw new HttpError(501, "Repository inspection is not configured");
        }
        const body = await readRepositoryInspectionRequest(request);
        return services.repositoryInspection.inspect(body);
      }
    },
    {
      method: "POST",
      pattern: /^\/projects\/register$/,
      async handle({ request }) {
        if (!services.projectRegistration) {
          throw new HttpError(501, "Project registration is not configured");
        }
        const body = await readRepositoryInspectionRequest(request);
        try {
          return await services.projectRegistration.register(body);
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : "Project registration failed");
        }
      }
    },
    {
      method: "POST",
      pattern: /^\/projects\/(?<projectId>[a-z][a-z0-9-]*)\/inspect$/,
      async handle({ request, params }) {
        const body = await readRefRequest(request);
        const result = await services.inspection.inspect({
          projectId: params.projectId,
          gitRef: body.gitRef
        });
        return {
          operationId: result.operationId,
          projectId: result.projectId,
          repository: result.repository,
          gitRef: result.gitRef,
          components: result.registry.components.map((component) => component.name)
        };
      }
    },
    {
      method: "POST",
      pattern: /^\/projects\/(?<projectId>[a-z][a-z0-9-]*)\/validate$/,
      async handle({ request, params }) {
        const body = await readProfiledRefRequest(request);
        const inspection = await services.inspection.inspect({
          projectId: params.projectId,
          gitRef: body.gitRef
        });
        const validation = await services.validation.validate({
          projectId: inspection.projectId,
          repository: inspection.repository,
          gitRef: inspection.gitRef,
          registry: inspection.registry,
          environment: body.profile ? { HIVEFORGE_PROFILE: body.profile } : {}
        });
        return {
          operationId: validation.operationId,
          ok: validation.report.ok,
          issues: validation.report.issues
        };
      }
    },
    {
      method: "POST",
      pattern: /^\/projects\/(?<projectId>[a-z][a-z0-9-]*)\/actions\/(?<component>[a-z][a-z0-9-]*)\/(?<action>[a-z][a-z0-9-]*)$/,
      async handle({ request, params }) {
        if (!LIFECYCLE_ACTIONS.has(params.action)) {
          throw new HttpError(400, `Unsupported lifecycle action: ${params.action}`);
        }

        const body = await readActionRequest(request);
        assertEnvironmentPolicy(services, {
          projectId: params.projectId,
          action: params.action,
          profile: body.profile
        });
        const result = await services.deploy.deploy({
          projectId: params.projectId,
          gitRef: body.gitRef,
          component: params.component,
          action: params.action,
          environmentId: services.currentEnvironmentId,
          profile: body.profile
        });
        return {
          operationId: result.action.operationId,
          stdout: result.action.stdout,
          stderr: result.action.stderr
        };
      }
    },
    {
      method: "POST",
      pattern: /^\/operations\/projects\/(?<projectId>[a-z][a-z0-9-]*)\/actions\/(?<component>[a-z][a-z0-9-]*)\/(?<action>[a-z][a-z0-9-]*)$/,
      async handle({ request, params }) {
        if (!services.operations) {
          throw new HttpError(501, "Operation logs are not configured");
        }
        if (!LIFECYCLE_ACTIONS.has(params.action)) {
          throw new HttpError(400, `Unsupported lifecycle action: ${params.action}`);
        }

        const body = await readActionRequest(request);
        assertEnvironmentPolicy(services, {
          projectId: params.projectId,
          action: params.action,
          profile: body.profile
        });
        const operation = services.operations.startLifecycleAction({
          projectId: params.projectId,
          gitRef: body.gitRef,
          component: params.component,
          action: params.action,
          environmentId: services.currentEnvironmentId,
          profile: body.profile
        });
        return operation;
      }
    },
    {
      method: "POST",
      pattern: /^\/operations\/projects\/(?<projectId>[a-z][a-z0-9-]*)\/releases\/(?<component>[a-z][a-z0-9-]*)\/(?<action>[a-z][a-z0-9-]*)$/,
      async handle({ request, params }) {
        if (!services.releaseDeploy) {
          throw new HttpError(501, "Release deployment is not configured");
        }
        if (!LIFECYCLE_ACTIONS.has(params.action)) {
          throw new HttpError(400, `Unsupported lifecycle action: ${params.action}`);
        }

        const body = await readReleaseDeployRequest(request, {
          projectId: params.projectId,
          component: params.component,
          action: params.action
        });
        try {
          return await services.releaseDeploy.prepare(body);
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : "Release deployment rejected");
        }
      }
    },
    {
      method: "GET",
      pattern: /^\/journal$/,
      async handle() {
        return {
          events: await services.journal.readAll()
        };
      }
    }
  ];
}

function assertEnvironmentPolicy(
  services: RestApiServices,
  request: { projectId: string; action: string; profile?: string }
): void {
  if (!services.environmentPolicy) {
    return;
  }
  try {
    services.environmentPolicy.assertActionAllowed(request);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "Environment policy rejected action");
  }
}

async function readRefRequest(request: Parameters<typeof readJsonBody>[0]): Promise<{ gitRef: string }> {
  const body = await readJsonBody(request);
  if (!isObject(body) || typeof body.gitRef !== "string" || body.gitRef.length === 0) {
    throw new HttpError(400, "Missing required field: gitRef");
  }
  return { gitRef: body.gitRef };
}

async function readActionRequest(request: Parameters<typeof readJsonBody>[0]): Promise<{ gitRef: string; profile?: string }> {
  return readProfiledRefRequest(request);
}

async function readProfiledRefRequest(
  request: Parameters<typeof readJsonBody>[0]
): Promise<{ gitRef: string; profile?: string }> {
  const body = await readJsonBody(request);
  if (!isObject(body) || typeof body.gitRef !== "string" || body.gitRef.length === 0) {
    throw new HttpError(400, "Missing required field: gitRef");
  }
  if ("profile" in body && (typeof body.profile !== "string" || body.profile.length === 0)) {
    throw new HttpError(400, "Invalid field: profile");
  }
  return {
    gitRef: body.gitRef,
    profile: typeof body.profile === "string" ? body.profile : undefined
  };
}

async function readRepositoryInspectionRequest(
  request: Parameters<typeof readJsonBody>[0]
): Promise<{ repository: string; gitRef: string }> {
  const body = await readJsonBody(request);
  if (!isObject(body) || typeof body.repository !== "string" || body.repository.length === 0) {
    throw new HttpError(400, "Missing required field: repository");
  }
  if (typeof body.gitRef !== "string" || body.gitRef.length === 0) {
    throw new HttpError(400, "Missing required field: gitRef");
  }
  return {
    repository: body.repository,
    gitRef: body.gitRef
  };
}

async function readReleaseDeployRequest(
  request: Parameters<typeof readJsonBody>[0],
  params: { projectId: string; component: string; action: string }
): Promise<ReleaseDeployOperationRequest> {
  const body = await readJsonBody(request);
  if (!isObject(body)) {
    throw new HttpError(400, "Invalid release deploy request body");
  }
  if ("profile" in body && (typeof body.profile !== "string" || body.profile.length === 0)) {
    throw new HttpError(400, "Invalid field: profile");
  }
  if ("gitRef" in body && (typeof body.gitRef !== "string" || body.gitRef.length === 0)) {
    throw new HttpError(400, "Invalid field: gitRef");
  }
  if (!isObject(body.project) && typeof body.gitRef !== "string") {
    throw new HttpError(400, "Missing required field: project");
  }
  if (isObject(body.project) && (typeof body.project.id !== "string" || body.project.id.length === 0)) {
    throw new HttpError(400, "Missing required field: project.id");
  }
  if (!isObject(body.releaseVars)) {
    throw new HttpError(400, "Missing required field: releaseVars");
  }
  if (!Array.isArray(body.images) && !isObject(body.artifact)) {
    throw new HttpError(400, "Missing required field: images or artifact");
  }

  return {
    projectId: params.projectId,
    component: params.component,
    action: params.action,
    ...(typeof body.gitRef === "string" ? { gitRef: body.gitRef } : {}),
    ...(typeof body.profile === "string" ? { profile: body.profile } : {}),
    ...(isObject(body.project)
      ? {
          project: {
            id: body.project.id as string,
            ...(isStringRecord(body.project.vars) ? { vars: body.project.vars } : {}),
            ...(Array.isArray(body.project.profiles)
              ? { profiles: body.project.profiles as NonNullable<ReleaseDeployOperationRequest["project"]>["profiles"] }
              : {})
          }
        }
      : {}),
    ...(isStringRecord(body.vars) ? { environmentVars: body.vars } : {}),
    releaseVars: assertStringRecord(body.releaseVars, "releaseVars"),
    ...(Array.isArray(body.images) ? { images: body.images.map(readReleaseImageTemplate) } : {}),
    ...(isObject(body.artifact) ? { artifact: readReleaseArtifactTemplate(body.artifact) } : {}),
    ...(Array.isArray(body.requiredFiles) ? { requiredFiles: readStringArray(body.requiredFiles, "requiredFiles") } : {})
  };
}

function readReleaseArtifactTemplate(value: Record<string, unknown>): NonNullable<ReleaseDeployOperationRequest["artifact"]> {
  if (!Array.isArray(value.images) || value.images.length === 0) {
    throw new HttpError(400, "Missing required field: artifact.images");
  }
  return {
    images: value.images.map(readReleaseImageTemplate),
    ...(isStringRecord(value.env) ? { env: value.env } : {})
  };
}

function readReleaseImageTemplate(value: unknown): ReleaseImageTemplate {
  if (!isObject(value)) {
    throw new HttpError(400, "Invalid release image entry");
  }
  if (typeof value.name !== "string" || value.name.length === 0) {
    throw new HttpError(400, "Missing required field: images[].name");
  }
  if (typeof value.image !== "string" || value.image.length === 0) {
    throw new HttpError(400, "Missing required field: images[].image");
  }
  if (typeof value.application !== "boolean") {
    throw new HttpError(400, "Missing required field: images[].application");
  }
  return {
    name: value.name,
    image: value.image,
    application: value.application
  };
}

function assertStringRecord(value: unknown, name: string): Record<string, string> {
  if (!isStringRecord(value)) {
    throw new HttpError(400, `Invalid field: ${name}`);
  }
  return value;
}

function readStringArray(value: unknown[], name: string): string[] {
  return value.map((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      throw new HttpError(400, `Invalid field: ${name}[${index}]`);
    }
    return item;
  });
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isObject(value)) {
    return false;
  }
  return Object.values(value).every((item) => typeof item === "string");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
