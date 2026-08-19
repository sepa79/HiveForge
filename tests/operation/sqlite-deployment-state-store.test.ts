import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteDeploymentStateStore } from "../../src/operation/sqlite-deployment-state-store.js";
import type { IdGenerator } from "../../src/operation/id-generator.js";
import { DatabaseSync } from "node:sqlite";

class SequenceIds implements IdGenerator {
  private next = 1;

  nextId(prefix: string): string {
    return `${prefix}-${this.next++}`;
  }
}

describe("sqlite deployment state store", () => {
  it("creates a preparing deployment before Docker deploy completes", async () => {
    const store = new SqliteDeploymentStateStore(":memory:", new SequenceIds());

    const preparing = await store.ensureDeployment(actionInput({ action: "deploy", operationId: "op-1" }));

    expect(preparing).toMatchObject({
      deploymentId: "deployment-1",
      deploymentName: "hivewatch",
      status: "preparing",
      lastAction: "deploy",
      operationId: "op-1"
    });
  });

  it("keeps a stable deployment id while lifecycle actions update current state", async () => {
    const store = new SqliteDeploymentStateStore(":memory:", new SequenceIds());

    const first = await store.recordLifecycleAction(
      actionInput({ gitRef: "main", action: "deploy", operationId: "op-1" })
    );
    const second = await store.recordLifecycleAction(
      actionInput({ gitRef: "v2", action: "upgrade", operationId: "op-2" })
    );

    expect(first?.deploymentId).toBe("deployment-1");
    expect(second).toMatchObject({
      deploymentId: "deployment-1",
      status: "deployed",
      gitRef: "v2",
      lastAction: "upgrade",
      operationId: "op-2"
    });
    await expect(store.listDeployments("local")).resolves.toEqual([
      {
        deploymentId: "deployment-1",
        deploymentName: "hivewatch",
        executorKind: "docker-direct",
        environment: "local",
        project: "hivewatch",
        repository: "https://github.com/sepa79/HiveWatch.git",
        gitRef: "v2",
        component: "api",
        profile: "test",
        status: "deployed",
        lastAction: "upgrade",
        operationId: "op-2",
        updatedAt: "2026-05-17T10:00:00.000Z"
      }
    ]);
  });

  it("marks removed lifecycle actions without changing the deployment id", async () => {
    const store = new SqliteDeploymentStateStore(":memory:", new SequenceIds());

    await store.recordLifecycleAction(actionInput({ action: "deploy", operationId: "op-1" }));
    const removed = await store.recordLifecycleAction(actionInput({ action: "remove", operationId: "op-2" }));

    expect(removed).toMatchObject({
      deploymentId: "deployment-1",
      deploymentName: "hivewatch",
      status: "removed",
      lastAction: "remove",
      operationId: "op-2"
    });
  });

  it("ignores lifecycle actions that are not deployment state transitions", async () => {
    const store = new SqliteDeploymentStateStore(":memory:", new SequenceIds());

    await expect(store.recordLifecycleAction(actionInput({ action: "restart", operationId: "op-1" }))).resolves.toBeNull();
    await expect(store.listDeployments("local")).resolves.toEqual([]);
  });

  it("records deployment failure without changing the deployment id", async () => {
    const store = new SqliteDeploymentStateStore(":memory:", new SequenceIds());

    await store.ensureDeployment(actionInput({ action: "deploy", operationId: "op-1" }));
    const failed = await store.recordDeploymentFailure({
      ...actionInput({ action: "deploy", operationId: "op-1" }),
      reason: "Docker deploy failed"
    });

    expect(failed).toMatchObject({
      deploymentId: "deployment-1",
      deploymentName: "hivewatch",
      status: "failed",
      lastAction: "deploy",
      operationId: "op-1"
    });
  });

  it("marks an externally removed runtime as gone and clears stale Portainer identity", async () => {
    const store = new SqliteDeploymentStateStore(":memory:", new SequenceIds());

    await store.recordLifecycleAction({
      ...actionInput({ action: "deploy", operationId: "op-1" }),
      executorKind: "portainer-stack",
      portainer: {
        endpointId: 3,
        stackId: 41,
        stackName: "hivewatch"
      }
    });

    const gone = await store.markGone("deployment-1", "2026-05-17T11:00:00.000Z");

    expect(gone).toMatchObject({
      deploymentId: "deployment-1",
      status: "gone",
      updatedAt: "2026-05-17T11:00:00.000Z"
    });
    expect(gone?.portainer).toBeUndefined();
  });

  it("stores an explicit deployment name and reuses it for later slot updates", async () => {
    const store = new SqliteDeploymentStateStore(":memory:", new SequenceIds());

    const first = await store.ensureDeployment(
      actionInput({ action: "deploy", operationId: "op-1", deploymentName: "hivewatch-canary" })
    );
    const second = await store.recordLifecycleAction(actionInput({ action: "upgrade", operationId: "op-2" }));

    expect(first.deploymentName).toBe("hivewatch-canary");
    expect(second?.deploymentName).toBe("hivewatch-canary");
  });

  it("rejects changing the deployment name for an existing slot", async () => {
    const store = new SqliteDeploymentStateStore(":memory:", new SequenceIds());

    await store.ensureDeployment(actionInput({ action: "deploy", operationId: "op-1", deploymentName: "hivewatch" }));

    await expect(
      store.ensureDeployment(actionInput({ action: "deploy", operationId: "op-2", deploymentName: "hivewatch-canary" }))
    ).rejects.toThrow("refusing to change it to hivewatch-canary");
  });

  it("allows changing deployment name and executor after the slot is marked gone", async () => {
    const store = new SqliteDeploymentStateStore(":memory:", new SequenceIds());

    await store.recordLifecycleAction(actionInput({ action: "deploy", operationId: "op-1", deploymentName: "hivewatch" }));
    await store.markGone("deployment-1", "2026-05-17T11:00:00.000Z");

    const preparing = await store.ensureDeployment({
      ...actionInput({ action: "deploy", operationId: "op-2", deploymentName: "hivewatch-canary" }),
      executorKind: "portainer-stack",
      portainer: {
        endpointId: 9
      }
    });

    expect(preparing).toMatchObject({
      deploymentId: "deployment-1",
      deploymentName: "hivewatch-canary",
      executorKind: "portainer-stack",
      portainer: {
        endpointId: 9
      },
      status: "preparing"
    });
  });

  it("rejects changing the Portainer endpoint for an existing slot", async () => {
    const store = new SqliteDeploymentStateStore(":memory:", new SequenceIds());

    await store.recordLifecycleAction({
      ...actionInput({ action: "deploy", operationId: "op-1" }),
      executorKind: "portainer-stack",
      portainer: {
        endpointId: 3,
        stackId: 41,
        stackName: "hivewatch"
      }
    });

    await expect(
      store.ensureDeployment({
        ...actionInput({ action: "deploy", operationId: "op-2" }),
        executorKind: "portainer-stack",
        portainer: {
          endpointId: 9
        }
      })
    ).rejects.toThrow("refusing to change it to 9");
  });

  it("migrates an existing v1 database so gone becomes a valid status", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hf-state-migration-"));
    const dbPath = path.join(root, "hiveforge.sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version(version) VALUES (1);
      CREATE TABLE deployments (
        deployment_id TEXT PRIMARY KEY,
        deployment_name TEXT,
        executor_kind TEXT NOT NULL DEFAULT 'docker-direct',
        environment TEXT NOT NULL,
        project TEXT NOT NULL,
        repository TEXT NOT NULL,
        git_ref TEXT NOT NULL,
        component TEXT NOT NULL,
        profile TEXT,
        profile_key TEXT NOT NULL,
        portainer_endpoint_id INTEGER,
        portainer_stack_id INTEGER,
        portainer_stack_name TEXT,
        status TEXT NOT NULL CHECK(status IN ('preparing', 'deployed', 'removed', 'failed')),
        last_action TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(environment, project, component, profile_key)
      );
      INSERT INTO deployments (
        deployment_id,
        deployment_name,
        executor_kind,
        environment,
        project,
        repository,
        git_ref,
        component,
        profile,
        profile_key,
        status,
        last_action,
        operation_id,
        updated_at
      ) VALUES (
        'deployment-1',
        'hivewatch',
        'docker-direct',
        'local',
        'hivewatch',
        'https://github.com/sepa79/HiveWatch.git',
        'main',
        'api',
        'test',
        'test',
        'deployed',
        'deploy',
        'op-1',
        '2026-05-17T10:00:00.000Z'
      );
    `);
    db.close();

    const store = new SqliteDeploymentStateStore(dbPath, new SequenceIds());
    const gone = await store.markGone("deployment-1", "2026-05-17T11:00:00.000Z");

    expect(gone?.status).toBe("gone");
  });
});

function actionInput(
  overrides: {
    action: string;
    operationId: string;
    gitRef?: string;
    deploymentName?: string;
    executorKind?: "docker-direct" | "portainer-stack";
    portainer?: { endpointId: number; stackId?: number; stackName?: string };
  }
) {
  return {
    executorKind: overrides.executorKind ?? ("docker-direct" as const),
    environment: "local",
    ...(overrides.deploymentName ? { deploymentName: overrides.deploymentName } : {}),
    project: "hivewatch",
    repository: "https://github.com/sepa79/HiveWatch.git",
    gitRef: overrides.gitRef ?? "main",
    component: "api",
    profile: "test",
    ...(overrides.portainer ? { portainer: overrides.portainer } : {}),
    action: overrides.action,
    operationId: overrides.operationId,
    updatedAt: "2026-05-17T10:00:00.000Z"
  };
}
