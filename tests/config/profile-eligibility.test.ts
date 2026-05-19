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
