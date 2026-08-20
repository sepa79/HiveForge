import { describe, expect, it } from "vitest";
import { applyDetectedEnvironmentRuntime } from "../../src/config/environment-refresh-contract.js";
import type { EnvironmentDefinition } from "../../src/config/environment-types.js";

describe("environment refresh contract", () => {
  it("replaces only runtime-managed fields during refresh", () => {
    const current: EnvironmentDefinition = {
      id: "swarm",
      name: "Production Swarm",
      description: "Primary production Swarm cluster.",
      kind: "swarm",
      capabilities: {
        runtime: ["docker-swarm"],
        managedRoot: {
          shared: false,
          bindSourceRoot: "/mnt/shared_nfs/hiveforge",
          nodes: ["docker-swarm-mgr-1"]
        },
        bindSources: {
          allowed: ["/data/postgres"]
        },
        placement: false
      },
      deployment: {
        executor: "portainer-stack",
        portainer: {
          baseUrl: "https://portainer.example.com:9443/api",
          endpointId: 3,
          apiKey: "ptr_xxxxx",
          tlsInsecureSkipVerify: true
        }
      },
      nodes: [
        {
          id: "node-manager-1",
          hostname: "docker-swarm-mgr-1",
          role: "manager",
          availability: "active",
          status: "ready",
          labels: { "pockethive.postgres": "false" }
        }
      ],
      vars: {
        "imageRepository.project": "registry.lan:5000/pockethive"
      },
      policy: {
        projects: [
          {
            id: "pockethive",
            profiles: ["swarm-reduced"],
            actions: ["deploy", "update"]
          }
        ]
      }
    };

    const detected: EnvironmentDefinition = {
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
          labels: { "pockethive.clickhouse": "true" }
        }
      ],
      policy: {
        projects: []
      }
    };

    expect(applyDetectedEnvironmentRuntime(current, detected)).toEqual({
      id: "swarm",
      name: "Production Swarm",
      description: "Primary production Swarm cluster.",
      kind: "swarm",
      capabilities: {
        runtime: ["docker-swarm"],
        managedRoot: {
          shared: false,
          bindSourceRoot: "/mnt/shared_nfs/hiveforge",
          nodes: ["docker-swarm-mgr-1"]
        },
        bindSources: {
          allowed: ["/data/postgres"]
        },
        placement: true
      },
      deployment: {
        executor: "portainer-stack",
        portainer: {
          baseUrl: "https://portainer.example.com:9443/api",
          endpointId: 3,
          apiKey: "ptr_xxxxx",
          tlsInsecureSkipVerify: true
        }
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
      vars: {
        "imageRepository.project": "registry.lan:5000/pockethive"
      },
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
  });

  it("removes optional runtime fields when autodetection omits them", () => {
    const current: EnvironmentDefinition = {
      id: "docker",
      name: "Docker host",
      kind: "docker",
      capabilities: {
        runtime: ["docker-swarm"],
        managedRoot: {
          shared: true
        },
        placement: true
      },
      nodes: [
        {
          id: "stale-node",
          hostname: "docker-host",
          role: "manager",
          availability: "active",
          status: "ready",
          labels: {}
        }
      ],
      policy: {
        projects: []
      }
    };

    const detected: EnvironmentDefinition = {
      id: "docker",
      name: "Docker host",
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

    expect(applyDetectedEnvironmentRuntime(current, detected)).toEqual({
      id: "docker",
      name: "Docker host",
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
    });
  });
});
