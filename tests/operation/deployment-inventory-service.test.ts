import { describe, expect, it } from "vitest";
import type { Journal } from "../../src/journal/journal.js";
import { DeploymentInventoryService } from "../../src/operation/deployment-inventory-service.js";

describe("deployment inventory service", () => {
  it("returns current deployment state from succeeded lifecycle actions", async () => {
    const service = new DeploymentInventoryService(
      journal([
        event("op-1", "deploy", "main", "test"),
        event("op-2", "upgrade", "v2", "test"),
        event("op-3", "remove", "v2", "normal"),
        event("op-4", "deploy", "main", "test", "failed")
      ]),
      "local"
    );

    await expect(service.list()).resolves.toEqual({
      deployments: [
        {
          environment: "local",
          project: "hivewatch",
          repository: "https://github.com/sepa79/HiveWatch.git",
          gitRef: "v2",
          component: "api",
          profile: "normal",
          status: "removed",
          lastAction: "remove",
          operationId: "op-3",
          updatedAt: "2026-05-17T10:00:00.000Z"
        },
        {
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
      ]
    });
  });

  it("ignores events for other environments", async () => {
    const service = new DeploymentInventoryService(journal([event("op-1", "deploy", "main", "test", "succeeded", "prod")]), "local");

    await expect(service.list()).resolves.toEqual({ deployments: [] });
  });
});

function journal(events: Awaited<ReturnType<Journal["readAll"]>>): Journal {
  return {
    async append() {},
    async readAll() {
      return events;
    }
  };
}

function event(
  operationId: string,
  action: string,
  gitRef: string,
  profile: string,
  status: "succeeded" | "failed" = "succeeded",
  environment = "local"
) {
  return {
    eventId: `${operationId}-evt`,
    operationId,
    operationType: "run_action" as const,
    project: "hivewatch",
    repository: "https://github.com/sepa79/HiveWatch.git",
    gitRef,
    environment,
    profile,
    component: "api",
    action,
    adapter: "ansible" as const,
    status,
    startedAt: "2026-05-17T10:00:00.000Z",
    endedAt: "2026-05-17T10:00:00.000Z",
    reason: "done"
  };
}
