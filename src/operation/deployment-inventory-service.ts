import type {
  DeploymentExecutorKind,
  DeploymentStateRecord,
  DeploymentStateStatus,
  DeploymentStateStore
} from "./deployment-state-store.js";

export interface DeploymentInventoryItem {
  deploymentId: string;
  deploymentName: string;
  executorKind: DeploymentExecutorKind;
  environment: string;
  project: string;
  repository: string;
  gitRef: string;
  component: string;
  profile?: string;
  status: DeploymentStateStatus;
  lastAction: string;
  operationId: string;
  updatedAt: string;
}

export class DeploymentInventoryService {
  constructor(
    private readonly deploymentState: DeploymentStateStore,
    private readonly environmentId: string
  ) {}

  async list(): Promise<{ deployments: DeploymentInventoryItem[] }> {
    return {
      deployments: (await this.deploymentState.listDeployments(this.environmentId)).map(inventoryItem)
    };
  }
}

function inventoryItem(record: DeploymentStateRecord): DeploymentInventoryItem {
  return {
    deploymentId: record.deploymentId,
    deploymentName: record.deploymentName,
    executorKind: record.executorKind,
    environment: record.environment,
    project: record.project,
    repository: record.repository,
    gitRef: record.gitRef,
    component: record.component,
    ...(record.profile ? { profile: record.profile } : {}),
    status: record.status,
    lastAction: record.lastAction,
    operationId: record.operationId,
    updatedAt: record.updatedAt
  };
}
