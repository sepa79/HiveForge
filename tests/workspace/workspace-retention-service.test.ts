import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../src/operation/clock.js";
import { WorkspaceRetentionService } from "../../src/workspace/workspace-retention-service.js";
import { SequenceIds } from "../helpers/workspace-retention.js";

class MutableClock implements Clock {
  constructor(private current: string) {}

  now(): Date {
    return new Date(this.current);
  }

  set(iso: string): void {
    this.current = iso;
  }
}

describe("workspace retention service", () => {
  it("stores canonical workspace metadata and updates lastUsedAt on touch/finalize", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-retention-"));
    const clock = new MutableClock("2026-08-20T10:00:00.000Z");
    const service = new WorkspaceRetentionService(workspaceRoot, new SequenceIds(), clock);
    const workspacePath = path.join(workspaceRoot, "hivewatch", "main-1");
    await mkdir(workspacePath, { recursive: true });

    await service.createWorkspace({
      kind: "project-checkout",
      workspacePath,
      projectId: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      gitRef: "main",
      operationId: "op-1"
    });
    clock.set("2026-08-20T10:20:00.000Z");
    await service.touchWorkspace(workspacePath);
    clock.set("2026-08-20T10:45:00.000Z");
    await service.finalizeWorkspace(workspacePath, "completed");

    const result = await service.listWorkspaces();

    expect(result).toEqual({
      workspaces: [
        {
          workspaceId: "workspace-1",
          kind: "project-checkout",
          projectId: "hivewatch",
          repository: "https://github.com/sepa79/HiveWatch.git",
          gitRef: "main",
          operationId: "op-1",
          workspacePath,
          createdAt: "2026-08-20T10:00:00.000Z",
          lastUsedAt: "2026-08-20T10:45:00.000Z",
          inUse: false,
          lifecycleState: "completed",
          cleanupEligibleAfter: "2026-08-20T11:45:00.000Z"
        }
      ]
    });
  });

  it("cleans only terminal workspaces older than the requested window", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-retention-"));
    const clock = new MutableClock("2026-08-20T10:00:00.000Z");
    const service = new WorkspaceRetentionService(workspaceRoot, new SequenceIds(), clock);
    const eligiblePath = path.join(workspaceRoot, "hivewatch", "main-eligible");
    const activePath = path.join(workspaceRoot, "hivewatch", "main-active");
    await mkdir(eligiblePath, { recursive: true });
    await mkdir(activePath, { recursive: true });

    await service.createWorkspace({
      kind: "project-checkout",
      workspacePath: eligiblePath,
      projectId: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      gitRef: "main"
    });
    await service.createWorkspace({
      kind: "project-checkout",
      workspacePath: activePath,
      projectId: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      gitRef: "main"
    });

    clock.set("2026-08-20T10:05:00.000Z");
    await service.finalizeWorkspace(eligiblePath, "completed");
    clock.set("2026-08-20T10:10:00.000Z");
    await service.touchWorkspace(activePath);

    clock.set("2026-08-20T12:20:00.000Z");
    const dryRun = await service.cleanupWorkspaces({ dryRun: true, olderThanHours: 1 });
    expect(dryRun).toEqual({
      dryRun: true,
      olderThanHours: 1,
      evaluatedAt: "2026-08-20T12:20:00.000Z",
      candidates: [
        {
          workspaceId: "workspace-2",
          workspacePath: activePath,
          eligible: false,
          reason: "in_use"
        },
        {
          workspaceId: "workspace-1",
          workspacePath: eligiblePath,
          eligible: true,
          reason: "cleanup window elapsed"
        }
      ],
      removed: [],
      skipped: []
    });

    const cleanup = await service.cleanupWorkspaces({ dryRun: false, olderThanHours: 1 });
    expect(cleanup.removed).toEqual([
      {
        workspaceId: "workspace-1",
        workspacePath: eligiblePath,
        eligible: true,
        reason: "cleanup window elapsed"
      }
    ]);
    expect(cleanup.skipped).toEqual([
      {
        workspaceId: "workspace-2",
        workspacePath: activePath,
        eligible: false,
        reason: "in_use"
      }
    ]);
    await expect(stat(eligiblePath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(activePath)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });

  it("does not fail finalize when automatic cleanup sees unrelated invalid metadata", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-retention-"));
    const clock = new MutableClock("2026-08-20T10:00:00.000Z");
    const service = new WorkspaceRetentionService(workspaceRoot, new SequenceIds(), clock);
    const workspacePath = path.join(workspaceRoot, "hivewatch", "main-1");
    const brokenWorkspacePath = path.join(workspaceRoot, "hivewatch", "broken");
    await mkdir(workspacePath, { recursive: true });
    await mkdir(brokenWorkspacePath, { recursive: true });
    await writeFile(path.join(brokenWorkspacePath, ".hiveforge-workspace.json"), "{broken", "utf8");

    await service.createWorkspace({
      kind: "project-checkout",
      workspacePath,
      projectId: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      gitRef: "main"
    });

    await expect(service.finalizeWorkspace(workspacePath, "completed")).resolves.toMatchObject({
      workspacePath,
      inUse: false,
      lifecycleState: "completed"
    });
  });
});
