import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Journal } from "../../src/journal/journal.js";
import { DeploymentComposeService } from "../../src/operation/deployment-compose-service.js";

describe("deployment compose service", () => {
  it("returns redacted compose content from recorded operation artifact", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-compose-"));
    const composePath = path.join(dir, "compose.yml");
    const content = "services:\n  api:\n    image: hivewatch:test\n    environment:\n      API_TOKEN: super-secret\n";
    await writeFile(composePath, content, "utf8");

    const service = new DeploymentComposeService(
      journal([
        {
          eventId: "evt-1",
          operationId: "op-1",
          operationType: "run_action",
          project: "hivewatch",
          repository: "https://github.com/sepa79/HiveWatch.git",
          gitRef: "main",
          component: "api",
          action: "deploy",
          adapter: "ansible",
          status: "succeeded",
          startedAt: "2026-05-17T10:00:00.000Z",
          endedAt: "2026-05-17T10:00:00.000Z",
          reason: "done",
          artifacts: [
            {
              name: "compose",
              path: composePath,
              mediaType: "application/yaml",
              sha256: sha256(content),
              bytes: Buffer.byteLength(content),
              recordedAt: "2026-05-17T10:00:00.000Z"
            }
          ]
        }
      ])
    );

    await expect(service.get("op-1")).resolves.toMatchObject({
      operationId: "op-1",
      status: "present",
      source: "operation_artifact",
      content: "services:\n  api:\n    image: hivewatch:test\n    environment:\n      API_TOKEN: [redacted]\n",
      redacted: true,
      artifact: {
        path: composePath,
        digestMatchesJournal: true
      }
    });
  });

  it("does not guess compose files when no operation artifact is recorded", async () => {
    const service = new DeploymentComposeService(journal([]));

    await expect(service.get("op-missing")).resolves.toEqual({
      operationId: "op-missing",
      status: "missing",
      source: "none",
      redacted: false,
      reason: "Operation not found in journal: op-missing"
    });
  });
});

function journal(events: Awaited<ReturnType<Journal["readAll"]>>): Journal {
  return {
    async append() {},
    async readAll() {
      return events;
    }
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
