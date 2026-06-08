import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAuthToken } from "../../src/runtime/auth-token.js";

describe("runtime auth token", () => {
  it("uses an explicit environment token", async () => {
    await expect(resolveAuthToken({ authToken: "operator-token" })).resolves.toEqual({
      authToken: "operator-token",
      source: "environment"
    });
  });

  it("does not create a base dir token file when an environment token is set", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-auth-"));
    const tokenPath = path.join(baseDir, "auth-token");

    await expect(resolveAuthToken({ authToken: "operator-token", baseDir })).resolves.toEqual({
      authToken: "operator-token",
      source: "environment"
    });
    await expect(stat(tokenPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports an ignored base dir token file when an environment token is set", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-auth-"));
    const tokenPath = path.join(baseDir, "auth-token");
    await writeFile(tokenPath, "stored-token\n", "utf8");

    await expect(resolveAuthToken({ authToken: "operator-token", baseDir })).resolves.toEqual({
      authToken: "operator-token",
      source: "environment",
      ignoredTokenPath: tokenPath
    });
  });

  it("reads an existing base dir token", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-auth-"));
    const tokenPath = path.join(baseDir, "auth-token");
    await writeFile(tokenPath, "stored-token\n", "utf8");

    await expect(resolveAuthToken({ baseDir })).resolves.toEqual({
      authToken: "stored-token",
      source: "file",
      tokenPath
    });
  });

  it("generates a durable token when base dir has no token", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-auth-"));
    const tokenPath = path.join(baseDir, "auth-token");

    const first = await resolveAuthToken({ baseDir });
    const second = await resolveAuthToken({ baseDir });

    expect(first.source).toBe("generated");
    expect(first.tokenPath).toBe(tokenPath);
    expect(first.authToken.length).toBeGreaterThan(20);
    expect(second).toEqual({
      authToken: first.authToken,
      source: "file",
      tokenPath
    });
    await expect(readFile(tokenPath, "utf8")).resolves.toBe(`${first.authToken}\n`);
    expect((await stat(tokenPath)).mode & 0o777).toBe(0o644);
  });

  it("requires an explicit token outside base dir mode", async () => {
    await expect(resolveAuthToken({})).rejects.toThrow("Missing required environment variable: HIVEFORGE_AUTH_TOKEN");
  });
});
