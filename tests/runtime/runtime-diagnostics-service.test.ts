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
      "/hf",
      "/hf/stacks/compose.yml",
      "HIVEFORGE_BIND_SOURCE_DIR"
    ]);
    expect(report.actionContractPaths.hiddenFromProjectActions).toEqual([
      "HIVEFORGE_DATA_ROOT",
      "HIVEFORGE_RENDERED_COMPOSE_FILE",
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
        bindSourceRoot: "/mnt/shared_nfs/hiveforge",
        nodes: [readyNode("docker-swarm-mgr-1")]
      })
    ).diagnose();

    expect(report.managedRoot).toEqual({
      controlPlanePath: paths.dataRoot,
      bindSourceRoot: "/mnt/shared_nfs/hiveforge",
      managedDataBindSourceRoot: "/mnt/shared_nfs/hiveforge/data",
      shared: true,
      visibilityStatus: "configured",
      reason:
        "Docker bind-source root is configured in environment capabilities; run verify_managed_root_access for an active per-node check."
    });
  });

  it("reports the latest explicit managed-root verification instead of treating it as configuration", async () => {
    const paths = await createRuntimePaths();
    const diagnostics = new RuntimeDiagnosticsService(
      paths,
      environment({
        bindSourceRoot: "/mnt/shared_nfs/hiveforge",
        nodes: [readyNode("docker-swarm-mgr-1")]
      })
    );
    await diagnostics.recordManagedRootVerification({
      status: "verified",
      checkedAt: "2026-08-06T10:00:00.000Z",
      runtime: "docker-swarm",
      bindSourceRoot: "/mnt/shared_nfs/hiveforge",
      managedDataBindSourceRoot: "/mnt/shared_nfs/hiveforge/data",
      nodes: [
        {
          hostname: "docker-swarm-mgr-1",
          status: "verified",
          reason: "Read-only Docker bind mount was accessible."
        }
      ],
      reason: "Managed-root bind-source visibility is verified on every active ready Swarm node."
    });

    const report = await new RuntimeDiagnosticsService(
      paths,
      environment({
        bindSourceRoot: "/mnt/shared_nfs/hiveforge",
        nodes: [readyNode("docker-swarm-mgr-1")]
      })
    ).diagnose();

    expect(report.managedRoot).toMatchObject({
      visibilityStatus: "verified",
      reason: "Managed-root bind-source visibility is verified on every active ready Swarm node.",
      verification: {
        checkedAt: "2026-08-06T10:00:00.000Z",
        status: "verified"
      }
    });
  });

  it("does not reuse verification evidence when the active ready Swarm nodes change", async () => {
    const paths = await createRuntimePaths();
    const diagnostics = new RuntimeDiagnosticsService(
      paths,
      environment({
        bindSourceRoot: "/mnt/shared_nfs/hiveforge",
        nodes: [readyNode("docker-swarm-mgr-1")]
      })
    );
    await diagnostics.recordManagedRootVerification({
      status: "verified",
      checkedAt: "2026-08-06T10:00:00.000Z",
      runtime: "docker-swarm",
      bindSourceRoot: "/mnt/shared_nfs/hiveforge",
      managedDataBindSourceRoot: "/mnt/shared_nfs/hiveforge/data",
      nodes: [{ hostname: "docker-swarm-mgr-1", status: "verified", reason: "Read-only Docker bind mount was accessible." }],
      reason: "Managed-root bind-source visibility is verified on every active ready Swarm node."
    });

    const report = await new RuntimeDiagnosticsService(
      paths,
      environment({
        bindSourceRoot: "/mnt/shared_nfs/hiveforge",
        nodes: [readyNode("docker-swarm-mgr-1"), readyNode("docker-swarm-wrk-1")]
      })
    ).diagnose();

    expect(report.managedRoot).toMatchObject({
      visibilityStatus: "configured",
      reason: "Stored managed-root verification does not cover the current runtime node scope; run verify_managed_root_access again."
    });
    expect(report.managedRoot.verification).toBeUndefined();
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

function environment(options: { bindSourceRoot?: string; nodes?: EnvironmentDefinition["nodes"] } = {}): EnvironmentDefinition {
  const { nodes, ...managedRoot } = options;
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
    ...(nodes ? { nodes } : {}),
    policy: {
      projects: []
    }
  };
}

function readyNode(hostname: string): NonNullable<EnvironmentDefinition["nodes"]>[number] {
  return {
    id: hostname,
    hostname,
    role: "manager",
    availability: "active",
    status: "ready",
    labels: {}
  };
}
