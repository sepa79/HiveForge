import type { Journal } from "../journal/journal.js";
import type { ProjectRegistry } from "../manifest/manifest-types.js";
import type { RequirementValidationReport } from "../validation/requirement-validator.js";
import { RequirementValidationError, RequirementValidator } from "../validation/requirement-validator.js";
import type { Clock } from "./clock.js";
import type { IdGenerator } from "./id-generator.js";

export interface ProjectValidationRequest {
  projectId: string;
  repository: string;
  gitRef: string;
  registry: ProjectRegistry;
  environment?: NodeJS.ProcessEnv;
}

export interface ProjectValidationResult {
  operationId: string;
  report: RequirementValidationReport;
}

export class ProjectValidationService {
  constructor(
    private readonly validator: RequirementValidator,
    private readonly journal: Journal,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async validate(request: ProjectValidationRequest): Promise<ProjectValidationResult> {
    const operationId = this.ids.nextId("op");
    const startedAt = this.clock.now().toISOString();

    try {
      const report = await this.validator.assertProjectValid(request.registry, request.environment);
      await this.journal.append({
        eventId: this.ids.nextId("evt"),
        operationId,
        operationType: "validate_requirements",
        project: request.projectId,
        repository: request.repository,
        gitRef: request.gitRef,
        status: "succeeded",
        startedAt,
        endedAt: this.clock.now().toISOString(),
        reason: "All declared requirements are available"
      });
      return { operationId, report };
    } catch (error) {
      const reason =
        error instanceof RequirementValidationError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Requirement validation failed";

      await this.journal.append({
        eventId: this.ids.nextId("evt"),
        operationId,
        operationType: "validate_requirements",
        project: request.projectId,
        repository: request.repository,
        gitRef: request.gitRef,
        status: "failed",
        startedAt,
        endedAt: this.clock.now().toISOString(),
        reason
      });
      throw error;
    }
  }
}
