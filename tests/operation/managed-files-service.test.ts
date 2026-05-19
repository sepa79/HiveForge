import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectRegistry } from "../../src/manifest/manifest-types.js";
import { ManagedFilesService, managedFilesEnvironment } from "../../src/operation/managed-files-service.js";

describe("managed files service", () => {
  it("replaces declared managed paths under the project managed tree", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "hiveforge-managed-workspace-"));
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-managed-data-"));
    await mkdir(path.join(workspace, "deploy/config"), { recursive: true });
    await writeFile(path.join(workspace, "deploy/config/app.yml"), "mode: poc\n");
    await mkdir(path.join(dataRoot, "deployed/hivewatch/artifacts/config"), { recursive: true });
    await writeFile(path.join(dataRoot, "deployed/hivewatch/artifacts/config/old.yml"), "old\n");

    const result = await new ManagedFilesService(dataRoot).prepare({
      projectId: "hivewatch",
      workspacePath: workspace,
      registry: registry([{ name: "api-config", source: "deploy/config", target: "artifacts/config", mode: "replace" }])
    });

    await expect(readFile(path.join(dataRoot, "deployed/hivewatch/artifacts/config/app.yml"), "utf8")).resolves.toBe(
      "mode: poc\n"
    );
    await expect(readFile(path.join(dataRoot, "deployed/hivewatch/artifacts/config/old.yml"), "utf8")).rejects.toThrow();
    expect(managedFilesEnvironment(result)).toEqual({
      HIVEFORGE_PROJECT_DIR: path.join(dataRoot, "deployed/hivewatch"),
      HIVEFORGE_STACK_DIR: path.join(dataRoot, "deployed/hivewatch/stacks"),
      HIVEFORGE_ARTIFACTS_DIR: path.join(dataRoot, "deployed/hivewatch/artifacts")
    });
  });

  it("preserves managed directory inodes when replacing directory contents", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "hiveforge-managed-workspace-"));
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-managed-data-"));
    const target = path.join(dataRoot, "deployed/hivewatch/artifacts/www");
    await mkdir(path.join(workspace, "deploy/www"), { recursive: true });
    await writeFile(path.join(workspace, "deploy/www/health.txt"), "ok\n");
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "old.txt"), "old\n");
    const before = await stat(target);

    await new ManagedFilesService(dataRoot).prepare({
      projectId: "hivewatch",
      workspacePath: workspace,
      registry: registry([{ name: "www", source: "deploy/www", target: "artifacts/www", mode: "replace" }])
    });

    const after = await stat(target);
    expect(after.ino).toBe(before.ino);
    await expect(readFile(path.join(target, "health.txt"), "utf8")).resolves.toBe("ok\n");
    await expect(readFile(path.join(target, "old.txt"), "utf8")).rejects.toThrow();
  });

  it("rejects missing managed path sources", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "hiveforge-managed-workspace-"));
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-managed-data-"));

    await expect(
      new ManagedFilesService(dataRoot).prepare({
        projectId: "hivewatch",
        workspacePath: workspace,
        registry: registry([{ name: "api-config", source: "deploy/config", target: "artifacts/config", mode: "replace" }])
      })
    ).rejects.toThrow("Managed path source missing for api-config: deploy/config");
  });

  it("rejects nested target collisions", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "hiveforge-managed-workspace-"));
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-managed-data-"));

    await expect(
      new ManagedFilesService(dataRoot).prepare({
        projectId: "hivewatch",
        workspacePath: workspace,
        registry: registry([
          { name: "config", source: "deploy/config", target: "artifacts/config", mode: "replace" },
          { name: "grafana", source: "deploy/grafana", target: "artifacts/config/grafana", mode: "replace" }
        ])
      })
    ).rejects.toThrow("Nested managed path target collision: artifacts/config contains artifacts/config/grafana");
  });
});

function registry(managedPaths: NonNullable<NonNullable<ProjectRegistry["artifacts"]>["managedPaths"]>): ProjectRegistry {
  return {
    project: {
      name: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      actions: ["deploy"]
    },
    artifacts: {
      managedPaths
    },
    components: []
  };
}
