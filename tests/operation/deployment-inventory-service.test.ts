import { describe, expect, it } from "vitest";
import { DeploymentInventoryService } from "../../src/operation/deployment-inventory-service.js";
import type { DeploymentStateStore } from "../../src/operation/deployment-state-store.js";

describe("deployment inventory service", () => {
  it("returns current deployment state from the deployment state store", async () => {
    const service = new DeploymentInventoryService(
      stateStore([
        {
          deploymentId: "deployment-1",
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
      ]),
      "local"
    );

    await expect(service.list()).resolves.toEqual({
      deployments: [
        {
          deploymentId: "deployment-1",
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
});

function stateStore(records: Awaited<ReturnType<DeploymentStateStore["listDeployments"]>>): DeploymentStateStore {
  return {
    async listDeployments(environment?: string) {
      return records.filter((record) => !environment || record.environment === environment);
    },
    async getDeployment() {
      return null;
    },
    async findDeployment() {
      return null;
    },
    async ensureDeployment() {
      throw new Error("not used");
    },
    async recordLifecycleAction() {
      return null;
    },
    async recordDeploymentFailure() {
      throw new Error("not used");
    }
  };
}
