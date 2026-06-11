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
      "docker"
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
            bindSources: ["/mnt/shared_nfs/hiveforge/data/deployed/hivewatch/config"]
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

function journal(composePath: string, content: string): Journal {
  return {
    async append() {},
    async readAll() {
      return [
        {
          eventId: "evt-1",
          operationId: "op-1",
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
      }
    },
    policy: {
      projects: []
    }
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
