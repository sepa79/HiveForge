import { describe, expect, it } from "vitest";
import type { ProjectRegistry } from "../../src/manifest/manifest-types.js";
import type { DockerProbe } from "../../src/validation/docker-probe.js";
import { RequirementValidationError, RequirementValidator } from "../../src/validation/requirement-validator.js";

class FakeDockerProbe implements DockerProbe {
  constructor(
    private readonly volumes: Set<string>,
    private readonly secrets: Set<string>
  ) {}

  async volumeExists(name: string): Promise<boolean> {
    return this.volumes.has(name);
  }

  async secretExists(name: string): Promise<boolean> {
    return this.secrets.has(name);
  }
}

describe("requirement validator", () => {
  it("passes when declared requirements exist", async () => {
    const validator = new RequirementValidator(
      new FakeDockerProbe(new Set(["hivewatch-api-data"]), new Set(["hivewatch-api-token"])),
      { HIVEWATCH_API_PORT: "3000" }
    );

    await expect(validator.assertProjectValid(registry())).resolves.toEqual({ ok: true, issues: [] });
  });

  it("fails explicitly for missing volumes, secrets, and environment variables", async () => {
    const validator = new RequirementValidator(new FakeDockerProbe(new Set(), new Set()), {});

    await expect(validator.assertProjectValid(registry())).rejects.toThrow(RequirementValidationError);
    await expect(validator.assertProjectValid(registry())).rejects.toThrow(
      [
        "Missing Docker volume for api: hivewatch-api-data",
        "Missing Docker secret for api: hivewatch-api-token",
        "Missing environment variable for api: HIVEWATCH_API_PORT"
      ].join("; ")
    );
  });
});

function registry(): ProjectRegistry {
  return {
    project: {
      name: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      actions: ["deploy"]
    },
    components: [
      {
        name: "api",
        manifestPath: "components/api/hiveforge.yaml",
        manifest: {
          kind: "component",
          component: {
            name: "api",
            project: "hivewatch"
          },
          deployment: {
            adapter: "ansible",
            actions: {
              deploy: {
                playbook: "ansible/deploy.yml"
              }
            }
          },
          requirements: {
            volumes: ["hivewatch-api-data"],
            secrets: ["hivewatch-api-token"],
            environment: ["HIVEWATCH_API_PORT"]
          }
        }
      }
    ]
  };
}
