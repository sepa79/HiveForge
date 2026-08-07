import { describe, expect, it } from "vitest";
import { ManagedArtifactServices } from "../../src/config/managed-artifact-services.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";

describe("managed artifact services", () => {
  it("reports unavailable when the current Compose project has no running Forgejo service", async () => {
    const service = new ManagedArtifactServices(
      commandRunner([
        inspectHiveForge({ "com.docker.compose.project": "hiveforge" }),
        ""
      ]),
      { currentContainerId: () => "hiveforge-container" }
    );

    await expect(service.getInfo()).resolves.toMatchObject({
      status: "unavailable",
      reason: "This HiveForge target has no running Full Forgejo service in its Docker Compose project or Swarm stack."
    });
  });

  it("discovers shared Forgejo Git and OCI services without application repository paths", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const service = new ManagedArtifactServices(
      commandRunner([
        inspectHiveForge({ "com.docker.compose.project": "hiveforge" }),
        "forgejo-container\n",
        inspectForgejo(trustedLanForgejoEnvironment()),
        "forgejo-gateway-container\n"
      ], calls),
      { currentContainerId: () => "hiveforge-container" }
    );

    const result = await service.getInfo();

    expect(result).toMatchObject({
      status: "configured",
      git: {
        provider: "forgejo",
        baseUrl: "http://10.0.0.54:3001/",
        authentication: "trusted-lan-no-login",
        owner: "hiveforge"
      },
      registry: {
        address: "10.0.0.54:3001",
        transport: "insecure-http",
        authentication: "trusted-lan-no-login",
        owner: "hiveforge",
        prerequisite: {
          id: "docker-insecure-registry",
          status: "manual-unverified",
          registryAddress: "10.0.0.54:3001",
          requiredDockerDaemonSetting: "insecure-registries"
        }
      }
    });
    expect(JSON.stringify(result)).not.toContain("imageRepository");
    expect(JSON.stringify(result)).not.toContain("cloneUrl");
    expect(result.workflow[0]).toBe(
      "Push source to <git.baseUrl><git.owner>/<app>.git and images to <registry.address>/<registry.owner>/<app>:<tag> without Git or Docker login."
    );
    expect(calls).toEqual([
      {
        command: "docker",
        args: ["inspect", "hiveforge-container", "--format", "{{json .}}"]
      },
      {
        command: "docker",
        args: [
          "ps",
          "-q",
          "--filter",
          "label=com.docker.compose.project=hiveforge",
          "--filter",
          "label=com.docker.compose.service=forgejo"
        ]
      },
      {
        command: "docker",
        args: ["inspect", "forgejo-container", "--format", "{{json .}}"]
      },
      {
        command: "docker",
        args: [
          "ps",
          "-q",
          "--filter",
          "label=com.docker.compose.project=hiveforge",
          "--filter",
          "label=com.docker.compose.service=forgejo-gateway"
        ]
      }
    ]);
  });

  it("discovers Forgejo from the current Swarm stack without a configured endpoint variable", async () => {
    const service = new ManagedArtifactServices(
      commandRunner([
        inspectHiveForge({ "com.docker.stack.namespace": "hiveforge" }),
        '{"Name":"hiveforge_hiveforge"}\n{"Name":"hiveforge_forgejo"}\n{"Name":"hiveforge_forgejo-gateway"}\n',
        JSON.stringify(trustedLanForgejoEnvironment()),
        '{"Name":"hiveforge_hiveforge"}\n{"Name":"hiveforge_forgejo"}\n{"Name":"hiveforge_forgejo-gateway"}\n'
      ]),
      { currentContainerId: () => "hiveforge-container" }
    );

    await expect(service.getInfo()).resolves.toMatchObject({
      status: "configured",
      git: { baseUrl: "http://10.0.0.54:3001/" },
      registry: { address: "10.0.0.54:3001" }
    });
  });

  it("reports incomplete when the discovered Forgejo service has no usable HTTP root URL", async () => {
    const service = new ManagedArtifactServices(
      commandRunner([
        inspectHiveForge({ "com.docker.compose.project": "hiveforge" }),
        "forgejo-container\n",
        inspectForgejo([
          "FORGEJO__server__ROOT_URL=https://forge.lab.example/",
          ...trustedLanForgejoEnvironment().filter((entry) => !entry.startsWith("FORGEJO__server__ROOT_URL="))
        ]),
        "forgejo-gateway-container\n"
      ]),
      { currentContainerId: () => "hiveforge-container" }
    );

    await expect(service.getInfo()).resolves.toMatchObject({
      status: "incomplete",
      reason:
        "FORGEJO__server__ROOT_URL must be an absolute root HTTP URL with an explicit port and no embedded credentials."
    });
  });

  it("reports incomplete when the discovered Forgejo service has its OCI registry disabled", async () => {
    const service = new ManagedArtifactServices(
      commandRunner([
        inspectHiveForge({ "com.docker.compose.project": "hiveforge" }),
        "forgejo-container\n",
        inspectForgejo(["FORGEJO__server__ROOT_URL=http://10.0.0.54:3001/"])
      ]),
      { currentContainerId: () => "hiveforge-container" }
    );

    await expect(service.getInfo()).resolves.toMatchObject({
      status: "incomplete",
      reason: "The Full Forgejo service does not enable FORGEJO__packages__ENABLED."
    });
  });

  it("reports incomplete while the discovered Forgejo service still exposes its installer", async () => {
    const service = new ManagedArtifactServices(
      commandRunner([
        inspectHiveForge({ "com.docker.compose.project": "hiveforge" }),
        "forgejo-container\n",
        inspectForgejo([
          "FORGEJO__server__ROOT_URL=http://10.0.0.54:3001/",
          "FORGEJO__packages__ENABLED=true"
        ])
      ]),
      { currentContainerId: () => "hiveforge-container" }
    );

    await expect(service.getInfo()).resolves.toMatchObject({
      status: "incomplete",
      reason: "The Full Forgejo service does not enable FORGEJO__security__INSTALL_LOCK."
    });
  });

  it("reports incomplete when Full has no running trusted-LAN gateway", async () => {
    const service = new ManagedArtifactServices(
      commandRunner([
        inspectHiveForge({ "com.docker.compose.project": "hiveforge" }),
        "forgejo-container\n",
        inspectForgejo(trustedLanForgejoEnvironment()),
        ""
      ]),
      { currentContainerId: () => "hiveforge-container" }
    );

    await expect(service.getInfo()).resolves.toMatchObject({
      status: "incomplete",
      reason: "This Full Forgejo service has no running trusted-LAN gateway."
    });
  });

  it("reports incomplete when Full does not allow trusted-LAN API authentication", async () => {
    const service = new ManagedArtifactServices(
      commandRunner([
        inspectHiveForge({ "com.docker.compose.project": "hiveforge" }),
        "forgejo-container\n",
        inspectForgejo(
          trustedLanForgejoEnvironment().filter(
            (entry) => entry !== "FORGEJO__service__ENABLE_REVERSE_PROXY_AUTHENTICATION_API=true"
          )
        )
      ]),
      { currentContainerId: () => "hiveforge-container" }
    );

    await expect(service.getInfo()).resolves.toMatchObject({
      status: "incomplete",
      reason: "The Full Forgejo service does not enable FORGEJO__service__ENABLE_REVERSE_PROXY_AUTHENTICATION_API."
    });
  });

  it("fails explicitly when Docker cannot identify the running HiveForge container", async () => {
    const service = new ManagedArtifactServices(commandRunner([]), { currentContainerId: () => undefined });

    await expect(service.getInfo()).rejects.toThrow(
      "Managed artifact service discovery requires HOSTNAME to identify the running HiveForge container."
    );
  });
});

function inspectHiveForge(labels: Record<string, string>): string {
  return JSON.stringify({ Config: { Labels: labels } });
}

function inspectForgejo(environment: string[]): string {
  return JSON.stringify({ Config: { Env: environment } });
}

function trustedLanForgejoEnvironment(): string[] {
  return [
    "FORGEJO__server__ROOT_URL=http://10.0.0.54:3001/",
    "FORGEJO__packages__ENABLED=true",
    "FORGEJO__security__INSTALL_LOCK=true",
    "FORGEJO__service__ENABLE_REVERSE_PROXY_AUTHENTICATION=true",
    "FORGEJO__service__ENABLE_REVERSE_PROXY_AUTHENTICATION_API=true",
    "FORGEJO__service__ENABLE_REVERSE_PROXY_AUTO_REGISTRATION=true",
    "FORGEJO__repository__ENABLE_PUSH_CREATE_USER=true"
  ];
}

function commandRunner(outputs: string[], calls: Array<{ command: string; args: string[] }> = []): CommandRunner {
  return {
    async run(command, args) {
      expect(command).toBe("docker");
      expect(args.length).toBeGreaterThan(0);
      calls.push({ command, args });
      return { stdout: outputs.shift() ?? "", stderr: "" };
    }
  };
}
