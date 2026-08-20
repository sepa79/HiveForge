import type { Clock } from "../../src/operation/clock.js";
import type { IdGenerator } from "../../src/operation/id-generator.js";
import { WorkspaceRetentionService } from "../../src/workspace/workspace-retention-service.js";

export class SequenceIds implements IdGenerator {
  private next = 1;

  nextId(prefix: string): string {
    return `${prefix}-${this.next++}`;
  }
}

export class FixedClock implements Clock {
  constructor(private readonly iso = "2026-05-17T10:00:00.000Z") {}

  now(): Date {
    return new Date(this.iso);
  }
}

export function createWorkspaceRetentionService(
  workspaceRoot: string,
  options: { clock?: Clock; ids?: IdGenerator } = {}
): WorkspaceRetentionService {
  return new WorkspaceRetentionService(workspaceRoot, options.ids ?? new SequenceIds(), options.clock ?? new FixedClock());
}
