import { describe, expect, it } from "vitest";
import type { EnvironmentDefinition } from "../../src/config/environment-types.js";
import { DeploymentRuntimeStatusService } from "../../src/operation/deployment-runtime-status-service.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";

describe("deployment runtime status service", () => {
  it("reports running containers selected by explicit HiveForge labels", async () => {
    const service = new DeploymentRuntimeStatusService(
      scriptedDocker([
        {
          args: [
            "ps",
            "-a",
            "--filter",
            "label=hiveforge.project=hivewatch",
            "--filter",
            "label=hiveforge.component=api",
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
                  "hiveforge.project": "hivewatch",
                  "hiveforge.component": "api"
                }
              },
              Mounts: [{ Source: "/opt/hiveforge/data/deployed/hivewatch", Destination: "/app/config", Type: "bind" }]
            }
          ])
        }
      ]),
      dockerEnvironment()
    );

    await expect(service.check({ projectId: "hivewatch", component: "api" })).resolves.toEqual({
      projectId: "hivewatch",
      component: "api",
      summary: "running",
      requiredLabels: {
        "hiveforge.project": "hivewatch",
        "hiveforge.component": "api"
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
            "hiveforge.project": "hivewatch",
            "hiveforge.component": "api"
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
          args: ["ps", "-a", "--filter", "label=hiveforge.project=hivewatch", "--format", "{{json .}}"],
          stdout: ""
        }
      ]),
      dockerEnvironment()
    );

    await expect(service.check({ projectId: "hivewatch" })).resolves.toEqual({
      projectId: "hivewatch",
      summary: "missing",
      requiredLabels: {
        "hiveforge.project": "hivewatch"
      },
      containers: [],
      services: [],
      reason:
        "No Docker containers or services matched the required HiveForge labels. Runtime status does not infer ownership from names."
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
