import { describe, expect, it } from "vitest";
import { SqliteDeploymentStateStore } from "../../src/operation/sqlite-deployment-state-store.js";
import type { IdGenerator } from "../../src/operation/id-generator.js";

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
});

function actionInput(overrides: { action: string; operationId: string; gitRef?: string; deploymentName?: string }) {
  return {
    environment: "local",
    ...(overrides.deploymentName ? { deploymentName: overrides.deploymentName } : {}),
    project: "hivewatch",
    repository: "https://github.com/sepa79/HiveWatch.git",
    gitRef: overrides.gitRef ?? "main",
    component: "api",
    profile: "test",
    action: overrides.action,
    operationId: overrides.operationId,
    updatedAt: "2026-05-17T10:00:00.000Z"
  };
}
