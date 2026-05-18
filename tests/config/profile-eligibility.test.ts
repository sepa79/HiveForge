import { describe, expect, it } from "vitest";
import { evaluateProfileEligibility } from "../../src/config/profile-eligibility.js";

describe("profile eligibility", () => {
  it("allows profiles when environment capabilities satisfy every requirement", () => {
    const result = evaluateProfileEligibility(environment(), {
      id: "swarm-reduced",
      runtime: "docker-swarm",
      serviceSet: "reduced",
      requires: {
        registry: true,
        ingress: true,
        managedRoots: ["scenarios-runtime"],
        capabilities: ["placement", "shared-runtime-root"]
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
          registry: false,
          ingress: false,
          managedRoots: [],
          placement: false,
          sharedRuntimeRoot: false
        }
      },
      {
        id: "swarm-reduced",
        runtime: "docker-swarm",
        serviceSet: "reduced",
        requires: {
          registry: true,
          ingress: true,
          managedRoots: ["scenarios-runtime"],
          capabilities: ["placement", "shared-runtime-root"]
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
          code: "registry-missing",
          message: "Environment proxmox-swarm does not provide required registry access",
          requirement: "registry"
        },
        {
          code: "ingress-missing",
          message: "Environment proxmox-swarm does not provide required ingress",
          requirement: "ingress"
        },
        {
          code: "managed-root-missing",
          message: "Environment proxmox-swarm does not provide required managed root scenarios-runtime",
          requirement: "managedRoots.scenarios-runtime"
        },
        {
          code: "capability-missing",
          message: "Environment proxmox-swarm does not provide required capability placement",
          requirement: "capabilities.placement"
        },
        {
          code: "capability-missing",
          message: "Environment proxmox-swarm does not provide required capability shared-runtime-root",
          requirement: "capabilities.shared-runtime-root"
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
      registry: true,
      ingress: true,
      managedRoots: ["scenarios-runtime", "stack-root"],
      placement: true,
      sharedRuntimeRoot: true
    },
    policy: {
      projects: []
    }
  };
}
