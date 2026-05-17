import type { ProjectActionResult, ProjectActionService } from "./project-action-service.js";
import type { ProjectInspectionResult, ProjectInspectionService } from "./project-inspection-service.js";
import type { ProjectValidationResult, ProjectValidationService } from "./project-validation-service.js";

export interface DeployRequest {
  projectId: string;
  gitRef: string;
  component: string;
  action: string;
  environmentId?: string;
  profile?: string;
  progress?: DeployProgressReporter;
}

export type DeployProgressStage = "inspect" | "validate" | "action";
export type DeployProgressStatus = "running" | "succeeded";
export type DeployProgressReporter = (event: {
  stage: DeployProgressStage;
  status: DeployProgressStatus;
  message: string;
}) => void;

export interface DeployResult {
  inspection: ProjectInspectionResult;
  validation: ProjectValidationResult;
  action: ProjectActionResult;
}

export class DeployOrchestrator {
  constructor(
    private readonly inspectionService: ProjectInspectionService,
    private readonly validationService: ProjectValidationService,
    private readonly actionService: ProjectActionService
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
      environment: request.profile ? { HIVEFORGE_PROFILE: request.profile } : {}
    });
    request.progress?.({
      stage: "validate",
      status: "succeeded",
      message: "Runtime requirements are valid"
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
      profile: request.profile
    });
    request.progress?.({
      stage: "action",
      status: "succeeded",
      message: `${request.action} completed: ${action.operationId}`
    });

    return { inspection, validation, action };
  }
}
