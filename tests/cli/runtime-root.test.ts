import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { main } from "../../src/cli/main.js";

describe("CLI runtime root paths", () => {
  it("auto-initializes an empty runtime root before reading the journal", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-base-"));

    const output = await captureStdout(() => main(["read-journal", "--runtime-root", baseDir]));

    expect(JSON.parse(output)).toEqual([]);
    await expect(readFile(path.join(baseDir, "projects.yaml"), "utf8")).resolves.toBe("projects: []\n");
    await expect(readFile(path.join(baseDir, "environments.yaml"), "utf8")).resolves.toContain("projects: []");
    expect((await stat(path.join(baseDir, "workspace"))).isDirectory()).toBe(true);
    await expect(readFile(path.join(baseDir, "journal", "operations.jsonl"), "utf8")).resolves.toBe("");
    expect((await stat(path.join(baseDir, "data"))).isDirectory()).toBe(true);
    expect((await readdir(baseDir)).sort()).toEqual([
      "data",
      "environments.yaml",
      "journal",
      "projects.yaml",
      "workspace"
    ]);
  });

  it("uses an existing runtime root structure without overwriting projects.yaml", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-base-"));
    const projectsPath = path.join(baseDir, "projects.yaml");
    await writeFile(projectsPath, "# keep\nprojects: []\n", "utf8");
    await mkdir(path.join(baseDir, "workspace"));
    await mkdir(path.join(baseDir, "journal"));
    await writeFile(path.join(baseDir, "journal", "operations.jsonl"), "", "utf8");
    await mkdir(path.join(baseDir, "data"));

    await captureStdout(() => main(["read-journal", "--runtime-root", baseDir]));

    await expect(readFile(projectsPath, "utf8")).resolves.toBe("# keep\nprojects: []\n");
  });

  it("rejects mixed runtime root and explicit runtime path modes", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-base-"));

    await expect(
      main(["read-journal", "--runtime-root", baseDir, "--registry", path.join(baseDir, "projects.yaml")])
    ).rejects.toThrow("Use either --runtime-root or explicit runtime paths, not both.");
  });

  it("requires either runtime root or all explicit runtime paths", async () => {
    await expect(main(["read-journal", "--registry", "projects.yaml"])).rejects.toThrow(
      "Missing required runtime option(s): --workspace, --journal, --data-root. Use either --runtime-root or all explicit runtime paths."
    );
  });
});

async function captureStdout(run: () => Promise<void>): Promise<string> {
  const originalWrite = process.stdout.write;
  let output = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;

  try {
    await run();
    return output;
  } finally {
    process.stdout.write = originalWrite;
  }
}
