import { afterEach, describe, expect, it } from "vitest";
import { SelfUpdateService } from "../../src/runtime/self-update-service.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";

const originalHostname = process.env.HOSTNAME;

afterEach(() => {
  if (originalHostname === undefined) {
    delete process.env.HOSTNAME;
  } else {
    process.env.HOSTNAME = originalHostname;
  }
});

describe("self update service", () => {
  it("checks the latest GitHub release against the running version", async () => {
    const service = new SelfUpdateService({
      appInfo: { name: "hiveforge", version: "0.5.0" },
      commandRunner: commandRunner([]),
      fetchImpl: latestRelease("v0.5.1", "https://github.com/sepa79/HiveForge/releases/tag/v0.5.1")
    });

    await expect(service.checkLatest()).resolves.toEqual({
      currentVersion: "0.5.0",
      releasePublished: true,
      latestVersion: "0.5.1",
      latestTag: "v0.5.1",
      releaseUrl: "https://github.com/sepa79/HiveForge/releases/tag/v0.5.1",
      updateAvailable: true
    });
  });

  it("starts a Swarm service update to the concrete latest release image", async () => {
    process.env.HOSTNAME = "container-1";
    const calls: unknown[] = [];
    const service = new SelfUpdateService({
      appInfo: { name: "hiveforge", version: "0.5.0" },
      commandRunner: commandRunner(calls, [
        JSON.stringify({
          Config: {
            Image: "ghcr.io/sepa79/hiveforge:v0.5.0",
            Labels: {
              "com.docker.stack.namespace": "hiveforge",
              "com.docker.swarm.service.name": "hiveforge_hiveforge"
            }
          }
        }),
        "helper-container\n"
      ]),
      fetchImpl: latestRelease("v0.5.1", "https://github.com/sepa79/HiveForge/releases/tag/v0.5.1"),
      now: () => 123
    });

    await expect(service.startUpdate()).resolves.toMatchObject({
      status: "started",
      mode: "swarm-service",
      targetImage: "ghcr.io/sepa79/hiveforge:v0.5.1",
      helperContainerId: "helper-container"
    });
    expect(calls).toEqual([
      {
        command: "docker",
        args: ["inspect", "container-1", "--format", "{{json .}}"]
      },
      {
        command: "docker",
        args: [
          "run",
          "-d",
          "--rm",
          "--name",
          "hiveforge-self-update-123",
          "-v",
          "/var/run/docker.sock:/var/run/docker.sock",
          "-e",
          "HIVEFORGE_TARGET_IMAGE=ghcr.io/sepa79/hiveforge:v0.5.1",
          "-e",
          "HIVEFORGE_SWARM_SERVICE=hiveforge_hiveforge",
          "ghcr.io/sepa79/hiveforge:v0.5.0",
          "sh",
          "-c",
          'sleep 1; docker service update --image "$HIVEFORGE_TARGET_IMAGE" "$HIVEFORGE_SWARM_SERVICE"'
        ]
      }
    ]);
  });

  it("starts a Docker Compose update through a helper container using the /hf host source", async () => {
    process.env.HOSTNAME = "container-1";
    const calls: unknown[] = [];
    const service = new SelfUpdateService({
      appInfo: { name: "hiveforge", version: "0.5.0" },
      commandRunner: commandRunner(calls, [
        JSON.stringify({
          Config: {
            Image: "ghcr.io/sepa79/hiveforge:v0.5.0",
            Labels: {
              "com.docker.compose.project": "hiveforge"
            }
          },
          Mounts: [
            {
              Source: "/opt/hiveforge",
              Destination: "/hf"
            }
          ]
        }),
        "helper-container\n"
      ]),
      fetchImpl: latestRelease("v0.5.1", "https://github.com/sepa79/HiveForge/releases/tag/v0.5.1"),
      now: () => 456
    });

    await expect(service.startUpdate()).resolves.toMatchObject({
      status: "started",
      mode: "docker-compose",
      targetImage: "ghcr.io/sepa79/hiveforge:v0.5.1",
      helperContainerId: "helper-container"
    });
    expect(calls).toEqual([
      {
        command: "docker",
        args: ["inspect", "container-1", "--format", "{{json .}}"]
      },
      {
        command: "docker",
        args: [
          "run",
          "-d",
          "--rm",
          "--name",
          "hiveforge-self-update-456",
          "-v",
          "/var/run/docker.sock:/var/run/docker.sock",
          "-v",
          "/opt/hiveforge:/hf",
          "-w",
          "/hf",
          "-e",
          "HIVEFORGE_IMAGE=ghcr.io/sepa79/hiveforge:v0.5.1",
          "-e",
          "HIVEFORGE_COMPOSE_PROJECT=hiveforge",
          "ghcr.io/sepa79/hiveforge:v0.5.0",
          "sh",
          "-c",
          'sleep 1; docker compose -p "$HIVEFORGE_COMPOSE_PROJECT" -f /hf/docker-compose.hiveforge.yml up -d'
        ]
      }
    ]);
  });

  it("does not inspect Docker when the running version is current", async () => {
    const calls: unknown[] = [];
    const service = new SelfUpdateService({
      appInfo: { name: "hiveforge", version: "0.5.1" },
      commandRunner: commandRunner(calls),
      fetchImpl: latestRelease("v0.5.1", "https://github.com/sepa79/HiveForge/releases/tag/v0.5.1")
    });

    await expect(service.startUpdate()).resolves.toMatchObject({
      status: "up_to_date",
      releasePublished: true,
      updateAvailable: false
    });
    expect(calls).toEqual([]);
  });

  it("reports no published release when GitHub latest release returns 404", async () => {
    const calls: unknown[] = [];
    const service = new SelfUpdateService({
      appInfo: { name: "hiveforge", version: "0.5.0" },
      commandRunner: commandRunner(calls),
      fetchImpl: async () => new Response(JSON.stringify({ message: "Not Found" }), { status: 404 })
    });

    await expect(service.checkLatest()).resolves.toEqual({
      currentVersion: "0.5.0",
      releasePublished: false,
      updateAvailable: false
    });
    await expect(service.startUpdate()).resolves.toEqual({
      currentVersion: "0.5.0",
      releasePublished: false,
      updateAvailable: false,
      status: "no_release"
    });
    expect(calls).toEqual([]);
  });

  it("fails explicitly when the running container has no supported install labels", async () => {
    process.env.HOSTNAME = "container-1";
    const service = new SelfUpdateService({
      appInfo: { name: "hiveforge", version: "0.5.0" },
      commandRunner: commandRunner([], [
        JSON.stringify({
          Config: {
            Image: "ghcr.io/sepa79/hiveforge:v0.5.0",
            Labels: {}
          }
        })
      ]),
      fetchImpl: latestRelease("v0.5.1", "https://github.com/sepa79/HiveForge/releases/tag/v0.5.1")
    });

    await expect(service.startUpdate()).rejects.toThrow(
      "HiveForge self-update requires Docker Compose or Swarm service labels on the running container."
    );
  });
});

function latestRelease(tagName: string, htmlUrl: string): typeof fetch {
  return async () =>
    new Response(
      JSON.stringify({
        tag_name: tagName,
        html_url: htmlUrl
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
}

function commandRunner(calls: unknown[], outputs: string[] = []): CommandRunner {
  return {
    async run(command: string, args: string[]) {
      calls.push({ command, args });
      return {
        stdout: outputs.shift() ?? "",
        stderr: ""
      };
    }
  };
}
