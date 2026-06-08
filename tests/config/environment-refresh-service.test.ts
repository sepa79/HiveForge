import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnvironmentConfig } from "../../src/config/environment-loader.js";
import { EnvironmentRefreshService } from "../../src/config/environment-refresh-service.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";

describe("environment refresh service", () => {
  it("refreshes detected Swarm node inventory while preserving policy and vars", async () => {
    const filePath = await writeConfig([
      "current: swarm",
      "environments:",
      "  - id: swarm",
      "    name: Production Swarm",
      "    kind: swarm",
      "    capabilities:",
      "      runtime:",
      "        - docker-swarm",
      "      managedRoot:",
      "        shared: false",
      "        nodes:",
      "          - docker-swarm-mgr-1",
      "      placement: true",
      "    vars:",
      "      imageRepository.project: registry.lan:5000/pockethive",
      "    nodes:",
      "      - id: node-manager-1",
      "        hostname: docker-swarm-mgr-1",
      "        role: manager",
      "        availability: active",
      "        status: ready",
      "        labels:",
      "          pockethive.postgres: \"false\"",
      "    policy:",
      "      projects:",
      "        - id: pockethive",
      "          profiles:",
      "            - swarm-reduced",
      "          actions:",
      "            - deploy",
      "            - update",
      ""
    ]);
    const config = await loadEnvironmentConfig(filePath);
    const service = new EnvironmentRefreshService(filePath, config, {
      docker: scriptedCommandRunner([
        {
          args: ["info", "--format", "{{json .Swarm}}"],
          stdout: JSON.stringify({ LocalNodeState: "active", ControlAvailable: true })
        },
        {
          args: ["node", "ls", "-q"],
          stdout: "node-manager-1\nnode-worker-1\n"
        },
        {
          args: ["node", "inspect", "node-manager-1", "node-worker-1"],
          stdout: JSON.stringify([
            dockerNode({
              id: "node-manager-1",
              hostname: "docker-swarm-mgr-1",
              role: "manager",
              availability: "active",
              status: "ready",
              labels: { "pockethive.postgres": "true" }
            }),
            dockerNode({
              id: "node-worker-1",
              hostname: "docker-swarm-wrk-1",
              role: "worker",
              availability: "active",
              status: "ready",
              labels: { "pockethive.clickhouse": "true" }
            })
          ])
        }
      ])
    });

    const refreshed = await service.refreshCurrent();

    expect(refreshed.current).toEqual({
      id: "swarm",
      name: "Production Swarm",
      kind: "swarm",
      capabilities: {
        runtime: ["docker-swarm"],
        managedRoot: {
          shared: false,
          nodes: ["docker-swarm-mgr-1"]
        },
        placement: true
      },
      vars: {
        "imageRepository.project": "registry.lan:5000/pockethive"
      },
      nodes: [
        {
          id: "node-manager-1",
          hostname: "docker-swarm-mgr-1",
          role: "manager",
          availability: "active",
          status: "ready",
          labels: { "pockethive.postgres": "true" }
        },
        {
          id: "node-worker-1",
          hostname: "docker-swarm-wrk-1",
          role: "worker",
          availability: "active",
          status: "ready",
          labels: { "pockethive.clickhouse": "true" }
        }
      ],
      policy: {
        projects: [
          {
            id: "pockethive",
            profiles: ["swarm-reduced"],
            actions: ["deploy", "update"]
          }
        ]
      }
    });
    await expect(loadEnvironmentConfig(filePath)).resolves.toEqual({
      current: "swarm",
      environments: [refreshed.current]
    });
    await expect(readFile(filePath, "utf8")).resolves.toContain("pockethive.clickhouse: \"true\"");
  });

  it("rejects refresh when autodetection reports a different environment id", async () => {
    const filePath = await writeConfig([
      "current: swarm",
      "environments:",
      "  - id: swarm",
      "    name: Production Swarm",
      "    kind: swarm",
      "    capabilities:",
      "      runtime:",
      "        - docker-swarm",
      "      managedRoot:",
      "        shared: true",
      "      placement: true",
      "    nodes: []",
      "    policy:",
      "      projects: []",
      ""
    ]);
    const config = await loadEnvironmentConfig(filePath);
    const service = new EnvironmentRefreshService(filePath, config, {
      docker: scriptedCommandRunner([
        {
          args: ["info", "--format", "{{json .Swarm}}"],
          stdout: JSON.stringify({ LocalNodeState: "inactive", ControlAvailable: false })
        }
      ])
    });

    await expect(service.refreshCurrent()).rejects.toThrow(
      "Detected environment id docker does not match current environment swarm"
    );
  });
});

async function writeConfig(lines: string[]): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-env-refresh-"));
  const filePath = path.join(dir, "environments.yaml");
  await writeFile(filePath, lines.join("\n"), "utf8");
  return filePath;
}

function scriptedCommandRunner(expected: Array<{ args: string[]; stdout: string }>): CommandRunner {
  return {
    async run(command, args) {
      expect(command).toBe("docker");
      const next = expected.shift();
      if (!next) {
        throw new Error(`Unexpected docker command: ${args.join(" ")}`);
      }
      expect(args).toEqual(next.args);
      return { stdout: next.stdout, stderr: "" };
    }
  };
}

function dockerNode(options: {
  id: string;
  hostname: string;
  role: "manager" | "worker";
  availability: "active" | "pause" | "drain";
  status: string;
  labels: Record<string, string>;
}) {
  return {
    ID: options.id,
    Description: {
      Hostname: options.hostname
    },
    Spec: {
      Role: options.role,
      Availability: options.availability,
      Labels: options.labels
    },
    Status: {
      State: options.status
    }
  };
}
