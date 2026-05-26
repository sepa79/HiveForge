import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RuntimeEnvStore } from "../../src/config/runtime-env-store.js";

describe("runtime env store", () => {
  it("initializes, stores, lists, and resolves project/profile env", async () => {
    const filePath = await tempStorePath();
    const store = new RuntimeEnvStore(filePath);

    await expect(store.listProject("hivewatch")).resolves.toEqual({ projectId: "hivewatch", entries: [] });
    await store.set({ projectId: "hivewatch", values: { IMAGE_TAG: "latest", PUBLIC_URL: "http://local" } });
    await store.set({ projectId: "hivewatch", profile: "test", values: { IMAGE_TAG: "test" } });

    await expect(store.listProject("hivewatch")).resolves.toEqual({
      projectId: "hivewatch",
      entries: [
        {
          projectId: "hivewatch",
          values: {
            IMAGE_TAG: "latest",
            PUBLIC_URL: "http://local"
          }
        },
        {
          projectId: "hivewatch",
          profile: "test",
          values: {
            IMAGE_TAG: "test"
          }
        }
      ]
    });
    await expect(store.resolve({ projectId: "hivewatch", profile: "test" })).resolves.toEqual({
      IMAGE_TAG: "test",
      PUBLIC_URL: "http://local"
    });
  });

  it("unsets keys from the exact scope only", async () => {
    const store = new RuntimeEnvStore(await tempStorePath());
    await store.set({ projectId: "hivewatch", values: { IMAGE_TAG: "latest" } });
    await store.set({ projectId: "hivewatch", profile: "test", values: { IMAGE_TAG: "test" } });

    await expect(store.unset({ projectId: "hivewatch", profile: "test", keys: ["IMAGE_TAG"] })).resolves.toEqual({
      projectId: "hivewatch",
      profile: "test",
      values: {},
      removedKeys: ["IMAGE_TAG"]
    });
    await expect(store.resolve({ projectId: "hivewatch", profile: "test" })).resolves.toEqual({
      IMAGE_TAG: "latest"
    });
  });

  it("rejects reserved HiveForge env names", async () => {
    const store = new RuntimeEnvStore(await tempStorePath());

    await expect(
      store.set({ projectId: "hivewatch", values: { HIVEFORGE_PROFILE: "test" } })
    ).rejects.toThrow("Invalid runtime env key: HIVEFORGE_PROFILE");
  });

  it("rejects duplicate scopes from hand-edited config", async () => {
    const filePath = await tempStorePath();
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        entries: [
          { projectId: "hivewatch", values: { IMAGE_TAG: "latest" } },
          { projectId: "hivewatch", values: { PUBLIC_URL: "http://local" } }
        ]
      }),
      "utf8"
    );

    await expect(new RuntimeEnvStore(filePath).listProject("hivewatch")).rejects.toThrow(
      "Duplicate runtime env scope: hivewatch/"
    );
  });

  it("persists deterministic JSON", async () => {
    const filePath = await tempStorePath();
    const store = new RuntimeEnvStore(filePath);

    await store.set({ projectId: "hivewatch", values: { PUBLIC_URL: "http://local", IMAGE_TAG: "latest" } });

    await expect(readFile(filePath, "utf8")).resolves.toContain('"IMAGE_TAG": "latest"');
  });
});

async function tempStorePath(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-runtime-env-"));
  return path.join(dir, "runtime-env.json");
}
