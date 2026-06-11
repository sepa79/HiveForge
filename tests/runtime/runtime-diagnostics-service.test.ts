import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { EnvironmentDefinition } from "../../src/config/environment-types.js";
import { RuntimeDiagnosticsService } from "../../src/runtime/runtime-diagnostics-service.js";
import type { RuntimePaths } from "../../src/runtime/runtime-paths.js";

describe("runtime diagnostics service", () => {
  it("reports runtime root, derived paths, and unknown node visibility when bindSourceRoot is absent", async () => {
    const paths = await createRuntimePaths();

    const report = await new RuntimeDiagnosticsService(paths, environment()).diagnose();

    expect(report.runtimeRoot).toMatchObject({
      path: paths.runtimeRoot,
      status: "present",
      readable: true,
      writable: true
    });
    expect(report.derivedPaths.dataRoot).toMatchObject({
      path: paths.dataRoot,
      status: "present"
    });
    expect(report.managedRoot).toEqual({
      controlPlanePath: paths.dataRoot,
      shared: true,
      visibilityStatus: "unknown",
      reason: "No Docker bind-source managedRoot.bindSourceRoot is configured; Docker bind-source visibility on runtime nodes is unknown."
    });
    expect(report.actionContractPaths.exposedToProjectActions).toEqual([
      "HIVEFORGE_RENDERED_COMPOSE_FILE",
      "HIVEFORGE_BIND_SOURCE_DIR"
    ]);
    expect(report.actionContractPaths.hiddenFromProjectActions).toEqual([
      "HIVEFORGE_DATA_ROOT",
      "HIVEFORGE_PROJECT_DIR",
      "HIVEFORGE_STACK_DIR",
      "HIVEFORGE_ARTIFACTS_DIR",
      "HIVEFORGE_PROJECT_HOST_DIR",
      "HIVEFORGE_STACK_HOST_DIR",
      "HIVEFORGE_ARTIFACTS_HOST_DIR"
    ]);
  });

  it("reports configured managed-root mapping without claiming per-node verification", async () => {
    const paths = await createRuntimePaths();

    const report = await new RuntimeDiagnosticsService(
      paths,
      environment({
        bindSourceRoot: "/mnt/shared_nfs/hiveforge"
      })
    ).diagnose();

    expect(report.managedRoot).toEqual({
      controlPlanePath: paths.dataRoot,
      bindSourceRoot: "/mnt/shared_nfs/hiveforge",
      managedDataBindSourceRoot: "/mnt/shared_nfs/hiveforge/data",
      shared: true,
      visibilityStatus: "configured",
      reason:
        "Docker bind-source root is configured in environment capabilities; active per-node access is not verified by this check."
    });
  });
});

async function createRuntimePaths(): Promise<RuntimePaths> {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-runtime-"));
  const dataRoot = path.join(runtimeRoot, "data");
  const journal = path.join(runtimeRoot, "journal");
  const workspace = path.join(runtimeRoot, "workspace");
  await mkdir(dataRoot);
  await mkdir(journal);
  await mkdir(workspace);
  await writeFile(path.join(runtimeRoot, "projects.yaml"), "projects: []\n");
  await writeFile(path.join(runtimeRoot, "environments.yaml"), "current: docker\nenvironments: []\n");
  await writeFile(path.join(dataRoot, "runtime-env.json"), '{"version":1,"entries":[]}\n');
  return {
    runtimeRoot,
    registry: path.join(runtimeRoot, "projects.yaml"),
    environments: path.join(runtimeRoot, "environments.yaml"),
    workspace,
    journal,
    dataRoot,
    runtimeEnv: path.join(dataRoot, "runtime-env.json"),
    stateDb: path.join(dataRoot, "hiveforge.sqlite")
  };
}

function environment(managedRoot: { bindSourceRoot?: string } = {}): EnvironmentDefinition {
  return {
    id: "swarm",
    name: "Docker Swarm",
    kind: "swarm",
    capabilities: {
      runtime: ["docker-swarm"],
      managedRoot: {
        shared: true,
        ...managedRoot
      },
      placement: true
    },
    policy: {
      projects: []
    }
  };
}
