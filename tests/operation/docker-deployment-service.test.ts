import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { DockerDeploymentService } from "../../src/operation/docker-deployment-service.js";
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

    await expect(service.deploy({ deploymentId: "deployment-1", composeFile })).resolves.toMatchObject({
      deploymentId: "deployment-1",
      composeFile,
      runtime: "docker-single"
    });

    expect(calls).toEqual([
      {
        command: "docker",
        args: ["compose", "-p", "deployment-1", "-f", composeFile, "up", "-d"]
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

    await expect(service.deploy({ deploymentId: "deployment-1", composeFile })).resolves.toMatchObject({
      runtime: "docker-swarm"
    });

    expect(calls).toEqual([
      {
        command: "docker",
        args: ["stack", "deploy", "-c", composeFile, "deployment-1"]
      }
    ]);
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
