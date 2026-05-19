import { describe, expect, it } from "vitest";
import { EnvironmentPolicyService } from "../../src/config/environment-policy.js";

describe("environment policy", () => {
  it("allows configured project action profile combinations", () => {
    const policy = new EnvironmentPolicyService(environment());

    expect(() =>
      policy.assertActionAllowed({ projectId: "hivewatch", action: "deploy", profile: "test" })
    ).not.toThrow();
  });

  it("rejects projects outside the environment policy", () => {
    const policy = new EnvironmentPolicyService(environment());

    expect(() => policy.assertActionAllowed({ projectId: "other", action: "deploy", profile: "test" })).toThrow(
      "Project is not allowed on environment local: other"
    );
  });

  it("rejects profiles outside the environment policy", () => {
    const policy = new EnvironmentPolicyService(environment());

    expect(() => policy.assertActionAllowed({ projectId: "hivewatch", action: "deploy", profile: "prod" })).toThrow(
      "Profile is not allowed on environment local for hivewatch: prod"
    );
  });
});

function environment() {
  return {
    id: "local",
    name: "Local Docker",
    kind: "local-docker" as const,
    capabilities: {
      runtime: ["docker-single" as const],
      managedRoot: {
        shared: false,
        nodes: ["local-docker"]
      }
    },
    policy: {
      projects: [
        {
          id: "hivewatch",
          profiles: ["normal", "test"],
          actions: ["deploy" as const, "upgrade" as const]
        }
      ]
    }
  };
}
