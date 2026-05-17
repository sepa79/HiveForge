import { randomUUID } from "node:crypto";

export interface IdGenerator {
  nextId(prefix: string): string;
}

export class UuidGenerator implements IdGenerator {
  nextId(prefix: string): string {
    return `${prefix}-${randomUUID()}`;
  }
}
