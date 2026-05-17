import type { DeployOrchestrator, DeployRequest } from "./deploy-orchestrator.js";
import type { Clock } from "./clock.js";
import type { IdGenerator } from "./id-generator.js";

export type OperationStatus = "running" | "succeeded" | "failed";
export type OperationLogLevel = "info" | "stdout" | "stderr" | "error";

export interface OperationLogEntry {
  at: string;
  level: OperationLogLevel;
  message: string;
}

export interface OperationRecord {
  operationId: string;
  status: OperationStatus;
  kind: "lifecycle_action";
  projectId: string;
  gitRef: string;
  component: string;
  action: string;
  environmentId?: string;
  profile?: string;
  startedAt: string;
  endedAt?: string;
  logs: OperationLogEntry[];
  result?: {
    actionOperationId: string;
  };
  error?: string;
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
        const message = error instanceof Error ? error.message : "Operation failed";
        this.append(operationId, "error", message);
        this.complete(operationId, "failed", undefined, message);
      });

    return record;
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
