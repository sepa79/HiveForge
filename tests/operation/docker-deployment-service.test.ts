import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { DockerDeploymentService, inspectComposeBindSources } from "../../src/operation/docker-deployment-service.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";
import type { EnvironmentDefinition } from "../../src/config/environment-types.js";

describe("docker deployment service", () => {
  it("injects the deployment label and runs docker compose for single-host environments", async () => {
    const composeFile = await writeCompose([
      "services:",
      "  api:",
      "    image: hivewatch:test",
      "    labels:",
      "      existing: keep",
      "  worker:",
      "    image: hivewatch-worker:test",
      "    labels:",
      "      - queue=default",
      ""
    ]);
    const calls: unknown[] = [];
    const service = new DockerDeploymentService(commandRunner(calls), environment(["docker-single"]));

    await expect(
      service.deploy({
        deploymentId: "deployment-1",
        deploymentName: "hivewatch",
        project: "hivewatch",
        component: "api",
        profile: "test",
        composeFile
      })
    ).resolves.toMatchObject({
      deploymentId: "deployment-1",
      composeFile,
      runtime: "docker-single"
    });

    expect(calls).toEqual([
      {
        command: "docker",
        args: ["compose", "-p", "hivewatch", "-f", composeFile, "up", "-d"]
      }
    ]);
    const rendered = YAML.parse(await readFile(composeFile, "utf8"));
    expect(rendered.services.api.labels).toEqual({
      existing: "keep",
      "hiveforge.deployment": "deployment-1"
    });
    expect(rendered.services.api.deploy.labels).toEqual({
      "hiveforge.deployment": "deployment-1"
    });
    expect(rendered.services.worker.labels).toEqual({
      queue: "default",
      "hiveforge.deployment": "deployment-1"
    });
  });

  it("runs docker stack deploy for swarm environments", async () => {
    const composeFile = await writeCompose("services:\n  api:\n    image: hivewatch:test\n");
    const calls: unknown[] = [];
    const service = new DockerDeploymentService(commandRunner(calls), environment(["docker-swarm"]));

    await expect(
      service.deploy({
        deploymentId: "deployment-1",
        deploymentName: "hivewatch",
        project: "hivewatch",
        component: "api",
        composeFile
      })
    ).resolves.toMatchObject({
      runtime: "docker-swarm"
    });

    expect(calls).toEqual([
      {
        command: "docker",
        args: ["stack", "deploy", "-c", composeFile, "hivewatch"]
      }
    ]);
  });

  it("uses an explicit deployment name when provided", async () => {
    const composeFile = await writeCompose("services:\n  api:\n    image: hivewatch:test\n");
    const calls: unknown[] = [];
    const service = new DockerDeploymentService(commandRunner(calls), environment(["docker-swarm"]));

    await service.deploy({
      deploymentId: "deployment-1",
      deploymentName: "hivewatch-canary",
      project: "hivewatch",
      component: "api",
      composeFile
    });

    expect(calls).toEqual([
      {
        command: "docker",
        args: ["stack", "deploy", "-c", composeFile, "hivewatch-canary"]
      }
    ]);
  });

  it("rejects service names that would exceed the Docker Swarm service name limit", async () => {
    const composeFile = await writeCompose("services:\n  service-name-that-is-too-long-for-hiveforge-swarm-stack-prefix:\n    image: hivewatch:test\n");
    const service = new DockerDeploymentService(commandRunner([]), environment(["docker-swarm"]));

    await expect(
      service.deploy({
        deploymentId: "deployment-1",
        deploymentName: "hivewatch",
        project: "hivewatch",
        component: "api",
        profile: "swarm-reduced",
        composeFile
      })
    ).rejects.toThrow(
      "Rendered compose service name is too long for Docker Swarm"
    );
  });

  it("rejects unsafe deployment names instead of hiding them behind hashes", async () => {
    const composeFile = await writeCompose("services:\n  api:\n    image: hivewatch:test\n");
    const service = new DockerDeploymentService(commandRunner([]), environment(["docker-swarm"]));

    await expect(
      service.deploy({
        deploymentId: "deployment-1",
        deploymentName: "HiveWatch",
        project: "hivewatch",
        component: "api",
        composeFile
      })
    ).rejects.toThrow("Deployment name is not safe for Docker project/stack names: HiveWatch");
  });

  it("rejects bind sources outside the HiveForge bind source directory", async () => {
    const composeFile = await writeCompose([
      "services:",
      "  api:",
      "    image: hivewatch:test",
      "    volumes:",
      "      - /tmp/hivewatch:/data",
      ""
    ]);
    const calls: unknown[] = [];
    const service = new DockerDeploymentService(commandRunner(calls), environment(["docker-single"]));

    await expect(
      service.deploy({
        deploymentId: "deployment-1",
        deploymentName: "hivewatch",
        project: "hivewatch",
        component: "api",
        composeFile,
        bindSourceDir: "/mnt/shared_nfs/hiveforge/data/deployed/hivewatch"
      })
    ).rejects.toThrow("outside HIVEFORGE_BIND_SOURCE_DIR");
    expect(calls).toEqual([]);
  });

  it("rejects HiveForge internal bind sources", async () => {
    const composeFile = await writeCompose([
      "services:",
      "  api:",
      "    image: hivewatch:test",
      "    volumes:",
      "      - type: bind",
      "        source: /hf/data/deployed/hivewatch",
      "        target: /data",
      ""
    ]);
    const service = new DockerDeploymentService(commandRunner([]), environment(["docker-single"]));

    await expect(
      service.deploy({
        deploymentId: "deployment-1",
        deploymentName: "hivewatch",
        project: "hivewatch",
        component: "api",
        composeFile,
        bindSourceDir: "/mnt/shared_nfs/hiveforge/data/deployed/hivewatch"
      })
    ).rejects.toThrow("HiveForge internal bind source");
  });

  it("rejects bind sources when no HiveForge bind source directory is configured", async () => {
    const composeFile = await writeCompose([
      "services:",
      "  api:",
      "    image: hivewatch:test",
      "    volumes:",
      "      - /mnt/shared_nfs/hiveforge/data/deployed/hivewatch:/data",
      ""
    ]);
    const service = new DockerDeploymentService(commandRunner([]), environment(["docker-single"]));

    await expect(
      service.deploy({
        deploymentId: "deployment-1",
        deploymentName: "hivewatch",
        project: "hivewatch",
        component: "api",
        composeFile
      })
    ).rejects.toThrow(
      "no HIVEFORGE_BIND_SOURCE_DIR"
    );
  });

  it("returns a bind-source validation report without deploying", async () => {
    const composeFile = await writeCompose([
      "services:",
      "  api:",
      "    image: hivewatch:test",
      "    volumes:",
      "      - /hf/data/deployed/hivewatch:/bad",
      "      - /mnt/shared_nfs/hiveforge/data/deployed/hivewatch/config:/config",
      ""
    ]);

    await expect(
      inspectComposeBindSources(composeFile, "/mnt/shared_nfs/hiveforge/data/deployed/hivewatch")
    ).resolves.toEqual({
      ok: false,
      composeFile,
      bindSourceDir: "/mnt/shared_nfs/hiveforge/data/deployed/hivewatch",
      allowedBindSources: ["/var/run/docker.sock"],
      services: [
        {
          service: "api",
          bindSources: [
            "/hf/data/deployed/hivewatch",
            "/mnt/shared_nfs/hiveforge/data/deployed/hivewatch/config"
          ]
        }
      ],
      issues: [
        {
          service: "api",
          source: "/hf/data/deployed/hivewatch",
          reason: "Rendered compose service api uses HiveForge internal bind source: /hf/data/deployed/hivewatch"
        }
      ]
    });
  });
});

async function writeCompose(content: string | string[]): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-compose-"));
  const composeFile = path.join(dir, "compose.yml");
  await writeFile(composeFile, Array.isArray(content) ? content.join("\n") : content, "utf8");
  return composeFile;
}

function commandRunner(calls: unknown[]): CommandRunner {
  return {
    async run(command, args) {
      calls.push({ command, args });
      return { stdout: "deployed", stderr: "" };
    }
  };
}

function environment(runtime: Array<"docker-single" | "docker-swarm">): EnvironmentDefinition {
  return {
    id: "docker",
    name: "Docker",
    kind: runtime.includes("docker-swarm") ? "swarm" : "docker",
    capabilities: {
      runtime,
      managedRoot: {
        shared: true
      }
    },
    policy: {
      projects: []
    }
  };
}
