import type { ProjectActionResult, ProjectActionService } from "./project-action-service.js";
import type { ProjectInspectionResult, ProjectInspectionService } from "./project-inspection-service.js";
import type { ProjectValidationResult, ProjectValidationService } from "./project-validation-service.js";
import { managedFilesEnvironment, type ManagedFilesResult, type ManagedFilesService } from "./managed-files-service.js";
import type { EnvironmentDefinition } from "../config/environment-types.js";
import type { RuntimeEnvScope } from "../config/runtime-env-store.js";

export interface DeployRequest {
  projectId: string;
  gitRef: string;
  component: string;
  action: string;
  environmentId?: string;
  profile?: string;
  progress?: DeployProgressReporter;
}

export type DeployProgressStage = "inspect" | "validate" | "managed_files" | "action";
export type DeployProgressStatus = "running" | "succeeded";
export type DeployProgressReporter = (event: {
  stage: DeployProgressStage;
  status: DeployProgressStatus;
  message: string;
}) => void;

export interface DeployResult {
  inspection: ProjectInspectionResult;
  validation: ProjectValidationResult;
  managedFiles?: ManagedFilesResult;
  action: ProjectActionResult;
}

export interface RuntimeEnvProvider {
  resolve(scope: RuntimeEnvScope): Promise<NodeJS.ProcessEnv>;
}

export class DeployOrchestrator {
  constructor(
    private readonly inspectionService: ProjectInspectionService,
    private readonly validationService: ProjectValidationService,
    private readonly actionService: ProjectActionService,
    private readonly managedFilesService?: ManagedFilesService,
    private readonly environment?: EnvironmentDefinition,
    private readonly runtimeEnv?: RuntimeEnvProvider
  ) {}

  async deploy(request: DeployRequest): Promise<DeployResult> {
    request.progress?.({
      stage: "inspect",
      status: "running",
      message: `Checking out and inspecting ${request.projectId}@${request.gitRef}`
    });
    const inspection = await this.inspectionService.inspect({
      projectId: request.projectId,
      gitRef: request.gitRef
    });
    request.progress?.({
      stage: "inspect",
      status: "succeeded",
      message: `Loaded ${inspection.registry.components.length} component(s)`
    });
    const resolvedRuntimeEnv = this.runtimeEnv
      ? await this.runtimeEnv.resolve({
          projectId: inspection.projectId,
          ...(request.profile ? { profile: request.profile } : {})
        })
      : {};

    request.progress?.({
      stage: "validate",
      status: "running",
      message: "Validating runtime requirements"
    });
    const validation = await this.validationService.validate({
      projectId: inspection.projectId,
      repository: inspection.repository,
      gitRef: inspection.gitRef,
      registry: inspection.registry,
      environment: actionEnvironment(resolvedRuntimeEnv, undefined, request.profile),
      deploymentEnvironment: this.environment,
      profile: request.profile
    });
    request.progress?.({
      stage: "validate",
      status: "succeeded",
      message: "Runtime requirements are valid"
    });

    request.progress?.({
      stage: "managed_files",
      status: "running",
      message: "Preparing managed files"
    });
    const managedFiles = this.managedFilesService
      ? await this.managedFilesService.prepare({
          projectId: inspection.projectId,
          workspacePath: inspection.workspacePath,
          registry: inspection.registry
        })
      : undefined;
    request.progress?.({
      stage: "managed_files",
      status: "succeeded",
      message: managedFiles ? `Prepared ${managedFiles.prepared.length} managed path(s)` : "No managed files configured"
    });

    request.progress?.({
      stage: "action",
      status: "running",
      message: `Running ${request.action} for ${request.component}`
    });
    const action = await this.actionService.run({
      projectId: inspection.projectId,
      repository: inspection.repository,
      gitRef: inspection.gitRef,
      workspacePath: inspection.workspacePath,
      registry: inspection.registry,
      component: request.component,
      action: request.action,
      environmentId: request.environmentId,
      profile: request.profile,
      environment: actionEnvironment(resolvedRuntimeEnv, managedFiles, request.profile)
    });
    request.progress?.({
      stage: "action",
      status: "succeeded",
      message: `${request.action} completed: ${action.operationId}`
    });

    return { inspection, validation, managedFiles, action };
  }
}

function actionEnvironment(
  runtimeEnv: NodeJS.ProcessEnv,
  managedFiles: ManagedFilesResult | undefined,
  profile: string | undefined
): NodeJS.ProcessEnv {
  return {
    ...runtimeEnv,
    ...(managedFiles ? managedFilesEnvironment(managedFiles) : {}),
    ...(profile ? { HIVEFORGE_PROFILE: profile } : {})
  };
}
