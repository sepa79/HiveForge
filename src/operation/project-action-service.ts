import { resolveDeclaredAction } from "../action/action-resolver.js";
import type { ActionRunner } from "../action/ansible-runner.js";
import type { Journal } from "../journal/journal.js";
import type { ProjectRegistry } from "../manifest/manifest-types.js";
import type { Clock } from "./clock.js";
import type { IdGenerator } from "./id-generator.js";

export interface ProjectActionRequest {
  projectId: string;
  repository: string;
  gitRef: string;
  workspacePath: string;
  registry: ProjectRegistry;
  component: string;
  action: string;
  environmentId?: string;
  profile?: string;
  environment?: NodeJS.ProcessEnv;
}

export interface ProjectActionResult {
  operationId: string;
  stdout: string;
  stderr: string;
}

export class ProjectActionService {
  constructor(
    private readonly runner: ActionRunner,
    private readonly journal: Journal,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async run(request: ProjectActionRequest): Promise<ProjectActionResult> {
    const operationId = this.ids.nextId("op");
    const startedAt = this.clock.now().toISOString();
    const scope = journalScope(request);

    let action;
    try {
      action = resolveDeclaredAction(request.registry, request.workspacePath, request.component, request.action);
    } catch (error) {
      await this.journal.append({
        eventId: this.ids.nextId("evt"),
        operationId,
        operationType: "run_action",
        project: request.projectId,
        repository: request.repository,
        gitRef: request.gitRef,
        ...scope,
        component: request.component,
        action: request.action,
        adapter: "ansible",
        status: "failed",
        startedAt,
        endedAt: this.clock.now().toISOString(),
        reason: error instanceof Error ? error.message : "Action resolution failed"
      });
      throw error;
    }

    try {
      const result = await this.runner.run(action, actionEnvironment(request));
      await this.journal.append({
        eventId: this.ids.nextId("evt"),
        operationId,
        operationType: "run_action",
        project: request.projectId,
        repository: request.repository,
        gitRef: request.gitRef,
        ...scope,
        component: action.component,
        action: action.action,
        adapter: action.adapter,
        status: "succeeded",
        startedAt,
        endedAt: this.clock.now().toISOString(),
        reason: "Action completed successfully"
      });

      return {
        operationId,
        stdout: result.stdout,
        stderr: result.stderr
      };
    } catch (error) {
      await this.journal.append({
        eventId: this.ids.nextId("evt"),
        operationId,
        operationType: "run_action",
        project: request.projectId,
        repository: request.repository,
        gitRef: request.gitRef,
        ...scope,
        component: action.component,
        action: action.action,
        adapter: action.adapter,
        status: "failed",
        startedAt,
        endedAt: this.clock.now().toISOString(),
        reason: error instanceof Error ? error.message : "Action failed"
      });
      throw error;
    }
  }
}

function journalScope(request: ProjectActionRequest): { environment?: string; profile?: string } {
  return {
    ...(request.environmentId ? { environment: request.environmentId } : {}),
    ...(request.profile ? { profile: request.profile } : {})
  };
}

function actionEnvironment(request: ProjectActionRequest): NodeJS.ProcessEnv {
  return {
    ...(request.environment ?? {}),
    ...(request.profile ? { HIVEFORGE_PROFILE: request.profile } : {})
  };
}
