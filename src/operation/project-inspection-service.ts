import type { Journal } from "../journal/journal.js";
import type { ProjectRegistry } from "../manifest/manifest-types.js";
import { loadProjectRegistry, validateProjectManifestPreflight } from "../manifest/project-registry.js";
import type { CheckoutRequest, WorkspaceManager } from "../workspace/workspace-manager.js";
import type { Clock } from "./clock.js";
import type { IdGenerator } from "./id-generator.js";
import type { WorkspaceTerminalState } from "../workspace/workspace-retention-service.js";

export interface ProjectInspectionResult {
  operationId: string;
  projectId: string;
  repository: string;
  gitRef: string;
  workspacePath: string;
  registry: ProjectRegistry;
  touchWorkspace?(): Promise<void>;
  closeWorkspace?(state?: WorkspaceTerminalState): Promise<void>;
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
    let preflightPath: string | undefined;
    let checkout;

    try {
      const preflight = await this.workspaceManager.checkoutManifestPreflight({ ...request, operationId });
      preflightPath = preflight.workspacePath;
      await validateProjectManifestPreflight(preflight.workspacePath);
      await this.workspaceManager.touchWorkspace(preflight.workspacePath);
      await this.workspaceManager.finalizeWorkspace(preflight.workspacePath, "completed");
      preflightPath = undefined;
      checkout = await this.workspaceManager.checkout({ ...request, operationId });
    } catch (error) {
      if (preflightPath) {
        await this.workspaceManager.finalizeWorkspace(preflightPath, "failed");
      }
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
      await this.workspaceManager.touchWorkspace(checkout.workspacePath);
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
        registry,
        ...workspaceLease(this.workspaceManager, checkout.workspacePath)
      };
    } catch (error) {
      await this.workspaceManager.finalizeWorkspace(checkout.workspacePath, "failed");
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

function workspaceLease(workspaceManager: WorkspaceManager, workspacePath: string) {
  let closed = false;
  return {
    async touchWorkspace() {
      if (closed) {
        return;
      }
      await workspaceManager.touchWorkspace(workspacePath);
    },
    async closeWorkspace(state: WorkspaceTerminalState = "completed") {
      if (closed) {
        return;
      }
      await workspaceManager.finalizeWorkspace(workspacePath, state);
      closed = true;
    }
  };
}
