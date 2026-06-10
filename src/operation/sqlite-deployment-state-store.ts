import { DatabaseSync } from "node:sqlite";
import type { IdGenerator } from "./id-generator.js";
import {
  deploymentProfileKey,
  lifecycleDeploymentStatus,
  type DeploymentLookup,
  type DeploymentStateRecord,
  type DeploymentStateStore,
  type EnsureDeploymentInput,
  type RecordDeploymentFailureInput,
  type RecordLifecycleDeploymentInput
} from "./deployment-state-store.js";

export class SqliteDeploymentStateStore implements DeploymentStateStore {
  private readonly db: DatabaseSync;

  constructor(
    path: string,
    private readonly ids: IdGenerator
  ) {
    this.db = new DatabaseSync(path);
    this.initialize();
  }

  async listDeployments(environment?: string): Promise<DeploymentStateRecord[]> {
    const rows = environment
      ? this.db
          .prepare(
            `SELECT * FROM deployments
             WHERE environment = ?
             ORDER BY project, component, profile_key`
          )
          .all(environment)
      : this.db.prepare(`SELECT * FROM deployments ORDER BY environment, project, component, profile_key`).all();
    return rows.map(rowToDeployment);
  }

  async getDeployment(deploymentId: string): Promise<DeploymentStateRecord | null> {
    const row = this.db.prepare(`SELECT * FROM deployments WHERE deployment_id = ?`).get(deploymentId);
    return row ? rowToDeployment(row) : null;
  }

  async findDeployment(lookup: DeploymentLookup): Promise<DeploymentStateRecord | null> {
    if (lookup.deploymentId) {
      return this.getDeployment(lookup.deploymentId);
    }
    if (!lookup.environment || !lookup.project || !lookup.component) {
      throw new Error("Deployment lookup requires deploymentId or environment, project, and component.");
    }
    const row = this.db
      .prepare(
        `SELECT * FROM deployments
         WHERE environment = ? AND project = ? AND component = ? AND profile_key = ?`
      )
      .get(lookup.environment, lookup.project, lookup.component, deploymentProfileKey(lookup.profile));
    return row ? rowToDeployment(row) : null;
  }

  async recordLifecycleAction(input: RecordLifecycleDeploymentInput): Promise<DeploymentStateRecord | null> {
    const status = lifecycleDeploymentStatus(input.action);
    if (!status) {
      return null;
    }
    return this.writeDeployment(input, status);
  }

  async ensureDeployment(input: EnsureDeploymentInput): Promise<DeploymentStateRecord> {
    return this.writeDeployment(input, "preparing");
  }

  async recordDeploymentFailure(input: RecordDeploymentFailureInput): Promise<DeploymentStateRecord> {
    return this.writeDeployment(input, "failed");
  }

  private async writeDeployment(
    input: RecordLifecycleDeploymentInput | EnsureDeploymentInput | RecordDeploymentFailureInput,
    status: DeploymentStateRecord["status"]
  ): Promise<DeploymentStateRecord> {
    const profileKey = deploymentProfileKey(input.profile);
    const existing = await this.findDeployment({
      environment: input.environment,
      project: input.project,
      component: input.component,
      profile: input.profile
    });
    const deploymentId = existing?.deploymentId ?? this.ids.nextId("deployment");

    this.db
      .prepare(
        `INSERT INTO deployments (
           deployment_id,
           environment,
           project,
           repository,
           git_ref,
           component,
           profile,
           profile_key,
           status,
           last_action,
           operation_id,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(environment, project, component, profile_key) DO UPDATE SET
           repository = excluded.repository,
           git_ref = excluded.git_ref,
           profile = excluded.profile,
           status = excluded.status,
           last_action = excluded.last_action,
           operation_id = excluded.operation_id,
           updated_at = excluded.updated_at`
      )
      .run(
        deploymentId,
        input.environment,
        input.project,
        input.repository,
        input.gitRef,
        input.component,
        input.profile ?? null,
        profileKey,
        status,
        input.action,
        input.operationId,
        input.updatedAt
      );

    const recorded = await this.getDeployment(deploymentId);
    if (!recorded) {
      throw new Error(`Deployment state was not recorded: ${deploymentId}`);
    }
    return recorded;
  }

  close(): void {
    this.db.close();
  }

  private initialize(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      );

      INSERT INTO schema_version(version)
      SELECT 1
      WHERE NOT EXISTS (SELECT 1 FROM schema_version);

      CREATE TABLE IF NOT EXISTS deployments (
        deployment_id TEXT PRIMARY KEY,
        environment TEXT NOT NULL,
        project TEXT NOT NULL,
        repository TEXT NOT NULL,
        git_ref TEXT NOT NULL,
        component TEXT NOT NULL,
        profile TEXT,
        profile_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('preparing', 'deployed', 'removed', 'failed')),
        last_action TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(environment, project, component, profile_key)
      );
    `);
  }
}

function rowToDeployment(row: Record<string, unknown>): DeploymentStateRecord {
  return {
    deploymentId: stringField(row, "deployment_id"),
    environment: stringField(row, "environment"),
    project: stringField(row, "project"),
    repository: stringField(row, "repository"),
    gitRef: stringField(row, "git_ref"),
    component: stringField(row, "component"),
    ...(optionalStringField(row, "profile") ? { profile: optionalStringField(row, "profile") } : {}),
    status: deploymentStatus(row),
    lastAction: stringField(row, "last_action"),
    operationId: stringField(row, "operation_id"),
    updatedAt: stringField(row, "updated_at")
  };
}

function deploymentStatus(row: Record<string, unknown>): DeploymentStateRecord["status"] {
  const status = stringField(row, "status");
  if (status !== "preparing" && status !== "deployed" && status !== "removed" && status !== "failed") {
    throw new Error(`Invalid deployment status in state DB: ${status}`);
  }
  return status;
}

function stringField(row: Record<string, unknown>, field: string): string {
  const value = optionalStringField(row, field);
  if (value === undefined) {
    throw new Error(`Invalid deployment state row field: ${field}`);
  }
  return value;
}

function optionalStringField(row: Record<string, unknown>, field: string): string | undefined {
  const value = row[field];
  return typeof value === "string" ? value : undefined;
}
