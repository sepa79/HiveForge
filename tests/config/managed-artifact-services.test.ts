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

  it("reports incomplete when the discovered Forgejo service still uses the shipped placeholder root URL", async () => {
    const service = new ManagedArtifactServices(
      commandRunner([
        inspectHiveForge({ "com.docker.compose.project": "hiveforge" }),
        "forgejo-container\n",
        inspectForgejo([
          "FORGEJO__server__ROOT_URL=http://forgejo-change-me.invalid:3001/",
          ...trustedLanForgejoEnvironment().filter((entry) => !entry.startsWith("FORGEJO__server__ROOT_URL="))
        ]),
        "forgejo-gateway-container\n"
      ]),
      { currentContainerId: () => "hiveforge-container" }
    );

    await expect(service.getInfo()).resolves.toMatchObject({
      status: "incomplete",
      reason:
        "The Full Forgejo service still uses the shipped placeholder FORGEJO__server__ROOT_URL. Replace it with the real public Git/OCI host and port."
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

    await expect(service.getInfo()).resolves.toMatchObject({
      status: "unavailable",
      reason:
        "Managed Git and OCI service discovery could not inspect the current HiveForge runtime: Managed artifact service discovery requires HOSTNAME to identify the running HiveForge container."
    });
  });

  it("reports unavailable when Docker inspect of the discovered Forgejo service fails", async () => {
    const service = new ManagedArtifactServices(
      commandRunner([
        inspectHiveForge({ "com.docker.compose.project": "hiveforge" }),
        "forgejo-container\n"
      ], undefined, { "docker inspect forgejo-container --format {{json .}}": new Error("docker inspect failed") }),
      { currentContainerId: () => "hiveforge-container" }
    );

    await expect(service.getInfo()).resolves.toMatchObject({
      status: "unavailable",
      reason:
        "Managed Git and OCI service discovery could not inspect Full services: docker inspect failed"
    });
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

function commandRunner(
  outputs: string[],
  calls: Array<{ command: string; args: string[] }> = [],
  failures: Record<string, Error> = {}
): CommandRunner {
  return {
    async run(command, args) {
      expect(command).toBe("docker");
      expect(args.length).toBeGreaterThan(0);
      calls.push({ command, args });
      const failure = failures[[command, ...args].join(" ")];
      if (failure) {
        throw failure;
      }
      return { stdout: outputs.shift() ?? "", stderr: "" };
    }
  };
}
