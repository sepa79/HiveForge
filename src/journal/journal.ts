import type { JournalEvent } from "./journal-event.js";

export interface Journal {
  append(event: JournalEvent): Promise<void>;
  readAll(): Promise<JournalEvent[]>;
}
