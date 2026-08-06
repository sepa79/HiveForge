import { describe, expect, it } from "vitest";
import { evaluateProfileEligibility } from "../../src/config/profile-eligibility.js";

describe("profile eligibility", () => {
  it("allows profiles when environment capabilities satisfy every requirement", () => {
    const result = evaluateProfileEligibility(environment(), {
      id: "swarm-reduced",
      runtime: "docker-swarm",
      serviceSet: "reduced",
      requires: {
        managedRoot: {
          required: true,
          shared: true
        },
        capabilities: ["placement"]
      }
    });

    expect(result).toEqual({ eligible: true, issues: [] });
  });

  it("returns explicit missing capability issues without selecting a fallback profile", () => {
    const result = evaluateProfileEligibility(
      {
        ...environment(),
        capabilities: {
          runtime: ["docker-single"],
          managedRoot: {
            shared: false,
            nodes: ["docker-swarm-mgr-1"]
          },
          placement: false
        }
      },
      {
        id: "swarm-reduced",
        runtime: "docker-swarm",
        serviceSet: "reduced",
        requires: {
          managedRoot: {
            required: true,
            shared: true
          },
          capabilities: ["placement"]
        }
      }
    );

    expect(result).toEqual({
      eligible: false,
      issues: [
        {
          code: "runtime-missing",
          message: "Environment proxmox-swarm does not provide required runtime docker-swarm",
          requirement: "runtime.docker-swarm"
        },
        {
          code: "managed-root-shared-missing",
          message: "Environment proxmox-swarm does not provide required shared HiveForge managed root",
          requirement: "managedRoot.shared"
        },
        {
          code: "capability-missing",
          message: "Environment proxmox-swarm does not provide required capability placement",
          requirement: "capabilities.placement"
        }
      ]
    });
  });

  it("requires explicit node placement for non-shared managed roots", () => {
    const result = evaluateProfileEligibility(environment(), {
      id: "swarm-pinned",
      runtime: "docker-swarm",
      serviceSet: "reduced",
      requires: {
        managedRoot: {
          required: true,
          shared: false
        }
      }
    });

    expect(result).toEqual({
      eligible: false,
      issues: [
        {
          code: "managed-root-placement-missing",
          message: "Profile swarm-pinned requires a non-shared HiveForge managed root but does not declare a node",
          requirement: "managedRoot.node"
        }
      ]
    });
  });

  it("rejects non-shared managed root placement on nodes without that root", () => {
    const result = evaluateProfileEligibility(
      {
        ...environment(),
        capabilities: {
          runtime: ["docker-swarm"],
          managedRoot: {
            shared: false,
            nodes: ["docker-swarm-mgr-1"]
          },
          placement: true
        }
      },
      {
        id: "swarm-pinned",
        runtime: "docker-swarm",
        serviceSet: "reduced",
        requires: {
          managedRoot: {
            required: true,
            shared: false,
            node: "docker-swarm-wrk-1"
          }
        }
      }
    );

    expect(result).toEqual({
      eligible: false,
      issues: [
        {
          code: "managed-root-node-missing",
          message: "Environment proxmox-swarm does not provide HiveForge managed root on node docker-swarm-wrk-1",
          requirement: "managedRoot.nodes.docker-swarm-wrk-1"
        }
      ]
    });
  });

  it("requires all declared placement labels on one active ready Swarm node", () => {
    const result = evaluateProfileEligibility(
      {
        ...environment(),
        nodes: [
          {
            id: "node-manager-1",
            hostname: "docker-swarm-mgr-1",
            role: "manager",
            availability: "active",
            status: "ready",
            labels: {
              "pockethive.redis": "true",
              "pockethive.postgres": "true"
            }
          },
          {
            id: "node-worker-1",
            hostname: "docker-swarm-wrk-1",
            role: "worker",
            availability: "active",
            status: "ready",
            labels: {
              "pockethive.redis": "true"
            }
          }
        ]
      },
      {
        id: "swarm-stateful",
        runtime: "docker-swarm",
        serviceSet: "full",
        requires: {
          placement: {
            nodeLabels: {
              "pockethive.redis": "true",
              "pockethive.postgres": "true"
            }
          }
        }
      }
    );

    expect(result).toEqual({ eligible: true, issues: [] });
  });

  it("reports missing node inventory and labels as explicit placement failures", () => {
    const profile = {
      id: "swarm-stateful",
      runtime: "docker-swarm" as const,
      serviceSet: "full",
      requires: {
        placement: {
          nodeLabels: {
            "pockethive.redis": "true"
          }
        }
      }
    };

    expect(evaluateProfileEligibility(environment(), profile)).toEqual({
      eligible: false,
      issues: [
        {
          code: "placement-node-inventory-missing",
          message: "Environment proxmox-swarm has no active ready node inventory for placement validation",
          requirement: "placement.nodeLabels"
        }
      ]
    });

    expect(
      evaluateProfileEligibility(
        {
          ...environment(),
          nodes: [
            {
              id: "node-worker-1",
              hostname: "docker-swarm-wrk-1",
              role: "worker",
              availability: "active",
              status: "ready",
              labels: { "pockethive.redis": "false" }
            },
            {
              id: "node-worker-2",
              hostname: "docker-swarm-wrk-2",
              role: "worker",
              availability: "drain",
              status: "ready",
              labels: { "pockethive.redis": "true" }
            }
          ]
        },
        profile
      )
    ).toEqual({
      eligible: false,
      issues: [
        {
          code: "placement-node-labels-missing",
          message: "Environment proxmox-swarm has no active ready node with required placement labels: pockethive.redis=true",
          requirement: "placement.nodeLabels"
        }
      ]
    });
  });
});

function environment() {
  return {
    id: "proxmox-swarm",
    name: "Proxmox Swarm",
    kind: "swarm" as const,
    capabilities: {
      runtime: ["docker-swarm" as const],
      managedRoot: {
        shared: true
      },
      placement: true
    },
    policy: {
      projects: []
    }
  };
}
