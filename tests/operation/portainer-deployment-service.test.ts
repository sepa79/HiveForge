import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Dispatcher } from "undici";
import { PortainerDeploymentService } from "../../src/operation/portainer-deployment-service.js";
import type { EnvironmentDefinition } from "../../src/config/environment-types.js";
import type { DeploymentStateRecord } from "../../src/operation/deployment-state-store.js";

interface CapturedRequestInit extends RequestInit {
  dispatcher?: Dispatcher;
}

describe("Portainer deployment service", () => {
  it("creates a new Swarm stack through the Portainer API", async () => {
    const composeFile = await writeCompose("services:\n  api:\n    image: hivewatch:test\n");
    const calls: Array<{ url: string; init?: CapturedRequestInit }> = [];
    const service = new PortainerDeploymentService(
      environment(),
      async (input, init) => {
        calls.push({ url: String(input), init });
        if (calls.length === 1) {
          return jsonResponse({ Swarm: { Cluster: { ID: "swarm-cluster-1" } } });
        }
        return jsonResponse({ Id: 41, Name: "hivewatch" });
      }
    );

    await expect(service.deploy({ deployment: deployment(), composeFile })).resolves.toMatchObject({
      runtime: "docker-swarm",
      executorKind: "portainer-stack",
      portainer: {
        endpointId: 3,
        stackId: 41,
        stackName: "hivewatch"
      }
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      url: "https://portainer.example.com:9443/api/endpoints/3/docker/info"
    });
    expect(calls[1]).toMatchObject({
      url: "https://portainer.example.com:9443/api/stacks/create/swarm/string?endpointId=3"
    });
    expect(calls[1].init?.headers).toMatchObject({
      "X-API-Key": "ptr_test_token",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({
      Name: "hivewatch",
      StackFileContent: "services:\n  api:\n    image: hivewatch:test\n",
      SwarmID: "swarm-cluster-1",
      Env: []
    });
    expect(calls[0].init?.dispatcher).toBeUndefined();
  });

  it("updates an existing Portainer stack by recorded stackId", async () => {
    const composeFile = await writeCompose("services:\n  api:\n    image: hivewatch:test\n");
    const calls: Array<{ url: string; init?: CapturedRequestInit }> = [];
    const service = new PortainerDeploymentService(
      environment(),
      async (input, init) => {
        calls.push({ url: String(input), init });
        return jsonResponse({ Id: 41, Name: "hivewatch" });
      }
    );

    await expect(
      service.deploy({
        deployment: deployment({
          portainer: {
            endpointId: 3,
            stackId: 41,
            stackName: "hivewatch"
          }
        }),
        composeFile
      })
    ).resolves.toMatchObject({
      portainer: {
        endpointId: 3,
        stackId: 41,
        stackName: "hivewatch"
      }
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "https://portainer.example.com:9443/api/stacks/41?endpointId=3"
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      StackFileContent: "services:\n  api:\n    image: hivewatch:test\n",
      Env: [],
      PullImage: false,
      Prune: false
    });
  });

  it("removes an existing Portainer stack by recorded stackId", async () => {
    const calls: Array<{ url: string; init?: CapturedRequestInit }> = [];
    const service = new PortainerDeploymentService(
      environment(),
      async (input, init) => {
        calls.push({ url: String(input), init });
        return jsonResponse({});
      }
    );

    await expect(
      service.remove({
        deployment: deployment({
          portainer: {
            endpointId: 3,
            stackId: 41,
            stackName: "hivewatch"
          }
        })
      })
    ).resolves.toMatchObject({
      runtime: "docker-swarm",
      executorKind: "portainer-stack"
    });

    expect(calls).toEqual([
      {
        url: "https://portainer.example.com:9443/api/stacks/41?endpointId=3",
        init: expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            "X-API-Key": "ptr_test_token"
          })
        })
      }
    ]);
  });

  it("fails explicitly when the recorded Portainer endpoint drifts from the environment config", async () => {
    const service = new PortainerDeploymentService(environment(), async () => {
      throw new Error("fetch should not be called");
    });

    await expect(
      service.remove({
        deployment: deployment({
          portainer: {
            endpointId: 9,
            stackId: 41,
            stackName: "hivewatch"
          }
        })
      })
    ).rejects.toThrow("recorded for endpoint 9, but environment 3 is configured");
  });

  it("opts into insecure TLS only when configured explicitly", async () => {
    const composeFile = await writeCompose("services:\n  api:\n    image: hivewatch:test\n");
    const calls: Array<{ url: string; init?: CapturedRequestInit }> = [];
    const service = new PortainerDeploymentService(
      environment({
        tlsInsecureSkipVerify: true
      }),
      async (input, init) => {
        calls.push({ url: String(input), init });
        if (calls.length === 1) {
          return jsonResponse({ Swarm: { Cluster: { ID: "swarm-cluster-1" } } });
        }
        return jsonResponse({ Id: 41, Name: "hivewatch" });
      }
    );

    await service.deploy({ deployment: deployment(), composeFile });

    expect(calls).toHaveLength(2);
    expect(calls[0].init?.dispatcher).toBeDefined();
    expect(calls[1].init?.dispatcher).toBeDefined();
  });
});

async function writeCompose(content: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-portainer-compose-"));
  const composeFile = path.join(dir, "compose.yml");
  await writeFile(composeFile, content, "utf8");
  return composeFile;
}

function environment(
  overrides: Partial<NonNullable<NonNullable<EnvironmentDefinition["deployment"]>["portainer"]>> = {}
): EnvironmentDefinition {
  return {
    id: "swarm",
    name: "Swarm",
    kind: "swarm",
    capabilities: {
      runtime: ["docker-swarm"],
      managedRoot: { shared: true }
    },
    deployment: {
      executor: "portainer-stack",
      portainer: {
        baseUrl: "https://portainer.example.com:9443/api",
        endpointId: 3,
        apiKey: "ptr_test_token",
        ...overrides
      }
    },
    policy: {
      projects: []
    }
  };
}

function deployment(overrides: Partial<DeploymentStateRecord> = {}): DeploymentStateRecord {
  return {
    deploymentId: "deployment-1",
    deploymentName: "hivewatch",
    executorKind: "portainer-stack",
    environment: "swarm",
    project: "hivewatch",
    repository: "https://example.test/hivewatch.git",
    gitRef: "main",
    component: "api",
    status: "deployed",
    lastAction: "deploy",
    operationId: "op-1",
    updatedAt: "2026-08-18T00:00:00.000Z",
    portainer: {
      endpointId: 3,
      stackName: "hivewatch"
    },
    ...overrides
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}
