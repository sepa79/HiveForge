import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadAllowlist, selectAllowedProject } from "../../src/config/allowlist-loader.js";

describe("allowlist loader", () => {
  it("loads explicit allowed HiveWatch refs", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-allowlist-"));
    const filePath = path.join(dir, "allowlist.yaml");
    await writeFile(
      filePath,
      [
        "projects:",
        "  - id: hivewatch",
        "    name: HiveWatch",
        "    source: github",
        "    repository: https://github.com/sepa79/HiveWatch.git",
        "    allowedRefs:",
        "      - main",
        ""
      ].join("\n")
    );

    const allowlist = await loadAllowlist(filePath);

    expect(selectAllowedProject(allowlist, "hivewatch", "main").repository).toBe(
      "https://github.com/sepa79/HiveWatch.git"
    );
  });

  it("rejects unknown projects before checkout", () => {
    expect(() =>
      selectAllowedProject(
        {
          projects: [
            {
              id: "hivewatch",
              name: "HiveWatch",
              source: "github",
              repository: "https://github.com/sepa79/HiveWatch.git",
              allowedRefs: ["main"]
            }
          ]
        },
        "pockethive",
        "main"
      )
    ).toThrow("Project is not allowlisted: pockethive");
  });

  it("rejects refs that are not explicitly allowlisted", () => {
    expect(() =>
      selectAllowedProject(
        {
          projects: [
            {
              id: "hivewatch",
              name: "HiveWatch",
              source: "github",
              repository: "https://github.com/sepa79/HiveWatch.git",
              allowedRefs: ["main"]
            }
          ]
        },
        "hivewatch",
        "feature/test"
      )
    ).toThrow("Git ref is not allowlisted for hivewatch: feature/test");
  });
});
