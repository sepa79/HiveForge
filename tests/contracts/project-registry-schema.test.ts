import { describe, expect, it } from "vitest";
import { ContractValidationError, schemaPaths, validateContract } from "../../src/contracts/schema-loader.js";

describe("project registry schema", () => {
  it("accepts explicit HiveWatch repository refs", async () => {
    const registry = {
      projects: [
        {
          id: "hivewatch",
          name: "HiveWatch",
          source: "github",
          repository: "https://github.com/sepa79/HiveWatch.git",
          approvedRefs: ["main"]
        }
      ]
    };

    await expect(validateContract(schemaPaths.projectRegistry, registry)).resolves.toBeUndefined();
  });

  it("rejects a project registry entry without explicit refs", async () => {
    const registry = {
      projects: [
        {
          id: "hivewatch",
          name: "HiveWatch",
          source: "github",
          repository: "https://github.com/sepa79/HiveWatch.git"
        }
      ]
    };

    await expect(validateContract(schemaPaths.projectRegistry, registry)).rejects.toBeInstanceOf(ContractValidationError);
  });

  it("accepts explicit local git repositories for local Docker smoke tests", async () => {
    const registry = {
      projects: [
        {
          id: "hivewatch-local",
          name: "HiveWatch Local Fixture",
          source: "local-git",
          repository: "file:///home/sepa/HiveForge/tmp/hivewatch-fixture.git",
          approvedRefs: ["main"]
        }
      ]
    };

    await expect(validateContract(schemaPaths.projectRegistry, registry)).resolves.toBeUndefined();
  });

  it("accepts explicit LAN HTTP Git repositories", async () => {
    const registry = {
      projects: [
        {
          id: "pockethive",
          name: "PocketHive",
          source: "http-git",
          repository: "http://192.168.88.54:8081/git/PocketHive.git",
          approvedRefs: ["pushed-ref"]
        }
      ]
    };

    await expect(validateContract(schemaPaths.projectRegistry, registry)).resolves.toBeUndefined();
  });

  it("rejects arbitrary non-git HTTP repository URLs", async () => {
    const registry = {
      projects: [
        {
          id: "pockethive",
          name: "PocketHive",
          source: "http-git",
          repository: "http://example.com/PocketHive",
          approvedRefs: ["main"]
        }
      ]
    };

    await expect(validateContract(schemaPaths.projectRegistry, registry)).rejects.toBeInstanceOf(ContractValidationError);
  });
});
