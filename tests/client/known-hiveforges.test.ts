import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  findKnownHiveForgeTarget,
  loadKnownHiveForges,
  readActiveTargetId,
  resolveActiveHiveForgeTarget,
  writeActiveTargetId
} from "../../src/client/known-hiveforges.js";

describe("known HiveForge targets", () => {
  it("loads endpoint metadata without treating it as environment capabilities", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hf-targets-"));
    const configPath = path.join(dir, "known-hiveforges.local.yaml");
    await writeFile(
      configPath,
      [
        "knownHiveForges:",
        "  - id: small",
        "    name: Small Docker",
        "    baseUrl: http://192.0.2.10:3100",
        "    authTokenEnv: HF_SMALL_TOKEN",
        "  - id: big",
        "    name: Big Swarm",
        "    baseUrl: http://192.0.2.20:3100",
        "    authTokenEnv: HF_BIG_TOKEN"
      ].join("\n")
    );

    const config = await loadKnownHiveForges(configPath);

    expect(config.knownHiveForges).toEqual([
      {
        id: "small",
        name: "Small Docker",
        baseUrl: "http://192.0.2.10:3100",
        authTokenEnv: "HF_SMALL_TOKEN"
      },
      {
        id: "big",
        name: "Big Swarm",
        baseUrl: "http://192.0.2.20:3100",
        authTokenEnv: "HF_BIG_TOKEN"
      }
    ]);
    expect(config.knownHiveForges[0]).not.toHaveProperty("capabilities");
  });

  it("writes and reads the active target explicitly", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hf-targets-"));
    const statePath = path.join(dir, ".hiveforge-target");

    await writeActiveTargetId("small", statePath);

    await expect(readActiveTargetId(statePath)).resolves.toBe("small");
    await expect(readFile(statePath, "utf8")).resolves.toBe("small\n");
  });

  it("resolves the active target and token from the configured env var", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hf-targets-"));
    const configPath = path.join(dir, "known-hiveforges.local.yaml");
    const statePath = path.join(dir, ".hiveforge-target");
    await writeFile(
      configPath,
      [
        "knownHiveForges:",
        "  - id: small",
        "    name: Small Docker",
        "    baseUrl: http://192.0.2.10:3100",
        "    authTokenEnv: HF_SMALL_TOKEN"
      ].join("\n")
    );
    await writeActiveTargetId("small", statePath);

    const resolved = await resolveActiveHiveForgeTarget({
      configPath,
      statePath,
      env: { HF_SMALL_TOKEN: "secret-token" }
    });

    expect(resolved).toEqual({
      target: {
        id: "small",
        name: "Small Docker",
        baseUrl: "http://192.0.2.10:3100",
        authTokenEnv: "HF_SMALL_TOKEN"
      },
      authToken: "secret-token"
    });
  });

  it("fails explicitly when the selected target token is missing", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hf-targets-"));
    const configPath = path.join(dir, "known-hiveforges.local.yaml");
    const statePath = path.join(dir, ".hiveforge-target");
    await writeFile(
      configPath,
      [
        "knownHiveForges:",
        "  - id: big",
        "    name: Big Swarm",
        "    baseUrl: http://192.0.2.20:3100",
        "    authTokenEnv: HF_BIG_TOKEN"
      ].join("\n")
    );
    await writeActiveTargetId("big", statePath);

    await expect(resolveActiveHiveForgeTarget({ configPath, statePath, env: {} })).rejects.toThrow(
      "Missing auth token environment variable for HiveForge target big: HF_BIG_TOKEN"
    );
  });

  it("rejects duplicate target ids", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hf-targets-"));
    const configPath = path.join(dir, "known-hiveforges.local.yaml");
    await writeFile(
      configPath,
      [
        "knownHiveForges:",
        "  - id: small",
        "    name: Small Docker",
        "    baseUrl: http://192.0.2.10:3100",
        "    authTokenEnv: HF_SMALL_TOKEN",
        "  - id: small",
        "    name: Duplicate",
        "    baseUrl: http://192.0.2.11:3100",
        "    authTokenEnv: HF_OTHER_TOKEN"
      ].join("\n")
    );

    await expect(loadKnownHiveForges(configPath)).rejects.toThrow("Duplicate HiveForge target id: small");
  });

  it("rejects unknown active target ids", () => {
    expect(() => findKnownHiveForgeTarget({ knownHiveForges: [] }, "missing")).toThrow(
      "Unknown HiveForge target: missing"
    );
  });
});
