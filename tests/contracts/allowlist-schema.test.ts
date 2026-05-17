import { describe, expect, it } from "vitest";
import { ContractValidationError, schemaPaths, validateContract } from "../../src/contracts/schema-loader.js";

describe("allowlist schema", () => {
  it("accepts explicit HiveWatch repository refs", async () => {
    const allowlist = {
      projects: [
        {
          id: "hivewatch",
          name: "HiveWatch",
          source: "github",
          repository: "https://github.com/sepa79/HiveWatch.git",
          allowedRefs: ["main"]
        }
      ]
    };

    await expect(validateContract(schemaPaths.allowlist, allowlist)).resolves.toBeUndefined();
  });

  it("rejects an allowlist entry without explicit refs", async () => {
    const allowlist = {
      projects: [
        {
          id: "hivewatch",
          name: "HiveWatch",
          source: "github",
          repository: "https://github.com/sepa79/HiveWatch.git"
        }
      ]
    };

    await expect(validateContract(schemaPaths.allowlist, allowlist)).rejects.toBeInstanceOf(ContractValidationError);
  });

  it("accepts explicit local git repositories for local Docker smoke tests", async () => {
    const allowlist = {
      projects: [
        {
          id: "hivewatch-local",
          name: "HiveWatch Local Fixture",
          source: "local-git",
          repository: "file:///home/sepa/HiveForge/tmp/hivewatch-fixture.git",
          allowedRefs: ["main"]
        }
      ]
    };

    await expect(validateContract(schemaPaths.allowlist, allowlist)).resolves.toBeUndefined();
  });
});
