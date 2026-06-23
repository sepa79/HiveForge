import type { DeployOrchestrator, DeployRequest } from "./deploy-orchestrator.js";
import type { Clock } from "./clock.js";
import type { IdGenerator } from "./id-generator.js";
import { isCommandExecutionError } from "../workspace/command-runner.js";

export type OperationStatus = "running" | "succeeded" | "failed";
export type OperationLogLevel = "info" | "stdout" | "stderr" | "error";

export interface OperationLogEntry {
  at: string;
  level: OperationLogLevel;
  message: string;
}

export type OperationKind =
  | "lifecycle_action"
  | "repository_inspection"
  | "project_registration"
  | "project_ref_unregistration"
  | "project_inspection";

export interface OperationRecord {
  operationId: string;
  status: OperationStatus;
  kind: OperationKind;
  projectId?: string;
  repository?: string;
  gitRef: string;
  component?: string;
  action?: string;
  environmentId?: string;
  profile?: string;
  deploymentName?: string;
  startedAt: string;
  endedAt?: string;
  logs: OperationLogEntry[];
  result?: {
    actionOperationId?: string;
  };
  error?: string;
}

export interface PreDeployOperationRequest {
  kind: Exclude<OperationKind, "lifecycle_action">;
  gitRef: string;
  projectId?: string;
  repository?: string;
}

export class OperationLogService {
  private readonly operations = new Map<string, OperationRecord>();

  constructor(
    private readonly deploy: DeployOrchestrator,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  list(): { operations: OperationRecord[] } {
    return {
      operations: [...this.operations.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    };
  }

  get(operationId: string): OperationRecord | null {
    return this.operations.get(operationId) ?? null;
  }

  startLifecycleAction(request: Omit<DeployRequest, "progress">): OperationRecord {
    const operationId = this.ids.nextId("uiop");
    const record: OperationRecord = {
      operationId,
      status: "running",
      kind: "lifecycle_action",
      projectId: request.projectId,
      gitRef: request.gitRef,
      component: request.component,
      action: request.action,
      ...(request.environmentId ? { environmentId: request.environmentId } : {}),
      ...(request.profile ? { profile: request.profile } : {}),
      ...(request.deploymentName ? { deploymentName: request.deploymentName } : {}),
      startedAt: this.clock.now().toISOString(),
      logs: []
    };

    this.operations.set(operationId, record);
    this.append(operationId, "info", `Started ${request.action} for ${request.projectId}/${request.component}`);

    void this.deploy
      .deploy({
        ...request,
        progress: (event) => this.append(operationId, "info", event.message)
      })
      .then((result) => {
        this.append(operationId, "stdout", result.action.stdout);
        if (result.action.stderr.length > 0) {
          this.append(operationId, "stderr", result.action.stderr);
        }
        this.complete(operationId, "succeeded", { actionOperationId: result.action.operationId });
      })
      .catch((error) => {
        if (isCommandExecutionError(error)) {
          if (error.stdout.length > 0) {
            this.append(operationId, "stdout", error.stdout);
          }
          if (error.stderr.length > 0) {
            this.append(operationId, "stderr", error.stderr);
          }
        }
        const message = isCommandExecutionError(error)
          ? error.summary
          : error instanceof Error
            ? error.message
            : "Operation failed";
        this.append(operationId, "error", message);
        this.complete(operationId, "failed", undefined, message);
      });

    return record;
  }

  async runPreDeployAttempt<T>(
    request: PreDeployOperationRequest,
    run: () => Promise<T>,
    failureReason?: (result: T) => string | null
  ): Promise<{ operation: OperationRecord; result: T }> {
    const operationId = this.ids.nextId("uiop");
    const record: OperationRecord = {
      operationId,
      status: "running",
      kind: request.kind,
      ...(request.projectId ? { projectId: request.projectId } : {}),
      ...(request.repository ? { repository: request.repository } : {}),
      gitRef: request.gitRef,
      startedAt: this.clock.now().toISOString(),
      logs: []
    };

    this.operations.set(operationId, record);
    this.append(operationId, "info", `Started ${formatKind(request.kind)} for ${formatTarget(request)}`);

    try {
      const result = await run();
      const failedReason = failureReason ? failureReason(result) : null;
      if (failedReason) {
        this.append(operationId, "error", failedReason);
        this.complete(operationId, "failed", undefined, failedReason);
      } else {
        this.append(operationId, "info", `Completed ${formatKind(request.kind)} for ${formatTarget(request)}`);
        this.complete(operationId, "succeeded");
      }
      return {
        operation: this.operations.get(operationId) ?? record,
        result
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : `${formatKind(request.kind)} failed`;
      this.append(operationId, "error", message);
      this.complete(operationId, "failed", undefined, message);
      throw error;
    }
  }

  private append(operationId: string, level: OperationLogLevel, message: string): void {
    const record = this.operations.get(operationId);
    if (!record) {
      return;
    }
    if (message.length === 0) {
      return;
    }
    record.logs.push({
      at: this.clock.now().toISOString(),
      level,
      message
    });
  }

  private complete(
    operationId: string,
    status: Exclude<OperationStatus, "running">,
    result?: OperationRecord["result"],
    error?: string
  ): void {
    const record = this.operations.get(operationId);
    if (!record) {
      return;
    }
    record.status = status;
    record.endedAt = this.clock.now().toISOString();
    if (result) {
      record.result = result;
    }
    if (error) {
      record.error = error;
    }
  }
}

function formatKind(kind: OperationKind): string {
  return kind.replaceAll("_", " ");
}

function formatTarget(request: PreDeployOperationRequest): string {
  if (request.projectId) {
    return `${request.projectId}@${request.gitRef}`;
  }
  if (request.repository) {
    return `${request.repository}@${request.gitRef}`;
  }
  return request.gitRef;
}
