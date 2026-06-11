import { describe, expect, it } from "vitest";
import type { EnvironmentDefinition } from "../../src/config/environment-types.js";
import { DeploymentRuntimeStatusService } from "../../src/operation/deployment-runtime-status-service.js";
import type { DeploymentStateRecord, DeploymentStateStore } from "../../src/operation/deployment-state-store.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";

describe("deployment runtime status service", () => {
  it("reports running containers selected by the HiveForge deployment label", async () => {
    const service = new DeploymentRuntimeStatusService(
      scriptedDocker([
        {
          args: [
            "ps",
            "-a",
            "--filter",
            "label=hiveforge.deployment=deployment-1",
            "--format",
            "{{json .}}"
          ],
          stdout: `${JSON.stringify({ ID: "abc123" })}\n`
        },
        {
          args: ["inspect", "abc123"],
          stdout: JSON.stringify([
            {
              Id: "abc123",
              Name: "/hivewatch-api-1",
              State: { Status: "running", Health: { Status: "healthy" } },
              Config: {
                Image: "hivewatch:test",
                Labels: {
                  "hiveforge.deployment": "deployment-1"
                }
              },
              Mounts: [{ Source: "/opt/hiveforge/data/deployed/hivewatch", Destination: "/app/config", Type: "bind" }]
            }
          ])
        }
      ]),
      dockerEnvironment(),
      stateStore([deployment()])
    );

    await expect(service.check({ projectId: "hivewatch", component: "api" })).resolves.toEqual({
      deploymentId: "deployment-1",
      deploymentName: "hivewatch",
      projectId: "hivewatch",
      component: "api",
      summary: "running",
      requiredLabels: {
        "hiveforge.deployment": "deployment-1"
      },
      containers: [
        {
          id: "abc123",
          name: "hivewatch-api-1",
          image: "hivewatch:test",
          state: "running",
          status: "running",
          health: "healthy",
          labels: {
            "hiveforge.deployment": "deployment-1"
          },
          mounts: [{ source: "/opt/hiveforge/data/deployed/hivewatch", destination: "/app/config", type: "bind" }]
        }
      ],
      services: []
    });
  });

  it("reports missing when no Docker resources carry the required labels", async () => {
    const service = new DeploymentRuntimeStatusService(
      scriptedDocker([
        {
          args: ["ps", "-a", "--filter", "label=hiveforge.deployment=deployment-1", "--format", "{{json .}}"],
          stdout: ""
        }
      ]),
      dockerEnvironment(),
      stateStore([deployment()])
    );

    await expect(service.check({ deploymentId: "deployment-1" })).resolves.toEqual({
      deploymentId: "deployment-1",
      deploymentName: "hivewatch",
      projectId: "hivewatch",
      component: "api",
      summary: "missing",
      requiredLabels: {
        "hiveforge.deployment": "deployment-1"
      },
      containers: [],
      services: [],
      reason:
        "No Docker containers or services matched the required HiveForge labels. Runtime status does not infer ownership from names."
    });
  });

  it("summarizes swarm deployments from current service replicas instead of historical exited tasks", async () => {
    const service = new DeploymentRuntimeStatusService(
      scriptedDocker([
        {
          args: ["ps", "-a", "--filter", "label=hiveforge.deployment=deployment-1", "--format", "{{json .}}"],
          stdout: `${JSON.stringify({ ID: "old123" })}\n${JSON.stringify({ ID: "new123" })}\n`
        },
        {
          args: ["inspect", "old123", "new123"],
          stdout: JSON.stringify([
            {
              Id: "old123",
              Name: "/stack-api.1.old",
              State: { Status: "exited", Health: { Status: "unhealthy" } },
              Config: {
                Image: "hivewatch:test",
                Labels: {
                  "hiveforge.deployment": "deployment-1",
                  "com.docker.swarm.service.id": "svc1"
                }
              },
              Mounts: []
            },
            {
              Id: "new123",
              Name: "/stack-api.1.new",
              State: { Status: "running", Health: { Status: "healthy" } },
              Config: {
                Image: "hivewatch:test",
                Labels: {
                  "hiveforge.deployment": "deployment-1",
                  "com.docker.swarm.service.id": "svc1"
                }
              },
              Mounts: []
            }
          ])
        },
        {
          args: ["service", "ls", "--filter", "label=hiveforge.deployment=deployment-1", "--format", "{{json .}}"],
          stdout: `${JSON.stringify({
            ID: "svc1",
            Name: "stack_api",
            Image: "hivewatch:test",
            Mode: "replicated",
            Replicas: "1/1",
            Labels: "hiveforge.deployment=deployment-1"
          })}\n${JSON.stringify({
            ID: "svc2",
            Name: "stack_init",
            Image: "hivewatch:test",
            Mode: "replicated",
            Replicas: "0/1",
            Labels: "hiveforge.deployment=deployment-1,hiveforge.runtime.ignore=true"
          })}\n`
        },
        {
          args: ["service", "inspect", "svc1", "svc2"],
          stdout: JSON.stringify([
            {
              ID: "svc1",
              Spec: {
                Labels: {
                  "hiveforge.deployment": "deployment-1"
                }
              }
            },
            {
              ID: "svc2",
              Spec: {
                Labels: {
                  "hiveforge.deployment": "deployment-1",
                  "hiveforge.runtime.ignore": "true"
                }
              }
            }
          ])
        },
        {
          args: ["service", "ps", "--no-trunc", "--format", "{{json .}}", "svc1", "svc2"],
          stdout: `${JSON.stringify({
            ID: "task1",
            Name: "stack_api.1.task1",
            Image: "hivewatch:test",
            Node: "swarm-1",
            DesiredState: "Running",
            CurrentState: "Running 10 seconds ago",
            Error: "",
            Ports: ""
          })}\n${JSON.stringify({
            ID: "task2",
            Name: "stack_init.1.task2",
            Image: "hivewatch:test",
            Node: "swarm-1",
            DesiredState: "Shutdown",
            CurrentState: "Failed 20 seconds ago",
            Error: "task failed",
            Ports: ""
          })}\n`
        }
      ]),
      swarmEnvironment(),
      stateStore([deployment()])
    );

    const result = await service.check({ deploymentId: "deployment-1" });

    expect(result.summary).toBe("running");
    expect(result.services).toHaveLength(2);
    expect(result.services[0]?.tasks).toEqual([
      {
        id: "task1",
        name: "stack_api.1.task1",
        image: "hivewatch:test",
        node: "swarm-1",
        desiredState: "Running",
        currentState: "Running 10 seconds ago"
      }
    ]);
    expect(result.services[1]?.tasks).toEqual([
      {
        id: "task2",
        name: "stack_init.1.task2",
        image: "hivewatch:test",
        node: "swarm-1",
        desiredState: "Shutdown",
        currentState: "Failed 20 seconds ago",
        error: "task failed"
      }
    ]);
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0]?.id).toBe("new123");
  });

  it("does not call Docker when no deployment state matches the request", async () => {
    const service = new DeploymentRuntimeStatusService(scriptedDocker([]), dockerEnvironment(), stateStore([]));

    await expect(service.check({ projectId: "hivewatch", component: "api" })).resolves.toEqual({
      projectId: "hivewatch",
      component: "api",
      summary: "missing",
      requiredLabels: {},
      containers: [],
      services: [],
      reason: "No deployment state matched the requested deployment selector."
    });
  });
});

function scriptedDocker(steps: Array<{ args: string[]; stdout: string }>): CommandRunner {
  return {
    async run(command, args) {
      const step = steps.shift();
      if (!step) {
        throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
      }
      expect(command).toBe("docker");
      expect(args).toEqual(step.args);
      return { stdout: step.stdout, stderr: "" };
    }
  };
}

function stateStore(records: DeploymentStateRecord[]): DeploymentStateStore {
  return {
    async listDeployments() {
      return records;
    },
    async getDeployment(deploymentId) {
      return records.find((record) => record.deploymentId === deploymentId) ?? null;
    },
    async findDeployment(lookup) {
      return (
        records.find(
          (record) =>
            record.environment === lookup.environment &&
            record.project === lookup.project &&
            record.component === lookup.component &&
            (record.profile ?? undefined) === lookup.profile
        ) ?? null
      );
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

function deployment(): DeploymentStateRecord {
  return {
    deploymentId: "deployment-1",
    deploymentName: "hivewatch",
    environment: "docker",
    project: "hivewatch",
    repository: "https://github.com/sepa79/HiveWatch.git",
    gitRef: "main",
    component: "api",
    status: "deployed",
    lastAction: "deploy",
    operationId: "op-1",
    updatedAt: "2026-05-17T10:00:00.000Z"
  };
}

function dockerEnvironment(): EnvironmentDefinition {
  return {
    id: "docker",
    name: "Docker",
    kind: "docker",
    capabilities: {
      runtime: ["docker-single"],
      managedRoot: {
        shared: true
      }
    },
    policy: {
      projects: []
    }
  };
}

function swarmEnvironment(): EnvironmentDefinition {
  return {
    ...dockerEnvironment(),
    kind: "swarm",
    capabilities: {
      runtime: ["docker-swarm"],
      managedRoot: {
        shared: true
      }
    }
  };
}
