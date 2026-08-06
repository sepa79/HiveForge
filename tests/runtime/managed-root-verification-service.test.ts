import { describe, expect, it } from "vitest";
import type { EnvironmentDefinition } from "../../src/config/environment-types.js";
import { ManagedRootVerificationService } from "../../src/runtime/managed-root-verification-service.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";

describe("managed root verification service", () => {
  it("verifies a read-only managed-root bind mount on a single Docker host", async () => {
    const runner = scriptedRunner([
      {
        args: [
          "run",
          "--rm",
          "--mount",
          "type=bind,src=/opt/hiveforge/data,dst=/probe,readonly",
          "ghcr.io/sepa79/hiveforge:v0.5.3",
          "sh",
          "-ec",
          "test -d /probe && test -r /probe"
        ]
      }
    ]);

    const report = await new ManagedRootVerificationService(runner, dockerEnvironment(), {
      probeImage: "ghcr.io/sepa79/hiveforge:v0.5.3",
      now: () => new Date("2026-08-06T10:00:00.000Z")
    }).verify();

    expect(report).toEqual({
      status: "verified",
      checkedAt: "2026-08-06T10:00:00.000Z",
      runtime: "docker-single",
      bindSourceRoot: "/opt/hiveforge",
      managedDataBindSourceRoot: "/opt/hiveforge/data",
      nodes: [
        {
          hostname: "docker",
          status: "verified",
          reason: "Read-only Docker bind mount was accessible."
        }
      ],
      reason: "Managed-root bind-source visibility is verified on the current Docker host."
    });
  });

  it("proves every active ready Swarm node and removes the temporary global service", async () => {
    const serviceName = "hiveforge-managed-root-probe-probe-1";
    const runner = scriptedRunner([
      {
        args: [
          "service",
          "create",
          "--name",
          serviceName,
          "--mode",
          "global",
          "--restart-condition",
          "none",
          "--mount",
          "type=bind,src=/mnt/shared/hiveforge/data,dst=/probe,readonly",
          "--label",
          "hiveforge.managed-root-probe=probe-1",
          "ghcr.io/sepa79/hiveforge:v0.5.3",
          "sh",
          "-ec",
          "test -d /probe && test -r /probe"
        ]
      },
      {
        args: ["service", "ps", serviceName, "--no-trunc", "--format", "{{json .}}"],
        stdout: [
          JSON.stringify({ Node: "docker-swarm-mgr-1", CurrentState: "Complete 2 seconds ago" }),
          JSON.stringify({ Node: "docker-swarm-wrk-1", CurrentState: "Complete 2 seconds ago" })
        ].join("\n")
      },
      {
        args: ["service", "rm", serviceName]
      }
    ]);

    const report = await new ManagedRootVerificationService(runner, swarmEnvironment(), {
      probeImage: "ghcr.io/sepa79/hiveforge:v0.5.3",
      probeId: () => "probe-1",
      now: () => new Date("2026-08-06T10:00:00.000Z")
    }).verify();

    expect(report).toMatchObject({
      status: "verified",
      runtime: "docker-swarm",
      nodes: [
        { hostname: "docker-swarm-mgr-1", status: "verified" },
        { hostname: "docker-swarm-wrk-1", status: "verified" }
      ],
      reason: "Managed-root bind-source visibility is verified on every active ready Swarm node."
    });
  });

  it("reports a rejected Swarm mount as failed evidence rather than configured visibility", async () => {
    const serviceName = "hiveforge-managed-root-probe-probe-2";
    const runner = scriptedRunner([
      { args: expect.any(Array) },
      {
        args: ["service", "ps", serviceName, "--no-trunc", "--format", "{{json .}}"],
        stdout: JSON.stringify({
          Node: "docker-swarm-mgr-1",
          CurrentState: "Rejected 1 second ago",
          Error: "invalid mount config for type bind: bind source path does not exist"
        })
      },
      { args: ["service", "rm", serviceName] }
    ]);

    const report = await new ManagedRootVerificationService(runner, {
      ...swarmEnvironment(),
      nodes: [swarmEnvironment().nodes![0]!]
    }, {
      probeImage: "ghcr.io/sepa79/hiveforge:v0.5.3",
      probeId: () => "probe-2"
    }).verify();

    expect(report).toMatchObject({
      status: "failed",
      nodes: [
        {
          hostname: "docker-swarm-mgr-1",
          status: "failed",
          reason: "invalid mount config for type bind: bind source path does not exist"
        }
      ],
      reason: "Managed-root bind-source verification failed on one or more active ready Swarm nodes."
    });
  });

  it("does not claim verification when the temporary Swarm probe cannot be removed", async () => {
    const serviceName = "hiveforge-managed-root-probe-probe-3";
    const runner = scriptedRunner([
      { args: expect.any(Array) },
      {
        args: ["service", "ps", serviceName, "--no-trunc", "--format", "{{json .}}"],
        stdout: JSON.stringify({ Node: "docker-swarm-mgr-1", CurrentState: "Complete 1 second ago" })
      },
      { args: ["service", "rm", serviceName], error: "Docker service removal failed" }
    ]);

    const report = await new ManagedRootVerificationService(runner, {
      ...swarmEnvironment(),
      nodes: [swarmEnvironment().nodes![0]!]
    }, {
      probeImage: "ghcr.io/sepa79/hiveforge:v0.5.3",
      probeId: () => "probe-3"
    }).verify();

    expect(report).toMatchObject({
      status: "inconclusive",
      cleanupError: "Docker service removal failed",
      reason: "Managed-root Swarm probe completed but temporary service cleanup failed: Docker service removal failed"
    });
  });

  it("returns unknown without running Docker when configuration is incomplete", async () => {
    const runner = scriptedRunner([]);

    const report = await new ManagedRootVerificationService(runner, {
      ...dockerEnvironment(),
      capabilities: {
        ...dockerEnvironment().capabilities,
        managedRoot: { shared: true }
      }
    }).verify();

    expect(report).toMatchObject({
      status: "unknown",
      reason: "Cannot verify managed-root visibility because capabilities.managedRoot.bindSourceRoot is not configured."
    });
  });

  it("returns unknown without running Docker when no probe image is configured", async () => {
    const runner = scriptedRunner([]);

    const report = await new ManagedRootVerificationService(runner, dockerEnvironment()).verify();

    expect(report).toMatchObject({
      status: "unknown",
      bindSourceRoot: "/opt/hiveforge",
      reason: "Cannot verify managed-root visibility because HIVEFORGE_MANAGED_ROOT_PROBE_IMAGE is not configured."
    });
  });
});

function dockerEnvironment(): EnvironmentDefinition {
  return {
    id: "docker",
    name: "Docker",
    kind: "docker",
    capabilities: {
      runtime: ["docker-single"],
      managedRoot: { shared: true, bindSourceRoot: "/opt/hiveforge" }
    },
    policy: { projects: [] }
  };
}

function swarmEnvironment(): EnvironmentDefinition {
  return {
    id: "swarm",
    name: "Docker Swarm",
    kind: "swarm",
    capabilities: {
      runtime: ["docker-swarm"],
      managedRoot: { shared: true, bindSourceRoot: "/mnt/shared/hiveforge" },
      placement: true
    },
    nodes: [
      {
        id: "node-manager-1",
        hostname: "docker-swarm-mgr-1",
        role: "manager",
        availability: "active",
        status: "ready",
        labels: {}
      },
      {
        id: "node-worker-1",
        hostname: "docker-swarm-wrk-1",
        role: "worker",
        availability: "active",
        status: "ready",
        labels: {}
      },
      {
        id: "node-worker-2",
        hostname: "docker-swarm-wrk-2",
        role: "worker",
        availability: "drain",
        status: "ready",
        labels: {}
      }
    ],
    policy: { projects: [] }
  };
}

function scriptedRunner(expected: Array<{ args: unknown; stdout?: string; error?: string }>): CommandRunner {
  return {
    async run(command, args) {
      expect(command).toBe("docker");
      const next = expected.shift();
      if (!next) {
        throw new Error(`Unexpected Docker command: ${args.join(" ")}`);
      }
      expect(args).toEqual(next.args);
      if (next.error) {
        throw new Error(next.error);
      }
      return { stdout: next.stdout ?? "", stderr: "" };
    }
  };
}
