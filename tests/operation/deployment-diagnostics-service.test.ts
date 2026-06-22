import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { EnvironmentDefinition } from "../../src/config/environment-types.js";
import type { Journal } from "../../src/journal/journal.js";
import { DeploymentComposeService } from "../../src/operation/deployment-compose-service.js";
import { DeploymentDiagnosticsService } from "../../src/operation/deployment-diagnostics-service.js";
import { DeploymentRuntimeStatusService } from "../../src/operation/deployment-runtime-status-service.js";
import type { DeploymentStateRecord, DeploymentStateStore } from "../../src/operation/deployment-state-store.js";
import { RuntimeDiagnosticsService } from "../../src/runtime/runtime-diagnostics-service.js";
import type { RuntimePaths } from "../../src/runtime/runtime-paths.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";

describe("deployment diagnostics service", () => {
  it("returns state, Docker runtime, compose artifact, path diagnostics, and compose bind validation", async () => {
    const runtimePaths = await createRuntimePaths();
    const composePath = path.join(runtimePaths.dataRoot, "deployed/hivewatch/stacks/compose.yml");
    const composeContent = [
      "services:",
      "  api:",
      "    image: hivewatch:test",
      "    volumes:",
      "      - /mnt/shared_nfs/hiveforge/data/deployed/hivewatch/config:/config",
      "      - /data/postgres:/var/lib/postgresql/data",
      "",
      "volumes:",
      "  hivewatch-data:",
      ""
    ].join("\n");
    await mkdir(path.dirname(composePath), { recursive: true });
    await writeFile(composePath, composeContent, "utf8");

    const deployment = deploymentRecord();
    const environment = dockerEnvironment();
    const service = new DeploymentDiagnosticsService(
      stateStore([deployment]),
      new DeploymentRuntimeStatusService(
        scriptedDocker([
          {
            args: ["ps", "-a", "--filter", "label=hiveforge.deployment=deployment-1", "--format", "{{json .}}"],
            stdout: `${JSON.stringify({ ID: "abc123" })}\n`
          },
          {
            args: ["inspect", "abc123"],
            stdout: JSON.stringify([
              {
                Id: "abc123",
                Name: "/deployment-1-api-1",
                State: { Status: "running" },
                Config: {
                  Image: "hivewatch:test",
                  Labels: {
                    "hiveforge.deployment": "deployment-1"
                  }
                },
                Mounts: [
                  {
                    Source: "/mnt/shared_nfs/hiveforge/data/deployed/hivewatch/config",
                    Destination: "/config",
                    Type: "bind"
                  }
                ]
              }
            ])
          }
        ]),
        environment,
        stateStore([deployment])
      ),
      new DeploymentComposeService(journal(composePath, composeContent)),
      new RuntimeDiagnosticsService(runtimePaths, environment),
      environment
    );

    const result = await service.diagnose({ deploymentId: "deployment-1" });

    expect(result.state).toEqual({
      status: "present",
      deployment
    });
    expect(result.runtime.summary).toBe("running");
    expect(result.compose).toMatchObject({
      operationId: "op-1",
      status: "present",
      artifact: {
        path: composePath,
        digestMatchesJournal: true
      }
    });
    expect(result.composeValidation).toMatchObject({
      status: "checked",
      result: {
        ok: true,
        bindSourceDir: "/mnt/shared_nfs/hiveforge/data/deployed/hivewatch",
        services: [
          {
            service: "api",
            bindSources: ["/mnt/shared_nfs/hiveforge/data/deployed/hivewatch/config", "/data/postgres"]
          }
        ],
        issues: []
      }
    });
    expect(result.hiveforge.managedRoot).toMatchObject({
      bindSourceRoot: "/mnt/shared_nfs/hiveforge",
      managedDataBindSourceRoot: "/mnt/shared_nfs/hiveforge/data"
    });
  });

  it("correlates Swarm placement and bind mount failures with the recorded Compose service", async () => {
    const runtimePaths = await createRuntimePaths();
    const composePath = path.join(runtimePaths.dataRoot, "deployed/pockethive/stacks/compose.yml");
    const redisSource = "/mnt/shared_nfs/hiveforge/data/deployed/pockethive/redis";
    const composeContent = [
      "services:",
      "  redis:",
      "    image: registry.lan:5000/pockethive/redis:dev-1",
      "    volumes:",
      `      - ${redisSource}:/data`,
      "    deploy:",
      "      placement:",
      "        constraints:",
      "          - node.labels.pockethive.redis == true",
      ""
    ].join("\n");
    await mkdir(path.dirname(composePath), { recursive: true });
    await writeFile(composePath, composeContent, "utf8");

    const deployment: DeploymentStateRecord = {
      ...deploymentRecord(),
      deploymentId: "deployment-pockethive",
      deploymentName: "pockethive",
      environment: "swarm",
      project: "pockethive",
      component: "stack",
      profile: "swarm-full",
      operationId: "op-pockethive"
    };
    const environment = swarmEnvironment();
    const service = new DeploymentDiagnosticsService(
      stateStore([deployment]),
      new DeploymentRuntimeStatusService(
        scriptedDocker([
          {
            args: [
              "ps",
              "-a",
              "--filter",
              "label=hiveforge.deployment=deployment-pockethive",
              "--format",
              "{{json .}}"
            ],
            stdout: ""
          },
          {
            args: [
              "service",
              "ls",
              "--filter",
              "label=hiveforge.deployment=deployment-pockethive",
              "--format",
              "{{json .}}"
            ],
            stdout: `${JSON.stringify({
              ID: "svc-redis",
              Name: "pockethive_redis",
              Image: "registry.lan:5000/pockethive/redis:dev-1",
              Mode: "replicated",
              Replicas: "0/1",
              Labels: "hiveforge.deployment=deployment-pockethive"
            })}\n`
          },
          {
            args: ["service", "inspect", "svc-redis"],
            stdout: JSON.stringify([
              {
                ID: "svc-redis",
                Spec: {
                  Labels: {
                    "hiveforge.deployment": "deployment-pockethive"
                  }
                }
              }
            ])
          },
          {
            args: ["service", "ps", "--no-trunc", "--format", "{{json .}}", "svc-redis"],
            stdout: `${JSON.stringify({
              ID: "task-placement",
              Name: "pockethive_redis.1.task-placement",
              Image: "registry.lan:5000/pockethive/redis:dev-1",
              Node: "",
              DesiredState: "Running",
              CurrentState: "Rejected 4 seconds ago",
              Error: "no suitable node (scheduling constraints not satisfied)",
              Ports: ""
            })}\n${JSON.stringify({
              ID: "task-mount",
              Name: "pockethive_redis.1.task-mount",
              Image: "registry.lan:5000/pockethive/redis:dev-1",
              Node: "docker-swarm-worker-2",
              DesiredState: "Running",
              CurrentState: "Rejected 2 seconds ago",
              Error: `invalid mount config for type "bind": bind source path does not exist: ${redisSource} HIVEMIND_TOKEN=super-secret`,
              Ports: ""
            })}\n`
          }
        ]),
        environment,
        stateStore([deployment])
      ),
      new DeploymentComposeService(journal(composePath, composeContent, "op-pockethive")),
      new RuntimeDiagnosticsService(runtimePaths, environment),
      environment
    );

    const result = await service.diagnose({ deploymentId: "deployment-pockethive" });

    expect(result.analysis.summary).toBe("degraded");
    expect(JSON.stringify(result.analysis)).not.toContain("super-secret");
    expect(JSON.stringify(result.analysis)).toContain("HIVEMIND_TOKEN=[redacted]");
    expect(result.analysis.expected.services).toEqual([
      {
        service: "redis",
        image: "registry.lan:5000/pockethive/redis:dev-1",
        bindSources: [redisSource],
        bindMounts: [{ source: redisSource, target: "/data", type: "bind" }],
        placementConstraints: ["node.labels.pockethive.redis == true"]
      }
    ]);
    expect(result.analysis.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          type: "unhealthy_resource",
          service: "redis",
          runtimeResource: "pockethive_redis",
          message: "Docker Swarm service pockethive_redis is not at desired replicas: 0/1."
        }),
        expect.objectContaining({
          severity: "error",
          type: "repeated_task_failures",
          service: "redis",
          runtimeResource: "pockethive_redis"
        }),
        expect.objectContaining({
          severity: "error",
          type: "placement_mismatch",
          service: "redis",
          runtimeResource: "pockethive_redis",
          message:
            "Docker Swarm cannot place service pockethive_redis; rendered Compose declares placement constraints: node.labels.pockethive.redis == true."
        }),
        expect.objectContaining({
          severity: "error",
          type: "bind_mount_error",
          service: "redis",
          runtimeResource: "pockethive_redis",
          node: "docker-swarm-worker-2",
          source: redisSource,
          target: "/data",
          message: `Docker reported a bind mount failure for service pockethive_redis: ${redisSource}. Rendered target is /data. The failing task was scheduled on docker-swarm-worker-2.`
        })
      ])
    );
  });

  it("reports cleanly exited monitored containers as degraded diagnostics", async () => {
    const runtimePaths = await createRuntimePaths();
    const composePath = path.join(runtimePaths.dataRoot, "deployed/hivewatch/stacks/compose.yml");
    const composeContent = [
      "services:",
      "  api:",
      "    image: hivewatch:test",
      ""
    ].join("\n");
    await mkdir(path.dirname(composePath), { recursive: true });
    await writeFile(composePath, composeContent, "utf8");

    const deployment = deploymentRecord();
    const environment = dockerEnvironment();
    const service = new DeploymentDiagnosticsService(
      stateStore([deployment]),
      new DeploymentRuntimeStatusService(
        scriptedDocker([
          {
            args: ["ps", "-a", "--filter", "label=hiveforge.deployment=deployment-1", "--format", "{{json .}}"],
            stdout: `${JSON.stringify({ ID: "api-exited" })}\n`
          },
          {
            args: ["inspect", "api-exited"],
            stdout: JSON.stringify([
              {
                Id: "api-exited",
                Name: "/hivewatch-api-1",
                State: {
                  Status: "exited",
                  ExitCode: 0,
                  FinishedAt: "2026-06-19T16:00:00.000Z"
                },
                Config: {
                  Image: "hivewatch:test",
                  Labels: {
                    "hiveforge.deployment": "deployment-1",
                    "com.docker.compose.service": "api"
                  }
                },
                Mounts: []
              }
            ])
          }
        ]),
        environment,
        stateStore([deployment])
      ),
      new DeploymentComposeService(journal(composePath, composeContent)),
      new RuntimeDiagnosticsService(runtimePaths, environment),
      environment
    );

    const result = await service.diagnose({ deploymentId: "deployment-1" });

    expect(result.runtime.summary).toBe("exited");
    expect(result.analysis.summary).toBe("degraded");
    expect(result.analysis.findings).toEqual([
      expect.objectContaining({
        severity: "warning",
        type: "last_exit_hint",
        service: "api",
        runtimeResource: "hivewatch-api-1",
        message: "Docker container hivewatch-api-1 is exited."
      })
    ]);
  });

  it("does not degrade healthy Swarm diagnostics for ignored services or historical failed tasks", async () => {
    const runtimePaths = await createRuntimePaths();
    const composePath = path.join(runtimePaths.dataRoot, "deployed/hivewatch/stacks/compose.yml");
    const composeContent = [
      "services:",
      "  api:",
      "    image: hivewatch:test",
      "  init:",
      "    image: hivewatch-init:test",
      ""
    ].join("\n");
    await mkdir(path.dirname(composePath), { recursive: true });
    await writeFile(composePath, composeContent, "utf8");

    const deployment: DeploymentStateRecord = {
      ...deploymentRecord(),
      environment: "swarm",
      operationId: "op-swarm-ok"
    };
    const environment = swarmEnvironment();
    const service = new DeploymentDiagnosticsService(
      stateStore([deployment]),
      new DeploymentRuntimeStatusService(
        scriptedDocker([
          {
            args: ["ps", "-a", "--filter", "label=hiveforge.deployment=deployment-1", "--format", "{{json .}}"],
            stdout: ""
          },
          {
            args: ["service", "ls", "--filter", "label=hiveforge.deployment=deployment-1", "--format", "{{json .}}"],
            stdout: `${JSON.stringify({
              ID: "svc-api",
              Name: "hivewatch_api",
              Image: "hivewatch:test",
              Mode: "replicated",
              Replicas: "1/1",
              Labels: "hiveforge.deployment=deployment-1"
            })}\n${JSON.stringify({
              ID: "svc-init",
              Name: "hivewatch_init",
              Image: "hivewatch-init:test",
              Mode: "replicated",
              Replicas: "0/1",
              Labels: "hiveforge.deployment=deployment-1,hiveforge.runtime.ignore=true"
            })}\n`
          },
          {
            args: ["service", "inspect", "svc-api", "svc-init"],
            stdout: JSON.stringify([
              {
                ID: "svc-api",
                Spec: {
                  Labels: {
                    "hiveforge.deployment": "deployment-1"
                  }
                }
              },
              {
                ID: "svc-init",
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
            args: ["service", "ps", "--no-trunc", "--format", "{{json .}}", "svc-api", "svc-init"],
            stdout: `${JSON.stringify({
              ID: "task-api-running",
              Name: "hivewatch_api.1.task-api-running",
              Image: "hivewatch:test",
              Node: "swarm-1",
              DesiredState: "Running",
              CurrentState: "Running 1 minute ago",
              Error: "",
              Ports: ""
            })}\n${JSON.stringify({
              ID: "task-api-old",
              Name: "hivewatch_api.1.task-api-old",
              Image: "hivewatch:test",
              Node: "swarm-1",
              DesiredState: "Shutdown",
              CurrentState: "Failed 5 minutes ago",
              Error: "old task failed before replacement",
              Ports: ""
            })}\n${JSON.stringify({
              ID: "task-init",
              Name: "hivewatch_init.1.task-init",
              Image: "hivewatch-init:test",
              Node: "swarm-1",
              DesiredState: "Shutdown",
              CurrentState: "Failed 10 minutes ago",
              Error: "ignored init task failed",
              Ports: ""
            })}\n`
          }
        ]),
        environment,
        stateStore([deployment])
      ),
      new DeploymentComposeService(journal(composePath, composeContent, "op-swarm-ok")),
      new RuntimeDiagnosticsService(runtimePaths, environment),
      environment
    );

    const result = await service.diagnose({ deploymentId: "deployment-1" });

    expect(result.runtime.summary).toBe("running");
    expect(result.analysis.summary).toBe("ok");
    expect(result.analysis.findings).toEqual([]);
  });
});

async function createRuntimePaths(): Promise<RuntimePaths> {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-runtime-"));
  const dataRoot = path.join(runtimeRoot, "data");
  const journalDir = path.join(runtimeRoot, "journal");
  const workspace = path.join(runtimeRoot, "workspace");
  await mkdir(dataRoot);
  await mkdir(journalDir);
  await mkdir(workspace);
  await writeFile(path.join(runtimeRoot, "projects.yaml"), "projects: []\n");
  await writeFile(path.join(runtimeRoot, "environments.yaml"), "current: docker\nenvironments: []\n");
  await writeFile(path.join(dataRoot, "runtime-env.json"), '{"version":1,"entries":[]}\n');
  return {
    runtimeRoot,
    registry: path.join(runtimeRoot, "projects.yaml"),
    environments: path.join(runtimeRoot, "environments.yaml"),
    workspace,
    journal: journalDir,
    dataRoot,
    runtimeEnv: path.join(dataRoot, "runtime-env.json"),
    stateDb: path.join(dataRoot, "hiveforge.sqlite")
  };
}

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

function journal(composePath: string, content: string, operationId = "op-1"): Journal {
  return {
    async append() {},
    async readAll() {
      return [
        {
          eventId: "evt-1",
          operationId,
          operationType: "run_action" as const,
          project: "hivewatch",
          repository: "https://github.com/sepa79/HiveWatch.git",
          gitRef: "main",
          environment: "docker",
          component: "api",
          action: "deploy",
          adapter: "ansible",
          status: "succeeded" as const,
          startedAt: "2026-05-17T10:00:00.000Z",
          endedAt: "2026-05-17T10:00:00.000Z",
          reason: "Action completed successfully",
          artifacts: [
            {
              name: "compose" as const,
              path: composePath,
              mediaType: "application/yaml",
              sha256: sha256(content),
              bytes: Buffer.byteLength(content),
              recordedAt: "2026-05-17T10:00:00.000Z"
            }
          ]
        }
      ];
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

function deploymentRecord(): DeploymentStateRecord {
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
        shared: true,
        bindSourceRoot: "/mnt/shared_nfs/hiveforge"
      },
      bindSources: {
        allowed: ["/data/postgres"]
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
    id: "swarm",
    name: "Swarm",
    kind: "swarm",
    capabilities: {
      runtime: ["docker-swarm"],
      managedRoot: {
        shared: true,
        bindSourceRoot: "/mnt/shared_nfs/hiveforge"
      }
    }
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
