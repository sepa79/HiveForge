import type { ProjectRegistryConfig } from "../config/project-registry-types.js";
import type { EnvironmentPolicyService } from "../config/environment-policy.js";
import type {
  SetEnvironmentProjectPolicyRequest,
  SetEnvironmentProjectPolicyResult
} from "../config/environment-policy-editor.js";
import type { EnvironmentRefreshResult } from "../config/environment-refresh-service.js";
import type { Journal } from "../journal/journal.js";
import type { DeployOrchestrator } from "../operation/deploy-orchestrator.js";
import type { DeploymentInventoryService } from "../operation/deployment-inventory-service.js";
import type { DeploymentComposeService } from "../operation/deployment-compose-service.js";
import type { DeploymentDiagnosticsService } from "../operation/deployment-diagnostics-service.js";
import type {
  DeploymentRuntimeStatusRequest,
  DeploymentRuntimeStatusService
} from "../operation/deployment-runtime-status-service.js";
import type {
  DeploymentMode,
  DeployPrerequisitesRequest,
  DeployPrerequisitesService
} from "../operation/deploy-prerequisites-service.js";
import type { OperationLogService } from "../operation/operation-log-service.js";
import type { ProjectInspectionService } from "../operation/project-inspection-service.js";
import type { ProjectValidationService } from "../operation/project-validation-service.js";
import type { HiveForgeInfo } from "../app-info.js";
import type { ReleaseDeployOperationRequest } from "../release/release-deploy-service.js";
import type { ReleaseImageTemplate } from "../release/release-deploy-contract.js";
import type { EnvironmentDefinition } from "../config/environment-types.js";
import type { RuntimeEnvStore } from "../config/runtime-env-store.js";
import type { RuntimeDiagnosticsService } from "../runtime/runtime-diagnostics-service.js";
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
  currentEnvironment?: EnvironmentDefinition;
  environmentPolicy?: EnvironmentPolicyService;
  deploymentInventory?: DeploymentInventoryService;
  deploymentCompose?: DeploymentComposeService;
  deploymentDiagnostics?: DeploymentDiagnosticsService;
  deploymentRuntimeStatus?: DeploymentRuntimeStatusService;
  deployPrerequisites?: DeployPrerequisitesService;
  operations?: OperationLogService;
  runtimeEnv?: RuntimeEnvStore;
  runtimeDiagnostics?: RuntimeDiagnosticsService;
  repositoryInspection?: {
    inspect(request: { repository: string; gitRef: string }): Promise<unknown>;
  };
  projectRegistration?: {
    register(request: { repository: string; gitRef: string }): Promise<unknown>;
  };
  environmentPolicyEditor?: {
    setProjectPolicy(request: SetEnvironmentProjectPolicyRequest): Promise<SetEnvironmentProjectPolicyResult>;
  };
  environmentRefresh?: {
    refreshCurrent(): Promise<EnvironmentRefreshResult>;
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
      method: "POST",
      pattern: /^\/environments\/refresh$/,
      async handle() {
        if (!services.environmentRefresh) {
          throw new HttpError(501, "Environment refresh is not configured");
        }
        try {
          return await services.environmentRefresh.refreshCurrent();
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : "Environment refresh failed");
        }
      }
    },
    {
      method: "GET",
      pattern: /^\/diagnostics\/runtime$/,
      async handle() {
        if (!services.runtimeDiagnostics) {
          throw new HttpError(501, "Runtime diagnostics are not configured");
        }
        return await services.runtimeDiagnostics.diagnose();
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
      pattern: /^\/deployments\/(?<operationId>[A-Za-z0-9_-]+)\/compose$/,
      async handle({ params }) {
        if (!services.deploymentCompose) {
          throw new HttpError(501, "Deployment compose lookup is not configured");
        }
        return services.deploymentCompose.get(params.operationId);
      }
    },
    {
      method: "POST",
      pattern: /^\/deployments\/runtime-status$/,
      async handle({ request }) {
        if (!services.deploymentRuntimeStatus) {
          throw new HttpError(501, "Deployment runtime status is not configured");
        }
        return services.deploymentRuntimeStatus.check(await readDeploymentRuntimeStatusRequest(request));
      }
    },
    {
      method: "POST",
      pattern: /^\/deployments\/diagnostics$/,
      async handle({ request }) {
        if (!services.deploymentDiagnostics) {
          throw new HttpError(501, "Deployment diagnostics are not configured");
        }
        return services.deploymentDiagnostics.diagnose(await readDeploymentRuntimeStatusRequest(request));
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
        const repositoryInspection = services.repositoryInspection;
        if (!repositoryInspection) {
          throw new HttpError(501, "Repository inspection is not configured");
        }
        if (!services.operations) {
          throw new HttpError(501, "Operation logs are not configured");
        }
        const body = await readRepositoryInspectionRequest(request);
        const { operation, result } = await services.operations.runPreDeployAttempt(
          {
            kind: "repository_inspection",
            repository: body.repository,
            gitRef: body.gitRef
          },
          () => repositoryInspection.inspect(body),
          deployableFailureReason
        );
        return withOperationId(result, operation.operationId);
      }
    },
    {
      method: "POST",
      pattern: /^\/projects\/register$/,
      async handle({ request }) {
        const projectRegistration = services.projectRegistration;
        if (!projectRegistration) {
          throw new HttpError(501, "Project registration is not configured");
        }
        if (!services.operations) {
          throw new HttpError(501, "Operation logs are not configured");
        }
        const body = await readRepositoryInspectionRequest(request);
        try {
          const { operation, result } = await services.operations.runPreDeployAttempt(
            {
              kind: "project_registration",
            repository: body.repository,
            gitRef: body.gitRef
          },
            () => projectRegistration.register(body)
          );
          return withOperationId(result, operation.operationId);
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : "Project registration failed");
        }
      }
    },
    {
      method: "GET",
      pattern: /^\/projects\/(?<projectId>[a-z][a-z0-9-]*)\/runtime-env$/,
      async handle({ params }) {
        if (!services.runtimeEnv) {
          throw new HttpError(501, "Runtime env config is not configured");
        }
        assertRegisteredProject(services, params.projectId);
        return services.runtimeEnv.listProject(params.projectId);
      }
    },
    {
      method: "PUT",
      pattern: /^\/projects\/(?<projectId>[a-z][a-z0-9-]*)\/runtime-env$/,
      async handle({ request, params }) {
        if (!services.runtimeEnv) {
          throw new HttpError(501, "Runtime env config is not configured");
        }
        assertRegisteredProject(services, params.projectId);
        const body = await readRuntimeEnvSetRequest(request);
        try {
          return await services.runtimeEnv.set({
            projectId: params.projectId,
            ...(body.profile ? { profile: body.profile } : {}),
            values: body.values
          });
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : "Runtime env update failed");
        }
      }
    },
    {
      method: "POST",
      pattern: /^\/projects\/(?<projectId>[a-z][a-z0-9-]*)\/runtime-env\/unset$/,
      async handle({ request, params }) {
        if (!services.runtimeEnv) {
          throw new HttpError(501, "Runtime env config is not configured");
        }
        assertRegisteredProject(services, params.projectId);
        const body = await readRuntimeEnvUnsetRequest(request);
        try {
          return await services.runtimeEnv.unset({
            projectId: params.projectId,
            ...(body.profile ? { profile: body.profile } : {}),
            keys: body.keys
          });
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : "Runtime env update failed");
        }
      }
    },
    {
      method: "PUT",
      pattern: /^\/environments\/(?<environmentId>[a-z][a-z0-9-]*)\/policy\/projects\/(?<projectId>[a-z][a-z0-9-]*)$/,
      async handle({ request, params }) {
        if (!services.environmentPolicyEditor) {
          throw new HttpError(501, "Environment policy editing is not configured");
        }
        const body = await readEnvironmentProjectPolicyRequest(request);
        try {
          return await services.environmentPolicyEditor.setProjectPolicy({
            environmentId: params.environmentId,
            projectId: params.projectId,
            actions: body.actions,
            ...(body.profiles ? { profiles: body.profiles } : {})
          });
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : "Environment policy update failed");
        }
      }
    },
    {
      method: "POST",
      pattern: /^\/projects\/(?<projectId>[a-z][a-z0-9-]*)\/inspect$/,
      async handle({ request, params }) {
        if (!services.operations) {
          throw new HttpError(501, "Operation logs are not configured");
        }
        const body = await readRefRequest(request);
        const { operation, result } = await services.operations.runPreDeployAttempt(
          {
            kind: "project_inspection",
            projectId: params.projectId,
            gitRef: body.gitRef
          },
          () =>
            services.inspection.inspect({
              projectId: params.projectId,
              gitRef: body.gitRef
            })
        );
        return {
          operationId: operation.operationId,
          inspectionOperationId: result.operationId,
          projectId: result.projectId,
          repository: result.repository,
          gitRef: result.gitRef,
          components: result.registry.components.map((component) => ({
            name: component.name,
            actions: Object.keys(component.manifest.deployment.actions)
          }))
        };
      }
    },
    {
      method: "POST",
      pattern: /^\/projects\/(?<projectId>[a-z][a-z0-9-]*)\/validate$/,
      async handle({ request, params }) {
        const body = await readProfiledRefRequest(request);
        const runtimeEnv = services.runtimeEnv
          ? await services.runtimeEnv.resolve({
              projectId: params.projectId,
              ...(body.profile ? { profile: body.profile } : {})
            })
          : {};
        const inspection = await services.inspection.inspect({
          projectId: params.projectId,
          gitRef: body.gitRef
        });
        try {
          const validation = await services.validation.validate({
            projectId: inspection.projectId,
            repository: inspection.repository,
            gitRef: inspection.gitRef,
            registry: inspection.registry,
            environment: {
              ...runtimeEnv,
              ...(body.profile ? { HIVEFORGE_PROFILE: body.profile } : {})
            },
            deploymentEnvironment: services.currentEnvironment,
            profile: body.profile
          });
          return {
            operationId: validation.operationId,
            ok: validation.report.ok,
            issues: validation.report.issues
          };
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : "Requirement validation failed");
        }
      }
    },
    {
      method: "POST",
      pattern: /^\/projects\/(?<projectId>[a-z][a-z0-9-]*)\/deploy-prerequisites$/,
      async handle({ request, params }) {
        if (!services.deployPrerequisites) {
          throw new HttpError(501, "Deploy prerequisites are not configured");
        }
        const body = await readDeployPrerequisitesRequest(request, params.projectId);
        try {
          return await services.deployPrerequisites.explain(body);
        } catch (error) {
          throw new HttpError(400, error instanceof Error ? error.message : "Deploy prerequisites check failed");
        }
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
          profile: body.profile,
          deploymentName: body.deploymentName
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
          profile: body.profile,
          deploymentName: body.deploymentName
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

function deployableFailureReason(result: unknown): string | null {
  if (!isObjectRecord(result) || result.deployable !== false) {
    return null;
  }
  return typeof result.reason === "string" && result.reason.length > 0
    ? result.reason
    : "Repository is not deployable by HiveForge";
}

function withOperationId(result: unknown, operationId: string): unknown {
  if (isObjectRecord(result)) {
    return {
      ...result,
      operationId
    };
  }
  return {
    operationId,
    result
  };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function assertRegisteredProject(services: RestApiServices, projectId: string): void {
  if (!services.projectRegistry.projects.some((project) => project.id === projectId)) {
    throw new HttpError(404, `Project is not registered: ${projectId}`);
  }
}

async function readRefRequest(request: Parameters<typeof readJsonBody>[0]): Promise<{ gitRef: string }> {
  const body = await readJsonBody(request);
  if (!isObject(body) || typeof body.gitRef !== "string" || body.gitRef.length === 0) {
    throw new HttpError(400, "Missing required field: gitRef");
  }
  return { gitRef: body.gitRef };
}

async function readActionRequest(
  request: Parameters<typeof readJsonBody>[0]
): Promise<{ gitRef: string; profile?: string; deploymentName?: string }> {
  return readProfiledRefRequest(request);
}

async function readProfiledRefRequest(
  request: Parameters<typeof readJsonBody>[0]
): Promise<{ gitRef: string; profile?: string; deploymentName?: string }> {
  const body = await readJsonBody(request);
  if (!isObject(body) || typeof body.gitRef !== "string" || body.gitRef.length === 0) {
    throw new HttpError(400, "Missing required field: gitRef");
  }
  if ("profile" in body && (typeof body.profile !== "string" || body.profile.length === 0)) {
    throw new HttpError(400, "Invalid field: profile");
  }
  if ("deploymentName" in body && (typeof body.deploymentName !== "string" || !isDockerDeploymentName(body.deploymentName))) {
    throw new HttpError(400, "Invalid field: deploymentName");
  }
  return {
    gitRef: body.gitRef,
    profile: typeof body.profile === "string" ? body.profile : undefined,
    deploymentName: typeof body.deploymentName === "string" ? body.deploymentName : undefined
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

async function readRuntimeEnvSetRequest(
  request: Parameters<typeof readJsonBody>[0]
): Promise<{ profile?: string; values: Record<string, string> }> {
  const body = await readJsonBody(request);
  if (!isObject(body)) {
    throw new HttpError(400, "Invalid runtime env request body");
  }
  if ("profile" in body && (typeof body.profile !== "string" || body.profile.length === 0)) {
    throw new HttpError(400, "Invalid field: profile");
  }
  if (!isStringRecord(body.values)) {
    throw new HttpError(400, "Invalid field: values");
  }
  return {
    ...(typeof body.profile === "string" ? { profile: body.profile } : {}),
    values: body.values
  };
}

async function readRuntimeEnvUnsetRequest(
  request: Parameters<typeof readJsonBody>[0]
): Promise<{ profile?: string; keys: string[] }> {
  const body = await readJsonBody(request);
  if (!isObject(body)) {
    throw new HttpError(400, "Invalid runtime env request body");
  }
  if ("profile" in body && (typeof body.profile !== "string" || body.profile.length === 0)) {
    throw new HttpError(400, "Invalid field: profile");
  }
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new HttpError(400, "Missing required field: keys");
  }
  return {
    ...(typeof body.profile === "string" ? { profile: body.profile } : {}),
    keys: readStringArray(body.keys, "keys")
  };
}

async function readDeployPrerequisitesRequest(
  request: Parameters<typeof readJsonBody>[0],
  projectId: string
): Promise<DeployPrerequisitesRequest> {
  const body = await readJsonBody(request);
  if (!isObject(body)) {
    throw new HttpError(400, "Invalid deploy prerequisites request body");
  }
  if (typeof body.gitRef !== "string" || body.gitRef.length === 0) {
    throw new HttpError(400, "Missing required field: gitRef");
  }
  if (typeof body.component !== "string" || body.component.length === 0) {
    throw new HttpError(400, "Missing required field: component");
  }
  if (typeof body.action !== "string" || !LIFECYCLE_ACTIONS.has(body.action)) {
    throw new HttpError(400, `Unsupported lifecycle action: ${String(body.action)}`);
  }
  if ("profile" in body && (typeof body.profile !== "string" || body.profile.length === 0)) {
    throw new HttpError(400, "Invalid field: profile");
  }
  if ("deploymentMode" in body && body.deploymentMode !== "action" && body.deploymentMode !== "release") {
    throw new HttpError(400, "Invalid field: deploymentMode");
  }
  if ("vars" in body && !isStringRecord(body.vars)) {
    throw new HttpError(400, "Invalid field: vars");
  }
  if ("releaseVars" in body && !isStringRecord(body.releaseVars)) {
    throw new HttpError(400, "Invalid field: releaseVars");
  }

  return {
    projectId,
    gitRef: body.gitRef,
    component: body.component,
    action: body.action,
    ...(typeof body.profile === "string" ? { profile: body.profile } : {}),
    ...(typeof body.deploymentMode === "string" ? { deploymentMode: body.deploymentMode as DeploymentMode } : {}),
    ...(isStringRecord(body.vars) ? { vars: body.vars } : {}),
    ...(isStringRecord(body.releaseVars) ? { releaseVars: body.releaseVars } : {}),
    ...(Array.isArray(body.images) ? { images: body.images } : {}),
    ...(isObject(body.artifact) ? { artifact: body.artifact } : {})
  };
}

async function readEnvironmentProjectPolicyRequest(
  request: Parameters<typeof readJsonBody>[0]
): Promise<{ actions: Array<"deploy" | "remove" | "purge" | "update" | "upgrade">; profiles?: string[] }> {
  const body = await readJsonBody(request);
  if (!isObject(body) || !Array.isArray(body.actions) || body.actions.length === 0) {
    throw new HttpError(400, "Missing required field: actions");
  }
  const actions = body.actions.map((action) => {
    if (typeof action !== "string" || !LIFECYCLE_ACTIONS.has(action)) {
      throw new HttpError(400, `Unsupported lifecycle action: ${String(action)}`);
    }
    return action as "deploy" | "remove" | "purge" | "update" | "upgrade";
  });
  if ("profiles" in body && !Array.isArray(body.profiles)) {
    throw new HttpError(400, "Invalid field: profiles");
  }
  const profiles = Array.isArray(body.profiles)
    ? body.profiles.map((profile) => {
        if (typeof profile !== "string" || profile.length === 0) {
          throw new HttpError(400, "Invalid field: profiles");
        }
        return profile;
      })
    : undefined;

  return {
    actions,
    ...(profiles ? { profiles } : {})
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

async function readDeploymentRuntimeStatusRequest(
  request: Parameters<typeof readJsonBody>[0]
): Promise<DeploymentRuntimeStatusRequest> {
  const body = await readJsonBody(request);
  if (!isObject(body)) {
    throw new HttpError(400, "Invalid deployment runtime status request body");
  }
  if ("deploymentId" in body && (typeof body.deploymentId !== "string" || body.deploymentId.length === 0)) {
    throw new HttpError(400, "Invalid field: deploymentId");
  }
  if ("projectId" in body && (typeof body.projectId !== "string" || body.projectId.length === 0)) {
    throw new HttpError(400, "Invalid field: projectId");
  }
  if ("component" in body && (typeof body.component !== "string" || body.component.length === 0)) {
    throw new HttpError(400, "Invalid field: component");
  }
  if ("profile" in body && (typeof body.profile !== "string" || body.profile.length === 0)) {
    throw new HttpError(400, "Invalid field: profile");
  }
  if (!body.deploymentId && (!body.projectId || !body.component)) {
    throw new HttpError(400, "Missing required field: deploymentId or projectId and component");
  }

  return {
    ...(typeof body.deploymentId === "string" ? { deploymentId: body.deploymentId } : {}),
    ...(typeof body.projectId === "string" ? { projectId: body.projectId } : {}),
    ...(typeof body.component === "string" ? { component: body.component } : {}),
    ...(typeof body.profile === "string" ? { profile: body.profile } : {})
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

function isDockerDeploymentName(value: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(value);
}
