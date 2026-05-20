import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonlJournal } from "../../src/journal/jsonl-journal.js";

describe("JSONL journal", () => {
  it("appends and reads validated events", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const journal = new JsonlJournal(dir);

    await journal.append({
      eventId: "evt-1",
      operationId: "op-1",
      operationType: "inspect_project",
      project: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      gitRef: "main",
      status: "succeeded",
      startedAt: "2026-05-17T10:00:00.000Z",
      endedAt: "2026-05-17T10:00:01.000Z",
      reason: "Loaded 1 managed component"
    });

    await expect(journal.readAll()).resolves.toEqual([
      {
        eventId: "evt-1",
        operationId: "op-1",
        operationType: "inspect_project",
        project: "hivewatch",
        repository: "https://github.com/sepa79/HiveWatch.git",
        gitRef: "main",
        status: "succeeded",
        startedAt: "2026-05-17T10:00:00.000Z",
        endedAt: "2026-05-17T10:00:01.000Z",
        reason: "Loaded 1 managed component"
      }
    ]);
  });

  it("returns no events when the journal file does not exist", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const journal = new JsonlJournal(dir);

    await expect(journal.readAll()).resolves.toEqual([]);
  });
});
