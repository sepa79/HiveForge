import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadProjectRegistryConfig,
  selectRegisteredProject
} from "../../src/config/project-registry-loader.js";

describe("project registry loader", () => {
  it("loads explicit HiveWatch project refs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-project-registry-"));
    const filePath = path.join(dir, "projects.yaml");
    await writeFile(
      filePath,
      [
        "projects:",
        "  - id: hivewatch",
        "    name: HiveWatch",
        "    source: github",
        "    repository: https://github.com/sepa79/HiveWatch.git",
        "    approvedRefs:",
        "      - main",
        ""
      ].join("\n")
    );

    const registry = await loadProjectRegistryConfig(filePath);

    expect(selectRegisteredProject(registry, "hivewatch", "main").repository).toBe(
      "https://github.com/sepa79/HiveWatch.git"
    );
  });

  it("rejects unknown projects before checkout", () => {
    expect(() =>
      selectRegisteredProject(
        {
          projects: [
            {
              id: "hivewatch",
              name: "HiveWatch",
              source: "github",
              repository: "https://github.com/sepa79/HiveWatch.git",
              approvedRefs: ["main"]
            }
          ]
        },
        "pockethive",
        "main"
      )
    ).toThrow("Project is not registered: pockethive");
  });

  it("rejects refs that are not explicitly approved", () => {
    expect(() =>
      selectRegisteredProject(
        {
          projects: [
            {
              id: "hivewatch",
              name: "HiveWatch",
              source: "github",
              repository: "https://github.com/sepa79/HiveWatch.git",
              approvedRefs: ["main"]
            }
          ]
        },
        "hivewatch",
        "feature/test"
      )
    ).toThrow("Git ref is not approved for hivewatch: feature/test");
  });
});
