import type { ProjectActionResult, ProjectActionService } from "./project-action-service.js";
import type { ProjectInspectionResult, ProjectInspectionService } from "./project-inspection-service.js";
import type { ProjectValidationResult, ProjectValidationService } from "./project-validation-service.js";
import { managedFilesEnvironment, type ManagedFilesResult, type ManagedFilesService } from "./managed-files-service.js";
import type { EnvironmentDefinition } from "../config/environment-types.js";
import type { RuntimeEnvScope } from "../config/runtime-env-store.js";
import {
  ACTIVE_LIFECYCLE_ACTIONS,
  INACTIVE_LIFECYCLE_ACTIONS,
  type DeploymentStateStore,
  type EnsureDeploymentInput
} from "./deployment-state-store.js";
import type { DockerDeploymentService } from "./docker-deployment-service.js";

export interface DeployRequest {
  projectId: string;
  gitRef: string;
  component: string;
  action: string;
  environmentId?: string;
  profile?: string;
  deploymentName?: string;
  progress?: DeployProgressReporter;
}

export type DeployProgressStage = "inspect" | "validate" | "managed_files" | "action" | "docker_deploy";
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
    private readonly runtimeEnv?: RuntimeEnvProvider,
    private readonly deploymentState?: DeploymentStateStore,
    private readonly dockerDeployment?: DockerDeploymentService
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

    if (INACTIVE_LIFECYCLE_ACTIONS.has(request.action)) {
      return this.removeDockerDeployment({
        request,
        inspection,
        validation
      });
    }

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
      environment: actionEnvironment(resolvedRuntimeEnv, managedFiles, request.profile),
      afterRun: async ({ operationId, endedAt }) =>
        this.afterActionRendered({
          request,
          inspection,
          managedFiles,
          operationId,
          updatedAt: endedAt
        })
    });
    request.progress?.({
      stage: "action",
      status: "succeeded",
      message: `${request.action} completed: ${action.operationId}`
    });

    return { inspection, validation, managedFiles, action };
  }

  private async removeDockerDeployment(input: RemoveDockerDeploymentInput): Promise<DeployResult> {
    assertActionDeclared(input.inspection.registry, input.request.component, input.request.action);

    input.request.progress?.({
      stage: "action",
      status: "running",
      message: `Running ${input.request.action} for ${input.request.component}`
    });

    if (!this.deploymentState) {
      throw new Error("HiveForge-owned Docker removal requires deployment state.");
    }
    if (!this.dockerDeployment) {
      throw new Error("HiveForge-owned Docker removal is not configured.");
    }
    const environmentId = input.request.environmentId;
    if (!environmentId) {
      throw new Error("HiveForge-owned Docker removal requires environmentId.");
    }

    const stateInput = {
      environment: environmentId,
      ...(input.request.deploymentName ? { deploymentName: input.request.deploymentName } : {}),
      project: input.inspection.projectId,
      repository: input.inspection.repository,
      gitRef: input.inspection.gitRef,
      component: input.request.component,
      ...(input.request.profile ? { profile: input.request.profile } : {}),
      action: input.request.action,
      operationId: `${input.request.action}-${Date.now()}`,
      updatedAt: new Date().toISOString()
    };
    const deployment = await this.deploymentState.ensureDeployment(stateInput);

    try {
      await this.dockerDeployment.remove({
        deploymentId: deployment.deploymentId,
        deploymentName: deployment.deploymentName,
        project: deployment.project,
        component: deployment.component,
        ...(deployment.profile ? { profile: deployment.profile } : {})
      });
    } catch (error) {
      return recordFailureAndThrow(this.deploymentState, stateInput, error);
    }

    const recorded = await this.deploymentState.recordLifecycleAction(stateInput);
    input.request.progress?.({
      stage: "action",
      status: "succeeded",
      message: `${input.request.action} completed: ${stateInput.operationId}`
    });
    return {
      inspection: input.inspection,
      validation: input.validation,
      action: {
        operationId: stateInput.operationId,
        ...(recorded?.deploymentId ? { deploymentId: recorded.deploymentId } : {}),
        stdout: "",
        stderr: ""
      }
    };
  }

  private async afterActionRendered(input: AfterActionRenderedInput): Promise<{ deploymentId?: string }> {
    if (!this.deploymentState) {
      return {};
    }
    const environmentId = input.request.environmentId;
    if (!environmentId) {
      throw new Error("HiveForge-owned deployment requires environmentId.");
    }

    const stateInput = {
      environment: environmentId,
      ...(input.request.deploymentName ? { deploymentName: input.request.deploymentName } : {}),
      project: input.inspection.projectId,
      repository: input.inspection.repository,
      gitRef: input.inspection.gitRef,
      component: input.request.component,
      ...(input.request.profile ? { profile: input.request.profile } : {}),
      action: input.request.action,
      operationId: input.operationId,
      updatedAt: input.updatedAt
    };
    const deployment = await this.deploymentState.ensureDeployment(stateInput);

    if (!ACTIVE_LIFECYCLE_ACTIONS.has(input.request.action)) {
      await this.deploymentState.recordLifecycleAction(stateInput);
      return { deploymentId: deployment.deploymentId };
    }

    if (!this.dockerDeployment) {
      return recordFailureAndThrow(
        this.deploymentState,
        stateInput,
        new Error("HiveForge-owned Docker deployment is not configured.")
      );
    }
    if (!input.managedFiles?.renderedComposeFile) {
      return recordFailureAndThrow(
        this.deploymentState,
        stateInput,
        new Error("HiveForge-owned Docker deployment requires HIVEFORGE_RENDERED_COMPOSE_FILE.")
      );
    }

    input.request.progress?.({
      stage: "docker_deploy",
      status: "running",
      message: `Deploying ${deployment.deploymentId} through HiveForge Docker executor`
    });
    try {
      await this.dockerDeployment.deploy({
        deploymentId: deployment.deploymentId,
        deploymentName: deployment.deploymentName,
        project: deployment.project,
        component: deployment.component,
        ...(deployment.profile ? { profile: deployment.profile } : {}),
        composeFile: input.managedFiles.renderedComposeFile,
        ...(input.managedFiles.bindSourceDir ? { bindSourceDir: input.managedFiles.bindSourceDir } : {})
      });
    } catch (error) {
      return recordFailureAndThrow(this.deploymentState, stateInput, error);
    }
    await this.deploymentState.recordLifecycleAction(stateInput);
    input.request.progress?.({
      stage: "docker_deploy",
      status: "succeeded",
      message: `Docker deployment completed: ${deployment.deploymentId}`
    });
    return { deploymentId: deployment.deploymentId };
  }
}

interface AfterActionRenderedInput {
  request: DeployRequest;
  inspection: ProjectInspectionResult;
  managedFiles?: ManagedFilesResult;
  operationId: string;
  updatedAt: string;
}

interface RemoveDockerDeploymentInput {
  request: DeployRequest;
  inspection: ProjectInspectionResult;
  validation: ProjectValidationResult;
}

function assertActionDeclared(registry: ProjectInspectionResult["registry"], componentName: string, actionName: string): void {
  const component = registry.components.find((candidate) => candidate.name === componentName);
  const actions = component?.manifest.deployment?.actions;
  if (!actions || !Object.prototype.hasOwnProperty.call(actions, actionName)) {
    throw new Error(`Action is not declared for ${componentName}: ${actionName}`);
  }
}

async function recordFailureAndThrow(
  deploymentState: DeploymentStateStore,
  input: EnsureDeploymentInput,
  error: unknown
): Promise<never> {
  await deploymentState.recordDeploymentFailure({
    ...input,
    reason: error instanceof Error ? error.message : String(error)
  });
  throw error;
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
