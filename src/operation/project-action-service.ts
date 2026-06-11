import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolveDeclaredAction } from "../action/action-resolver.js";
import type { ActionRunner } from "../action/ansible-runner.js";
import type { JournalArtifact } from "../journal/journal-event.js";
import type { Journal } from "../journal/journal.js";
import type { ProjectRegistry } from "../manifest/manifest-types.js";
import { isCommandExecutionError } from "../workspace/command-runner.js";
import type { Clock } from "./clock.js";
import type { IdGenerator } from "./id-generator.js";

export interface ProjectActionAfterRunContext {
  operationId: string;
  environment: NodeJS.ProcessEnv;
  endedAt: string;
}

export interface ProjectActionAfterRunResult {
  deploymentId?: string;
}

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
  afterRun?: (context: ProjectActionAfterRunContext) => Promise<ProjectActionAfterRunResult | void>;
}

export interface ProjectActionResult {
  operationId: string;
  deploymentId?: string;
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

    const runEnvironment = actionEnvironment(request);
    try {
      const result = await this.runner.run(action, runEnvironment);
      const endedAt = this.clock.now().toISOString();
      const afterRun = await request.afterRun?.({ operationId, environment: runEnvironment, endedAt });
      const artifacts = await collectActionArtifacts(runEnvironment, endedAt);
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
        endedAt,
        reason: "Action completed successfully",
        ...(artifacts.length > 0 ? { artifacts } : {})
      });

      return {
        operationId,
        ...(afterRun?.deploymentId ? { deploymentId: afterRun.deploymentId } : {}),
        stdout: result.stdout,
        stderr: result.stderr
      };
    } catch (error) {
      const endedAt = this.clock.now().toISOString();
      const artifacts = await collectActionArtifacts(runEnvironment, endedAt);
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
        endedAt,
        reason: actionFailureReason(error),
        ...(artifacts.length > 0 ? { artifacts } : {})
      });
      throw error;
    }
  }
}

function actionFailureReason(error: unknown): string {
  if (isCommandExecutionError(error)) {
    return error.summary;
  }
  return error instanceof Error ? error.message : "Action failed";
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

async function collectActionArtifacts(environment: NodeJS.ProcessEnv | undefined, recordedAt: string): Promise<JournalArtifact[]> {
  const composePath = environment?.HIVEFORGE_RENDERED_COMPOSE_FILE;
  if (!composePath) {
    return [];
  }

  let content: Buffer;
  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(composePath);
    if (!fileStat.isFile()) {
      return [];
    }
    content = await readFile(composePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return [
    {
      name: "compose",
      path: composePath,
      mediaType: "application/yaml",
      sha256: createHash("sha256").update(content).digest("hex"),
      bytes: fileStat.size,
      recordedAt
    }
  ];
}
