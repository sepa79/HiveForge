import { DatabaseSync } from "node:sqlite";
import type { IdGenerator } from "./id-generator.js";
import {
  deploymentProfileKey,
  lifecycleDeploymentStatus,
  type DeploymentLookup,
  type DeploymentExecutorKind,
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

  async markGone(deploymentId: string, updatedAt: string): Promise<DeploymentStateRecord | null> {
    const existing = await this.getDeployment(deploymentId);
    if (!existing) {
      return null;
    }

    this.db
      .prepare(
        `UPDATE deployments
         SET status = ?,
             portainer_endpoint_id = NULL,
             portainer_stack_id = NULL,
             portainer_stack_name = NULL,
             updated_at = ?
         WHERE deployment_id = ?`
      )
      .run("gone", updatedAt, deploymentId);

    return this.getDeployment(deploymentId);
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
    const deploymentName = deploymentNameFor(input, existing);
    const executorKind = executorKindFor(input, existing);
    const portainer = portainerStateFor(input, existing, deploymentName);

    this.db
      .prepare(
        `INSERT INTO deployments (
           deployment_id,
           deployment_name,
           executor_kind,
           environment,
           project,
           repository,
           git_ref,
           component,
           profile,
           profile_key,
           portainer_endpoint_id,
           portainer_stack_id,
           portainer_stack_name,
           status,
           last_action,
           operation_id,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(environment, project, component, profile_key) DO UPDATE SET
           deployment_name = excluded.deployment_name,
           executor_kind = excluded.executor_kind,
           repository = excluded.repository,
           git_ref = excluded.git_ref,
           profile = excluded.profile,
           portainer_endpoint_id = excluded.portainer_endpoint_id,
           portainer_stack_id = excluded.portainer_stack_id,
           portainer_stack_name = excluded.portainer_stack_name,
           status = excluded.status,
           last_action = excluded.last_action,
           operation_id = excluded.operation_id,
           updated_at = excluded.updated_at`
      )
      .run(
        deploymentId,
        deploymentName,
        executorKind,
        input.environment,
        input.project,
        input.repository,
        input.gitRef,
        input.component,
        input.profile ?? null,
        profileKey,
        portainer?.endpointId ?? null,
        portainer?.stackId ?? null,
        portainer?.stackName ?? null,
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
    const hasDeploymentsTable = tableExists(this.db, "deployments");
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER NOT NULL
      );

    `);
    if (!this.db.prepare(`SELECT 1 FROM schema_version LIMIT 1`).get()) {
      this.db.prepare(`INSERT INTO schema_version(version) VALUES (?)`).run(hasDeploymentsTable ? 1 : CURRENT_SCHEMA_VERSION);
    }
    this.db.exec(createDeploymentsTableSql());
    this.ensureDeploymentColumns();
    this.migrateSchemaVersion();
  }

  private ensureDeploymentColumns(): void {
    const columns = this.db.prepare(`PRAGMA table_info(deployments)`).all();
    const columnNames = new Set(
      columns
        .filter((column): column is { name: string } => typeof column === "object" && column !== null && "name" in column)
        .map((column) => column.name)
    );

    if (!columnNames.has("deployment_name")) {
      this.db.exec(`ALTER TABLE deployments ADD COLUMN deployment_name TEXT`);
    }
    if (!columnNames.has("executor_kind")) {
      this.db.exec(`ALTER TABLE deployments ADD COLUMN executor_kind TEXT NOT NULL DEFAULT 'docker-direct'`);
    }
    if (!columnNames.has("portainer_endpoint_id")) {
      this.db.exec(`ALTER TABLE deployments ADD COLUMN portainer_endpoint_id INTEGER`);
    }
    if (!columnNames.has("portainer_stack_id")) {
      this.db.exec(`ALTER TABLE deployments ADD COLUMN portainer_stack_id INTEGER`);
    }
    if (!columnNames.has("portainer_stack_name")) {
      this.db.exec(`ALTER TABLE deployments ADD COLUMN portainer_stack_name TEXT`);
    }
  }

  private migrateSchemaVersion(): void {
    const row = this.db.prepare(`SELECT version FROM schema_version LIMIT 1`).get() as { version?: unknown } | undefined;
    const version = typeof row?.version === "number" ? row.version : 1;
    if (version >= CURRENT_SCHEMA_VERSION) {
      return;
    }

    this.db.exec(`
      ALTER TABLE deployments RENAME TO deployments_v1;
      ${createDeploymentsTableSql()}
      INSERT INTO deployments (
        deployment_id,
        deployment_name,
        executor_kind,
        environment,
        project,
        repository,
        git_ref,
        component,
        profile,
        profile_key,
        portainer_endpoint_id,
        portainer_stack_id,
        portainer_stack_name,
        status,
        last_action,
        operation_id,
        updated_at
      )
      SELECT
        deployment_id,
        deployment_name,
        executor_kind,
        environment,
        project,
        repository,
        git_ref,
        component,
        profile,
        profile_key,
        portainer_endpoint_id,
        portainer_stack_id,
        portainer_stack_name,
        status,
        last_action,
        operation_id,
        updated_at
      FROM deployments_v1;
      DROP TABLE deployments_v1;
      UPDATE schema_version SET version = ${CURRENT_SCHEMA_VERSION};
    `);
  }
}

const CURRENT_SCHEMA_VERSION = 2;

function createDeploymentsTableSql(): string {
  return `
    CREATE TABLE IF NOT EXISTS deployments (
      deployment_id TEXT PRIMARY KEY,
      deployment_name TEXT,
      executor_kind TEXT NOT NULL DEFAULT 'docker-direct',
      environment TEXT NOT NULL,
      project TEXT NOT NULL,
      repository TEXT NOT NULL,
      git_ref TEXT NOT NULL,
      component TEXT NOT NULL,
      profile TEXT,
      profile_key TEXT NOT NULL,
      portainer_endpoint_id INTEGER,
      portainer_stack_id INTEGER,
      portainer_stack_name TEXT,
      status TEXT NOT NULL CHECK(status IN ('preparing', 'deployed', 'removed', 'gone', 'failed')),
      last_action TEXT NOT NULL,
      operation_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(environment, project, component, profile_key)
    );
  `;
}

function tableExists(db: DatabaseSync, name: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`).get(name));
}

function rowToDeployment(row: Record<string, unknown>): DeploymentStateRecord {
  return {
    deploymentId: stringField(row, "deployment_id"),
    deploymentName: optionalStringField(row, "deployment_name") ?? stringField(row, "project"),
    executorKind: executorKindRowField(row),
    environment: stringField(row, "environment"),
    project: stringField(row, "project"),
    repository: stringField(row, "repository"),
    gitRef: stringField(row, "git_ref"),
    component: stringField(row, "component"),
    ...(optionalStringField(row, "profile") ? { profile: optionalStringField(row, "profile") } : {}),
    ...(portainerRowState(row) ? { portainer: portainerRowState(row) } : {}),
    status: deploymentStatus(row),
    lastAction: stringField(row, "last_action"),
    operationId: stringField(row, "operation_id"),
    updatedAt: stringField(row, "updated_at")
  };
}

function deploymentNameFor(
  input: RecordLifecycleDeploymentInput | EnsureDeploymentInput | RecordDeploymentFailureInput,
  existing: DeploymentStateRecord | null
): string {
  const requested = input.deploymentName ?? existing?.deploymentName ?? input.project;
  assertDeploymentName(requested);
  if (
    existing?.deploymentName &&
    existing.status !== "gone" &&
    input.deploymentName &&
    input.deploymentName !== existing.deploymentName
  ) {
    throw new Error(
      `Deployment name for existing slot ${input.project}/${input.component} is ${existing.deploymentName}; ` +
        `refusing to change it to ${input.deploymentName}.`
    );
  }
  return requested;
}

function executorKindFor(
  input: RecordLifecycleDeploymentInput | EnsureDeploymentInput | RecordDeploymentFailureInput,
  existing: DeploymentStateRecord | null
): DeploymentExecutorKind {
  if (existing && existing.status !== "gone" && existing.executorKind !== input.executorKind) {
    throw new Error(
      `Deployment executor for existing slot ${input.project}/${input.component} is ${existing.executorKind}; ` +
        `refusing to change it to ${input.executorKind}.`
    );
  }
  if (existing?.status === "gone") {
    return input.executorKind;
  }
  return existing?.executorKind ?? input.executorKind;
}

function portainerStateFor(
  input: RecordLifecycleDeploymentInput | EnsureDeploymentInput | RecordDeploymentFailureInput,
  existing: DeploymentStateRecord | null,
  deploymentName: string
): DeploymentStateRecord["portainer"] {
  if (input.executorKind !== "portainer-stack") {
    return undefined;
  }

  const endpointId = input.portainer?.endpointId ?? existing?.portainer?.endpointId;
  if (endpointId === undefined) {
    throw new Error(`Portainer deployment metadata is incomplete for ${input.project}/${input.component}: missing endpointId.`);
  }
  if (
    existing?.portainer?.endpointId !== undefined &&
    existing.status !== "gone" &&
    endpointId !== existing.portainer.endpointId
  ) {
    throw new Error(
      `Portainer endpoint for existing slot ${input.project}/${input.component} is ${existing.portainer.endpointId}; ` +
        `refusing to change it to ${endpointId}.`
    );
  }

  const stackId = input.portainer?.stackId ?? existing?.portainer?.stackId;
  const stackName = input.portainer?.stackName ?? existing?.portainer?.stackName ?? deploymentName;
  return {
    endpointId,
    ...(stackId !== undefined ? { stackId } : {}),
    ...(stackName ? { stackName } : {})
  };
}

function assertDeploymentName(value: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new Error(`Deployment name is not safe for Docker project/stack names: ${value}`);
  }
}

function deploymentStatus(row: Record<string, unknown>): DeploymentStateRecord["status"] {
  const status = stringField(row, "status");
  if (status !== "preparing" && status !== "deployed" && status !== "removed" && status !== "gone" && status !== "failed") {
    throw new Error(`Invalid deployment status in state DB: ${status}`);
  }
  return status;
}

function executorKindRowField(row: Record<string, unknown>): DeploymentExecutorKind {
  const value = optionalStringField(row, "executor_kind") ?? "docker-direct";
  if (value !== "docker-direct" && value !== "portainer-stack") {
    throw new Error(`Invalid deployment executor kind in state DB: ${value}`);
  }
  return value;
}

function portainerRowState(row: Record<string, unknown>): DeploymentStateRecord["portainer"] | undefined {
  const endpointId = optionalNumberField(row, "portainer_endpoint_id");
  if (endpointId === undefined) {
    return undefined;
  }

  const stackId = optionalNumberField(row, "portainer_stack_id");
  const stackName = optionalStringField(row, "portainer_stack_name");
  return {
    endpointId,
    ...(stackId !== undefined ? { stackId } : {}),
    ...(stackName ? { stackName } : {})
  };
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

function optionalNumberField(row: Record<string, unknown>, field: string): number | undefined {
  const value = row[field];
  return typeof value === "number" ? value : undefined;
}
