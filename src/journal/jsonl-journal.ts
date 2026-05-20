import { mkdir, readFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { schemaPaths, validateContract } from "../contracts/schema-loader.js";
import type { Journal } from "./journal.js";
import type { JournalEvent } from "./journal-event.js";

const JOURNAL_FILE = "operations.jsonl";

export class JsonlJournal implements Journal {
  private readonly filePath: string;

  constructor(journalDir: string) {
    this.filePath = path.join(journalDir, JOURNAL_FILE);
  }

  async append(event: JournalEvent): Promise<void> {
    await validateContract(schemaPaths.journalEvent, event);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(event)}\n`, "utf8");
  }

  async readAll(): Promise<JournalEvent[]> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const events = raw
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as JournalEvent);

    for (const event of events) {
      await validateContract(schemaPaths.journalEvent, event);
    }

    return events;
  }
}
