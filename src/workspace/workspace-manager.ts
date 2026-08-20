import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { selectRegisteredProject } from "../config/project-registry-loader.js";
import type { ProjectRegistryConfig } from "../config/project-registry-types.js";
import type { CommandRunner } from "./command-runner.js";
import type {
  WorkspaceCleanupRequest,
  WorkspaceCleanupResult,
  WorkspaceKind,
  WorkspaceListResult,
  WorkspaceTerminalState
} from "./workspace-retention-service.js";
import { WorkspaceRetentionService } from "./workspace-retention-service.js";

export interface CheckoutRequest {
  projectId: string;
  gitRef: string;
  operationId?: string;
}

export interface CheckoutResult {
  projectId: string;
  repository: string;
  gitRef: string;
  workspacePath: string;
}

const PROJECT_PREFLIGHT_PATHS = ["hiveforge.yaml", "deploy/hiveforge"] as const;

export class WorkspaceManager {
  constructor(
    private readonly workspaceRoot: string,
    private readonly projectRegistry: ProjectRegistryConfig,
    private readonly commandRunner: CommandRunner,
    private readonly retention: WorkspaceRetentionService
  ) {}

  async checkout(request: CheckoutRequest): Promise<CheckoutResult> {
    return this.checkoutKind("project-checkout", request);
  }

  async checkoutManifestPreflight(request: CheckoutRequest): Promise<CheckoutResult> {
    const project = selectRegisteredProject(this.projectRegistry, request.projectId, request.gitRef);
    const checkoutParent = path.join(this.workspaceRoot, project.id);

    await mkdir(checkoutParent, { recursive: true });
    const checkoutPath = await mkdtemp(path.join(checkoutParent, `${encodeRefForPath(request.gitRef)}-preflight-`));
    await this.retention.createWorkspace({
      kind: "manifest-preflight",
      workspacePath: checkoutPath,
      projectId: project.id,
      repository: project.repository,
      gitRef: request.gitRef,
      ...(request.operationId ? { operationId: request.operationId } : {})
    });
    try {
      await this.commandRunner.run("git", [
        "clone",
        "--no-checkout",
        "--filter=blob:none",
        "--sparse",
        project.repository,
        checkoutPath
      ]);
      await this.commandRunner.run("git", ["sparse-checkout", "set", ...PROJECT_PREFLIGHT_PATHS], { cwd: checkoutPath });
      await this.commandRunner.run("git", ["checkout", request.gitRef], { cwd: checkoutPath });
    } catch (error) {
      await this.retention.finalizeWorkspace(checkoutPath, "failed");
      throw error;
    }

    return {
      projectId: project.id,
      repository: project.repository,
      gitRef: request.gitRef,
      workspacePath: checkoutPath
    };
  }

  async touchWorkspace(workspacePath: string): Promise<void> {
    await this.retention.touchWorkspace(workspacePath);
  }

  async finalizeWorkspace(workspacePath: string, state: WorkspaceTerminalState): Promise<void> {
    await this.retention.finalizeWorkspace(workspacePath, state);
  }

  listWorkspaces(): Promise<WorkspaceListResult> {
    return this.retention.listWorkspaces();
  }

  cleanupWorkspaces(request: WorkspaceCleanupRequest): Promise<WorkspaceCleanupResult> {
    return this.retention.cleanupWorkspaces(request);
  }

  private async checkoutKind(kind: WorkspaceKind, request: CheckoutRequest): Promise<CheckoutResult> {
    const project = selectRegisteredProject(this.projectRegistry, request.projectId, request.gitRef);
    const checkoutParent = path.join(this.workspaceRoot, project.id);

    await mkdir(checkoutParent, { recursive: true });
    const checkoutPath = await mkdtemp(path.join(checkoutParent, `${encodeRefForPath(request.gitRef)}-`));
    await this.retention.createWorkspace({
      kind,
      workspacePath: checkoutPath,
      projectId: project.id,
      repository: project.repository,
      gitRef: request.gitRef,
      ...(request.operationId ? { operationId: request.operationId } : {})
    });
    try {
      await this.commandRunner.run("git", ["clone", "--no-checkout", project.repository, checkoutPath]);
      await this.commandRunner.run("git", ["checkout", request.gitRef], { cwd: checkoutPath });
    } catch (error) {
      await this.retention.finalizeWorkspace(checkoutPath, "failed");
      throw error;
    }

    return {
      projectId: project.id,
      repository: project.repository,
      gitRef: request.gitRef,
      workspacePath: checkoutPath
    };
  }

}

function encodeRefForPath(gitRef: string): string {
  return Buffer.from(gitRef, "utf8").toString("base64url");
}
