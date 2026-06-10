import type { Journal } from "../journal/journal.js";
import type { ProjectRegistry } from "../manifest/manifest-types.js";
import { loadProjectRegistry, validateProjectManifestPreflight } from "../manifest/project-registry.js";
import type { CheckoutRequest, WorkspaceManager } from "../workspace/workspace-manager.js";
import type { Clock } from "./clock.js";
import type { IdGenerator } from "./id-generator.js";

export interface ProjectInspectionResult {
  operationId: string;
  projectId: string;
  repository: string;
  gitRef: string;
  workspacePath: string;
  registry: ProjectRegistry;
}

export class ProjectInspectionService {
  constructor(
    private readonly workspaceManager: WorkspaceManager,
    private readonly journal: Journal,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async inspect(request: CheckoutRequest): Promise<ProjectInspectionResult> {
    const operationId = this.ids.nextId("op");
    const startedAt = this.clock.now().toISOString();
    let checkout;

    try {
      const preflight = await this.workspaceManager.checkoutManifestPreflight(request);
      await validateProjectManifestPreflight(preflight.workspacePath);
      checkout = await this.workspaceManager.checkout(request);
    } catch (error) {
      await this.journal.append({
        eventId: this.ids.nextId("evt"),
        operationId,
        operationType: "inspect_project",
        project: request.projectId,
        gitRef: request.gitRef,
        status: "failed",
        startedAt,
        endedAt: this.clock.now().toISOString(),
        reason: error instanceof Error ? error.message : "Project checkout failed"
      });
      throw error;
    }

    try {
      const registry = await loadProjectRegistry(checkout.workspacePath);
      await this.journal.append({
        eventId: this.ids.nextId("evt"),
        operationId,
        operationType: "inspect_project",
        project: checkout.projectId,
        repository: checkout.repository,
        gitRef: checkout.gitRef,
        status: "succeeded",
        startedAt,
        endedAt: this.clock.now().toISOString(),
        reason: `Loaded ${registry.components.length} managed component${registry.components.length === 1 ? "" : "s"}`
      });

      return {
        operationId,
        projectId: checkout.projectId,
        repository: checkout.repository,
        gitRef: checkout.gitRef,
        workspacePath: checkout.workspacePath,
        registry
      };
    } catch (error) {
      await this.journal.append({
        eventId: this.ids.nextId("evt"),
        operationId,
        operationType: "inspect_project",
        project: checkout.projectId,
        repository: checkout.repository,
        gitRef: checkout.gitRef,
        status: "failed",
        startedAt,
        endedAt: this.clock.now().toISOString(),
        reason: error instanceof Error ? error.message : "Project inspection failed"
      });
      throw error;
    }
  }
}
