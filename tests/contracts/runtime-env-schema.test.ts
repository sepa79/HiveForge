import { describe, expect, it } from "vitest";
import { ContractValidationError, schemaPaths, validateContract } from "../../src/contracts/schema-loader.js";

describe("runtime env schema", () => {
  it("accepts project and profile scoped non-secret runtime env", async () => {
    const config = {
      version: 1,
      entries: [
        {
          projectId: "hivewatch",
          values: {
            IMAGE_TAG: "latest"
          }
        },
        {
          projectId: "hivewatch",
          profile: "test",
          values: {
            PUBLIC_URL: "http://127.0.0.1:18180"
          }
        }
      ]
    };

    await expect(validateContract(schemaPaths.runtimeEnv, config)).resolves.toBeUndefined();
  });

  it("rejects HiveForge-reserved env names", async () => {
    const config = {
      version: 1,
      entries: [
        {
          projectId: "hivewatch",
          values: {
            HIVEFORGE_PROFILE: "test"
          }
        }
      ]
    };

    await expect(validateContract(schemaPaths.runtimeEnv, config)).rejects.toBeInstanceOf(ContractValidationError);
  });
});
