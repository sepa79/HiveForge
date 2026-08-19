import type { CommandResult } from "../workspace/command-runner.js";
import type { DeploymentExecutorKind, DeploymentStateRecord } from "./deployment-state-store.js";

export interface DeploymentExecutorRequest {
  deployment: DeploymentStateRecord;
}

export interface PreparedComposeDeploymentRequest extends DeploymentExecutorRequest {
  composeFile: string;
  bindSourceDir?: string;
}

export interface DeploymentExecutorResult extends CommandResult {
  composeFile?: string;
  runtime: "docker-single" | "docker-swarm";
  executorKind: DeploymentExecutorKind;
  portainer?: DeploymentStateRecord["portainer"];
}

export interface DeploymentExecutor {
  readonly executorKind: DeploymentExecutorKind;
  deploy(request: PreparedComposeDeploymentRequest): Promise<DeploymentExecutorResult>;
  remove(request: DeploymentExecutorRequest): Promise<DeploymentExecutorResult>;
}
