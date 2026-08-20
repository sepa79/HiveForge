import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Clock } from "../operation/clock.js";
import type { IdGenerator } from "../operation/id-generator.js";

export type WorkspaceLifecycleState = "active" | "completed" | "failed" | "cleanup-pending";
export type WorkspaceKind = "project-checkout" | "manifest-preflight" | "repository-inspection";
export type WorkspaceTerminalState = Extract<WorkspaceLifecycleState, "completed" | "failed">;

export interface WorkspaceRecord {
  workspaceId: string;
  kind: WorkspaceKind;
  projectId?: string;
  repository?: string;
  gitRef?: string;
  operationId?: string;
  workspacePath: string;
  createdAt: string;
  lastUsedAt: string;
  inUse: boolean;
  lifecycleState: WorkspaceLifecycleState;
  cleanupEligibleAfter: string;
}

export interface WorkspaceListResult {
  workspaces: WorkspaceRecord[];
}

export interface WorkspaceCleanupRequest {
  dryRun: boolean;
  olderThanHours: number;
}

export interface WorkspaceCleanupEntry {
  workspaceId: string;
  workspacePath: string;
  eligible: boolean;
  reason: string;
}

export interface WorkspaceCleanupResult {
  dryRun: boolean;
  olderThanHours: number;
  evaluatedAt: string;
  candidates: WorkspaceCleanupEntry[];
  removed: WorkspaceCleanupEntry[];
  skipped: WorkspaceCleanupEntry[];
}

export interface CreateWorkspaceRequest {
  kind: WorkspaceKind;
  workspacePath: string;
  projectId?: string;
  repository?: string;
  gitRef?: string;
  operationId?: string;
}

const WORKSPACE_METADATA_FILE = ".hiveforge-workspace.json";
const DEFAULT_RETENTION_HOURS = 1;

export class WorkspaceRetentionService {
  constructor(
    private readonly workspaceRoot: string,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async createWorkspace(request: CreateWorkspaceRequest): Promise<WorkspaceRecord> {
    const workspacePath = resolveWorkspacePath(this.workspaceRoot, request.workspacePath);
    const now = this.clock.now();
    const record: WorkspaceRecord = {
      workspaceId: this.ids.nextId("workspace"),
      kind: request.kind,
      ...(request.projectId ? { projectId: request.projectId } : {}),
      ...(request.repository ? { repository: request.repository } : {}),
      ...(request.gitRef ? { gitRef: request.gitRef } : {}),
      ...(request.operationId ? { operationId: request.operationId } : {}),
      workspacePath,
      createdAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
      inUse: true,
      lifecycleState: "active",
      cleanupEligibleAfter: cleanupEligibleAfter(now).toISOString()
    };
    await writeWorkspaceRecord(record);
    return record;
  }

  async touchWorkspace(workspacePath: string): Promise<WorkspaceRecord> {
    return this.updateWorkspace(workspacePath, (current, now) => ({
      ...current,
      lastUsedAt: now.toISOString(),
      cleanupEligibleAfter: cleanupEligibleAfter(now).toISOString()
    }));
  }

  async finalizeWorkspace(workspacePath: string, state: WorkspaceTerminalState): Promise<WorkspaceRecord> {
    const record = await this.updateWorkspace(workspacePath, (current, now) => ({
      ...current,
      lastUsedAt: now.toISOString(),
      inUse: false,
      lifecycleState: state,
      cleanupEligibleAfter: cleanupEligibleAfter(now).toISOString()
    }));
    try {
      // Automatic retention is best-effort and must not fail the user operation
      // that just finalized its own workspace metadata.
      await this.cleanupExpiredWorkspaces();
    } catch {}
    return record;
  }

  async listWorkspaces(): Promise<WorkspaceListResult> {
    const workspaces = await this.loadAllWorkspaces();
    return {
      workspaces: workspaces.sort(compareWorkspaceRecords)
    };
  }

  async cleanupExpiredWorkspaces(): Promise<WorkspaceCleanupResult> {
    return this.cleanupWorkspaces({
      dryRun: false,
      olderThanHours: DEFAULT_RETENTION_HOURS
    });
  }

  async cleanupWorkspaces(request: WorkspaceCleanupRequest): Promise<WorkspaceCleanupResult> {
    const evaluatedAt = this.clock.now();
    const cutoff = new Date(evaluatedAt.getTime() - request.olderThanHours * 60 * 60 * 1000);
    const workspaces = await this.loadAllWorkspaces();
    const candidates: WorkspaceCleanupEntry[] = [];
    const removed: WorkspaceCleanupEntry[] = [];
    const skipped: WorkspaceCleanupEntry[] = [];

    for (const workspace of workspaces.sort(compareWorkspaceRecords)) {
      const evaluation = evaluateCleanupEligibility(this.workspaceRoot, workspace, cutoff);
      const entry: WorkspaceCleanupEntry = {
        workspaceId: workspace.workspaceId,
        workspacePath: workspace.workspacePath,
        eligible: evaluation.eligible,
        reason: evaluation.reason
      };
      candidates.push(entry);

      if (request.dryRun) {
        continue;
      }
      if (!evaluation.eligible) {
        skipped.push(entry);
        continue;
      }

      try {
        await rm(workspace.workspacePath, { recursive: true, force: false });
        removed.push(entry);
      } catch (error) {
        skipped.push({
          ...entry,
          reason: error instanceof Error ? `delete_failed: ${error.message}` : "delete_failed"
        });
      }
    }

    return {
      dryRun: request.dryRun,
      olderThanHours: request.olderThanHours,
      evaluatedAt: evaluatedAt.toISOString(),
      candidates,
      removed,
      skipped
    };
  }

  private async updateWorkspace(
    workspacePath: string,
    updater: (current: WorkspaceRecord, now: Date) => WorkspaceRecord
  ): Promise<WorkspaceRecord> {
    const current = await readWorkspaceRecord(metadataPathFor(this.workspaceRoot, workspacePath));
    const updated = updater(current, this.clock.now());
    await writeWorkspaceRecord(updated);
    return updated;
  }

  private async loadAllWorkspaces(): Promise<WorkspaceRecord[]> {
    const metadataFiles = await findWorkspaceMetadataFiles(this.workspaceRoot);
    return Promise.all(metadataFiles.map((file) => readWorkspaceRecord(file)));
  }
}

async function findWorkspaceMetadataFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === WORKSPACE_METADATA_FILE)) {
      return [path.join(root, WORKSPACE_METADATA_FILE)];
    }

    const nested = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => findWorkspaceMetadataFiles(path.join(root, entry.name)))
    );
    return nested.flat();
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }
}

async function readWorkspaceRecord(filePath: string): Promise<WorkspaceRecord> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  return assertWorkspaceRecord(parsed, filePath);
}

async function writeWorkspaceRecord(record: WorkspaceRecord): Promise<void> {
  await writeFile(metadataPath(record.workspacePath), `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function metadataPathFor(workspaceRoot: string, workspacePath: string): string {
  return metadataPath(resolveWorkspacePath(workspaceRoot, workspacePath));
}

function metadataPath(workspacePath: string): string {
  return path.join(workspacePath, WORKSPACE_METADATA_FILE);
}

function evaluateCleanupEligibility(
  workspaceRoot: string,
  workspace: WorkspaceRecord,
  cutoff: Date
): { eligible: boolean; reason: string } {
  if (!isWorkspacePathWithinRoot(workspaceRoot, workspace.workspacePath)) {
    return { eligible: false, reason: "path_outside_workspace_root" };
  }
  if (workspace.inUse) {
    return { eligible: false, reason: "in_use" };
  }
  if (!isTerminalState(workspace.lifecycleState)) {
    return { eligible: false, reason: "workspace_not_terminal" };
  }
  const lastUsedAt = Date.parse(workspace.lastUsedAt);
  if (Number.isNaN(lastUsedAt)) {
    return { eligible: false, reason: "invalid_last_used_at" };
  }
  if (lastUsedAt > cutoff.getTime()) {
    return { eligible: false, reason: "retention_window_not_elapsed" };
  }
  return { eligible: true, reason: "cleanup window elapsed" };
}

function resolveWorkspacePath(workspaceRoot: string, workspacePath: string): string {
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedWorkspace = path.resolve(workspacePath);
  if (!isWorkspacePathWithinRoot(resolvedRoot, resolvedWorkspace)) {
    throw new Error(`Workspace path is outside configured workspace root: ${resolvedWorkspace}`);
  }
  return resolvedWorkspace;
}

function isWorkspacePathWithinRoot(workspaceRoot: string, workspacePath: string): boolean {
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedWorkspace = path.resolve(workspacePath);
  return resolvedWorkspace.startsWith(`${resolvedRoot}${path.sep}`);
}

function cleanupEligibleAfter(now: Date): Date {
  return new Date(now.getTime() + DEFAULT_RETENTION_HOURS * 60 * 60 * 1000);
}

function compareWorkspaceRecords(left: WorkspaceRecord, right: WorkspaceRecord): number {
  return right.lastUsedAt.localeCompare(left.lastUsedAt) || right.createdAt.localeCompare(left.createdAt);
}

function isTerminalState(state: WorkspaceLifecycleState): state is WorkspaceTerminalState {
  return state === "completed" || state === "failed";
}

function assertWorkspaceRecord(value: unknown, filePath: string): WorkspaceRecord {
  if (!isRecord(value)) {
    throw new Error(`Invalid workspace metadata at ${filePath}: expected an object`);
  }
  const requiredString = (name: keyof WorkspaceRecord): string => {
    const candidate = value[name];
    if (typeof candidate !== "string" || candidate.length === 0) {
      throw new Error(`Invalid workspace metadata at ${filePath}: missing ${String(name)}`);
    }
    return candidate;
  };

  const lifecycleState = requiredString("lifecycleState");
  if (lifecycleState !== "active" && lifecycleState !== "completed" && lifecycleState !== "failed" && lifecycleState !== "cleanup-pending") {
    throw new Error(`Invalid workspace metadata at ${filePath}: unsupported lifecycleState ${lifecycleState}`);
  }

  const kind = requiredString("kind");
  if (kind !== "project-checkout" && kind !== "manifest-preflight" && kind !== "repository-inspection") {
    throw new Error(`Invalid workspace metadata at ${filePath}: unsupported kind ${kind}`);
  }

  if (typeof value.inUse !== "boolean") {
    throw new Error(`Invalid workspace metadata at ${filePath}: missing inUse`);
  }

  return {
    workspaceId: requiredString("workspaceId"),
    kind,
    ...(typeof value.projectId === "string" ? { projectId: value.projectId } : {}),
    ...(typeof value.repository === "string" ? { repository: value.repository } : {}),
    ...(typeof value.gitRef === "string" ? { gitRef: value.gitRef } : {}),
    ...(typeof value.operationId === "string" ? { operationId: value.operationId } : {}),
    workspacePath: requiredString("workspacePath"),
    createdAt: requiredString("createdAt"),
    lastUsedAt: requiredString("lastUsedAt"),
    inUse: value.inUse,
    lifecycleState,
    cleanupEligibleAfter: requiredString("cleanupEligibleAfter")
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
