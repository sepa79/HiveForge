import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CommandRunner } from "../../src/workspace/command-runner.js";
import { WorkspaceManager } from "../../src/workspace/workspace-manager.js";
import { createWorkspaceRetentionService } from "../helpers/workspace-retention.js";

class RecordingRunner implements CommandRunner {
  public readonly calls: Array<{ command: string; args: string[]; cwd?: string }> = [];

  async run(command: string, args: string[], options: { cwd?: string } = {}) {
    this.calls.push({ command, args, cwd: options.cwd });
    if (command === "git" && args[0] === "clone") {
      await mkdir(args[args.length - 1], { recursive: true });
      await writeFile(path.join(args[args.length - 1], "hiveforge.yaml"), "kind: project\n");
    }
    return { stdout: "", stderr: "" };
  }
}

describe("workspace manager", () => {
  it("checks out only a registered project and approved ref", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-workspace-"));
    const runner = new RecordingRunner();
    const manager = new WorkspaceManager(
      workspaceRoot,
      {
        projects: [
          {
            id: "hivewatch",
            name: "HiveWatch",
            source: "https-git",
            repository: "https://github.com/sepa79/HiveWatch.git",
            approvedRefs: ["main"]
          }
        ]
      },
      runner,
      createWorkspaceRetentionService(workspaceRoot)
    );

    const result = await manager.checkout({ projectId: "hivewatch", gitRef: "main" });

    expect(result.repository).toBe("https://github.com/sepa79/HiveWatch.git");
    expect(result.workspacePath.startsWith(path.join(workspaceRoot, "hivewatch", "bWFpbg-"))).toBe(true);
    expect(runner.calls).toEqual([
      {
        command: "git",
        args: ["clone", "--no-checkout", "https://github.com/sepa79/HiveWatch.git", path.join(result.workspacePath, ".checkout")],
        cwd: undefined
      },
      {
        command: "git",
        args: ["checkout", "main"],
        cwd: path.join(result.workspacePath, ".checkout")
      }
    ]);
  });

  it("uses a fresh checkout path for repeated requests to the same ref", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-workspace-"));
    const runner = new RecordingRunner();
    const manager = new WorkspaceManager(
      workspaceRoot,
      {
        projects: [
          {
            id: "hivewatch",
            name: "HiveWatch",
            source: "https-git",
            repository: "https://github.com/sepa79/HiveWatch.git",
            approvedRefs: ["main"]
          }
        ]
      },
      runner,
      createWorkspaceRetentionService(workspaceRoot)
    );

    const first = await manager.checkout({ projectId: "hivewatch", gitRef: "main" });
    const second = await manager.checkout({ projectId: "hivewatch", gitRef: "main" });

    expect(first.workspacePath).not.toBe(second.workspacePath);
  });

  it("does not run git when the ref is rejected", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-workspace-"));
    const runner = new RecordingRunner();
    const manager = new WorkspaceManager(
      workspaceRoot,
      {
        projects: [
          {
            id: "hivewatch",
            name: "HiveWatch",
            source: "https-git",
            repository: "https://github.com/sepa79/HiveWatch.git",
            approvedRefs: ["main"]
          }
        ]
      },
      runner,
      createWorkspaceRetentionService(workspaceRoot)
    );

    await expect(manager.checkout({ projectId: "hivewatch", gitRef: "dev" })).rejects.toThrow(
      "Git ref is not approved for hivewatch: dev"
    );
    expect(runner.calls).toEqual([]);
  });

  it("checks out only HiveForge preflight paths before full inspection", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-workspace-"));
    const runner = new RecordingRunner();
    const manager = new WorkspaceManager(
      workspaceRoot,
      {
        projects: [
          {
            id: "hivewatch",
            name: "HiveWatch",
            source: "https-git",
            repository: "https://github.com/sepa79/HiveWatch.git",
            approvedRefs: ["main"]
          }
        ]
      },
      runner,
      createWorkspaceRetentionService(workspaceRoot)
    );

    const result = await manager.checkoutManifestPreflight({ projectId: "hivewatch", gitRef: "main" });

    expect(result.workspacePath.startsWith(path.join(workspaceRoot, "hivewatch", "bWFpbg-preflight-"))).toBe(true);
    expect(runner.calls).toEqual([
      {
        command: "git",
        args: [
          "clone",
          "--no-checkout",
          "--filter=blob:none",
          "--sparse",
          "https://github.com/sepa79/HiveWatch.git",
          path.join(result.workspacePath, ".checkout")
        ],
        cwd: undefined
      },
      {
        command: "git",
        args: ["sparse-checkout", "set", "hiveforge.yaml", "deploy/hiveforge"],
        cwd: path.join(result.workspacePath, ".checkout")
      },
      {
        command: "git",
        args: ["checkout", "main"],
        cwd: path.join(result.workspacePath, ".checkout")
      }
    ]);
  });
});
