export type DeploymentStateStatus = "preparing" | "deployed" | "removed" | "gone" | "failed";
export type DeploymentExecutorKind = "docker-direct" | "portainer-stack";

export interface PortainerDeploymentState {
  endpointId: number;
  stackId?: number;
  stackName?: string;
}

export interface DeploymentStateRecord {
  deploymentId: string;
  deploymentName: string;
  executorKind: DeploymentExecutorKind;
  environment: string;
  project: string;
  repository: string;
  gitRef: string;
  component: string;
  profile?: string;
  portainer?: PortainerDeploymentState;
  status: DeploymentStateStatus;
  lastAction: string;
  operationId: string;
  updatedAt: string;
}

export interface DeploymentRuntimeMetadata {
  executorKind: DeploymentExecutorKind;
  portainer?: PortainerDeploymentState;
}

export interface RecordLifecycleDeploymentInput extends DeploymentRuntimeMetadata {
  environment: string;
  deploymentName?: string;
  project: string;
  repository: string;
  gitRef: string;
  component: string;
  profile?: string;
  action: string;
  operationId: string;
  updatedAt: string;
}

export interface EnsureDeploymentInput extends DeploymentRuntimeMetadata {
  environment: string;
  deploymentName?: string;
  project: string;
  repository: string;
  gitRef: string;
  component: string;
  profile?: string;
  action: string;
  operationId: string;
  updatedAt: string;
}

export interface RecordDeploymentFailureInput extends EnsureDeploymentInput {
  reason: string;
}

export interface DeploymentLookup {
  deploymentId?: string;
  environment?: string;
  project?: string;
  component?: string;
  profile?: string;
}

export interface DeploymentStateStore {
  listDeployments(environment?: string): Promise<DeploymentStateRecord[]>;
  getDeployment(deploymentId: string): Promise<DeploymentStateRecord | null>;
  findDeployment(lookup: DeploymentLookup): Promise<DeploymentStateRecord | null>;
  ensureDeployment(input: EnsureDeploymentInput): Promise<DeploymentStateRecord>;
  markGone(deploymentId: string, updatedAt: string): Promise<DeploymentStateRecord | null>;
  recordLifecycleAction(input: RecordLifecycleDeploymentInput): Promise<DeploymentStateRecord | null>;
  recordDeploymentFailure(input: RecordDeploymentFailureInput): Promise<DeploymentStateRecord>;
}

export const ACTIVE_LIFECYCLE_ACTIONS = new Set(["deploy", "update", "upgrade"]);
export const INACTIVE_LIFECYCLE_ACTIONS = new Set(["remove", "purge"]);

export function lifecycleDeploymentStatus(action: string): DeploymentStateStatus | null {
  if (ACTIVE_LIFECYCLE_ACTIONS.has(action)) {
    return "deployed";
  }
  if (INACTIVE_LIFECYCLE_ACTIONS.has(action)) {
    return "removed";
  }
  return null;
}

export function deploymentProfileKey(profile: string | undefined): string {
  return profile ?? "";
}
