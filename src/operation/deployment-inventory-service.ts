import type { Journal } from "../journal/journal.js";
import type { JournalEvent } from "../journal/journal-event.js";

const ACTIVE_ACTIONS = new Set(["deploy", "update", "upgrade"]);
const INACTIVE_ACTIONS = new Set(["remove", "purge"]);

export interface DeploymentInventoryItem {
  environment: string;
  project: string;
  repository: string;
  gitRef: string;
  component: string;
  profile?: string;
  status: "deployed" | "removed";
  lastAction: string;
  operationId: string;
  updatedAt: string;
}

export class DeploymentInventoryService {
  constructor(
    private readonly journal: Journal,
    private readonly environmentId: string
  ) {}

  async list(): Promise<{ deployments: DeploymentInventoryItem[] }> {
    const deployments = new Map<string, DeploymentInventoryItem>();

    for (const event of await this.journal.readAll()) {
      const item = inventoryItem(event, this.environmentId);
      if (!item) {
        continue;
      }
      deployments.set(inventoryKey(item), item);
    }

    return {
      deployments: [...deployments.values()].sort((left, right) =>
        [left.project, left.component, left.profile ?? ""].join(":").localeCompare(
          [right.project, right.component, right.profile ?? ""].join(":")
        )
      )
    };
  }
}

function inventoryItem(event: JournalEvent, currentEnvironment: string): DeploymentInventoryItem | null {
  if (event.operationType !== "run_action" || event.status !== "succeeded") {
    return null;
  }
  if (!event.repository || !event.component || !event.action || event.environment !== currentEnvironment) {
    return null;
  }
  if (!ACTIVE_ACTIONS.has(event.action) && !INACTIVE_ACTIONS.has(event.action)) {
    return null;
  }

  return {
    environment: event.environment,
    project: event.project,
    repository: event.repository,
    gitRef: event.gitRef,
    component: event.component,
    ...(event.profile ? { profile: event.profile } : {}),
    status: ACTIVE_ACTIONS.has(event.action) ? "deployed" : "removed",
    lastAction: event.action,
    operationId: event.operationId,
    updatedAt: event.endedAt
  };
}

function inventoryKey(item: DeploymentInventoryItem): string {
  return [item.environment, item.project, item.component, item.profile ?? ""].join(":");
}
