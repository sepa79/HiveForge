import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRuntimePaths } from "../../src/runtime/runtime-paths.js";
import { loadEnvironmentConfig } from "../../src/config/environment-loader.js";
import { loadProjectRegistryConfig } from "../../src/config/project-registry-loader.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";

describe("runtime paths", () => {
  it("initializes missing base dir files beside an existing compose file", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-runtime-"));
    await writeFile(path.join(baseDir, "docker-compose.yml"), "services: {}\n", "utf8");

    const paths = await resolveRuntimePaths({ baseDir, requireEnvironments: true });

    expect(paths).toEqual({
      baseDir,
      registry: path.join(baseDir, "projects.yaml"),
      environments: path.join(baseDir, "environments.yaml"),
      workspace: path.join(baseDir, "workspace"),
      journal: path.join(baseDir, "journal"),
      dataRoot: path.join(baseDir, "data"),
      runtimeEnv: path.join(baseDir, "data", "runtime-env.json")
    });
    await expect(loadProjectRegistryConfig(paths.registry)).resolves.toEqual({ projects: [] });
    await expect(loadEnvironmentConfig(paths.environments ?? "")).resolves.toMatchObject({
      current: "docker",
      environments: [
        {
          id: "docker",
          policy: { projects: [] }
        }
      ]
    });
    expect((await readdir(baseDir)).sort()).toEqual([
      "data",
      "docker-compose.yml",
      "environments.yaml",
      "journal",
      "projects.yaml",
      "workspace"
    ]);
    await expect(readFile(path.join(baseDir, "journal", "operations.jsonl"), "utf8")).resolves.toBe("");
    await expect(readFile(path.join(baseDir, "data", "runtime-env.json"), "utf8")).resolves.toContain('"entries": []');
  });

  it("does not overwrite existing registry or environment config", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-runtime-"));
    await writeFile(path.join(baseDir, "projects.yaml"), "# keep projects\nprojects: []\n", "utf8");
    await writeFile(
      path.join(baseDir, "environments.yaml"),
      [
        "# keep environments",
        "current: docker",
        "environments:",
        "  - id: docker",
        "    name: Docker host",
        "    kind: docker",
        "    capabilities:",
        "      runtime:",
        "        - docker-single",
        "      managedRoot:",
        "        shared: true",
        "    policy:",
        "      projects: []",
        ""
      ].join("\n"),
      "utf8"
    );

    await resolveRuntimePaths({
      baseDir,
      requireEnvironments: true,
      defaultEnvironmentDocker: failingCommandRunner()
    });

    await expect(readFile(path.join(baseDir, "projects.yaml"), "utf8")).resolves.toBe("# keep projects\nprojects: []\n");
    await expect(readFile(path.join(baseDir, "environments.yaml"), "utf8")).resolves.toContain("# keep environments");
  });

  it("initializes a swarm environment with detected Docker nodes", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-runtime-"));

    const paths = await resolveRuntimePaths({
      baseDir,
      requireEnvironments: true,
      defaultEnvironmentDocker: scriptedCommandRunner([
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
              labels: {}
            })
          ])
        }
      ])
    });

    await expect(loadEnvironmentConfig(paths.environments ?? "")).resolves.toEqual({
      current: "swarm",
      environments: [
        {
          id: "swarm",
          name: "Docker Swarm",
          kind: "swarm",
          capabilities: {
            runtime: ["docker-swarm"],
            managedRoot: {
              shared: true
            },
            placement: true
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
              labels: {}
            }
          ],
          policy: {
            projects: []
          }
        }
      ]
    });
  });

  it("keeps the Docker host default when Docker Swarm is inactive", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-runtime-"));

    const paths = await resolveRuntimePaths({
      baseDir,
      requireEnvironments: true,
      defaultEnvironmentDocker: scriptedCommandRunner([
        {
          args: ["info", "--format", "{{json .Swarm}}"],
          stdout: JSON.stringify({ LocalNodeState: "inactive", ControlAvailable: false })
        }
      ])
    });

    await expect(loadEnvironmentConfig(paths.environments ?? "")).resolves.toMatchObject({
      current: "docker",
      environments: [
        {
          id: "docker",
          kind: "docker",
          capabilities: {
            runtime: ["docker-single"]
          }
        }
      ]
    });
  });

  it("rejects base dir autodetection on an active Swarm worker", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-runtime-"));
    const environmentsPath = path.join(baseDir, "environments.yaml");

    await expect(
      resolveRuntimePaths({
        baseDir,
        requireEnvironments: true,
        defaultEnvironmentDocker: scriptedCommandRunner([
          {
            args: ["info", "--format", "{{json .Swarm}}"],
            stdout: JSON.stringify({ LocalNodeState: "active", ControlAvailable: false })
          }
        ])
      })
    ).rejects.toThrow("Docker Swarm is active but this node is not a manager");
    await expect(stat(environmentsPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps an explicit host data root separate from the container data root", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-runtime-"));

    const paths = await resolveRuntimePaths({
      baseDir,
      hostDataRoot: "/srv/hiveforge/data",
      requireEnvironments: true
    });

    expect(paths).toMatchObject({
      dataRoot: path.join(baseDir, "data"),
      hostDataRoot: "/srv/hiveforge/data"
    });
  });

  it("rejects relative host data roots", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-runtime-"));

    await expect(resolveRuntimePaths({ baseDir, hostDataRoot: "data" })).rejects.toThrow(
      "Host data root must be an absolute path: data"
    );
  });

  it("rejects mixed base dir and explicit path modes", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-runtime-"));

    await expect(resolveRuntimePaths({ baseDir, registry: path.join(baseDir, "projects.yaml") })).rejects.toThrow(
      "Use either --base-dir/HIVEFORGE_BASE_DIR or explicit runtime paths, not both."
    );
  });

  it("requires environments for server runtime explicit mode", async () => {
    await expect(
      resolveRuntimePaths({
        registry: "projects.yaml",
        workspace: "workspace",
        journal: "journal",
        dataRoot: "data",
        requireEnvironments: true
      })
    ).rejects.toThrow("Missing required runtime option(s): --environments.");
  });

  it("fails when base dir is missing", async () => {
    const baseDir = path.join(await mkdtemp(path.join(os.tmpdir(), "hiveforge-runtime-")), "missing");

    await expect(resolveRuntimePaths({ baseDir })).rejects.toThrow(`Base dir does not exist: ${baseDir}`);
  });
});

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

function failingCommandRunner(): CommandRunner {
  return {
    async run(_command, args) {
      throw new Error(`Unexpected docker command: ${args.join(" ")}`);
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
