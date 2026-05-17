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
}

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
    const inspection = await this.inspectionService.inspect({
      projectId: request.projectId,
      gitRef: request.gitRef
    });

    const validation = await this.validationService.validate({
      projectId: inspection.projectId,
      repository: inspection.repository,
      gitRef: inspection.gitRef,
      registry: inspection.registry,
      environment: request.profile ? { HIVEFORGE_PROFILE: request.profile } : {}
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

    return { inspection, validation, action };
  }
}
