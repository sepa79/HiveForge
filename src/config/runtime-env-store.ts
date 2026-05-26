import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { schemaPaths, validateContract } from "../contracts/schema-loader.js";

export interface RuntimeEnvScope {
  projectId: string;
  profile?: string;
}

export interface RuntimeEnvEntry extends RuntimeEnvScope {
  values: Record<string, string>;
}

export interface RuntimeEnvConfig {
  version: 1;
  entries: RuntimeEnvEntry[];
}

export interface ProjectRuntimeEnv {
  projectId: string;
  entries: RuntimeEnvEntry[];
}

export interface RuntimeEnvSetRequest extends RuntimeEnvScope {
  values: Record<string, string>;
}

export interface RuntimeEnvUnsetRequest extends RuntimeEnvScope {
  keys: string[];
}

export interface RuntimeEnvMutationResult extends RuntimeEnvEntry {
  updatedKeys?: string[];
  removedKeys?: string[];
}

const EMPTY_RUNTIME_ENV: RuntimeEnvConfig = { version: 1, entries: [] };
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9-]*$/;
const ENV_NAME_PATTERN = /^(?!HIVEFORGE_)[A-Z][A-Z0-9_]*$/;

export class RuntimeEnvStore {
  constructor(private readonly filePath: string) {}

  async listProject(projectId: string): Promise<ProjectRuntimeEnv> {
    assertIdentifier(projectId, "projectId");
    const config = await this.load();
    return {
      projectId,
      entries: config.entries.filter((entry) => entry.projectId === projectId)
    };
  }

  async set(request: RuntimeEnvSetRequest): Promise<RuntimeEnvMutationResult> {
    assertScope(request);
    assertValues(request.values);

    const config = await this.load();
    const existing = findEntry(config.entries, request);
    const values = sortRecord({
      ...(existing?.values ?? {}),
      ...request.values
    });
    const entry: RuntimeEnvEntry = scopedEntry(request, values);
    const updated = replaceEntry(config.entries, entry);
    await this.save({ version: 1, entries: sortEntries(updated) });

    return {
      ...entry,
      updatedKeys: Object.keys(sortRecord(request.values))
    };
  }

  async unset(request: RuntimeEnvUnsetRequest): Promise<RuntimeEnvMutationResult> {
    assertScope(request);
    assertKeys(request.keys);

    const config = await this.load();
    const existing = findEntry(config.entries, request);
    const remainingValues = { ...(existing?.values ?? {}) };
    for (const key of request.keys) {
      delete remainingValues[key];
    }

    const entry = scopedEntry(request, sortRecord(remainingValues));
    const entries = Object.keys(entry.values).length === 0
      ? removeEntry(config.entries, request)
      : replaceEntry(config.entries, entry);
    await this.save({ version: 1, entries: sortEntries(entries) });

    return {
      ...entry,
      removedKeys: [...new Set(request.keys)].sort()
    };
  }

  async resolve(scope: RuntimeEnvScope): Promise<NodeJS.ProcessEnv> {
    assertScope(scope);
    const config = await this.load();
    const projectEntry = findEntry(config.entries, { projectId: scope.projectId });
    const profileEntry = scope.profile ? findEntry(config.entries, scope) : undefined;

    return {
      ...(projectEntry?.values ?? {}),
      ...(profileEntry?.values ?? {})
    };
  }

  private async load(): Promise<RuntimeEnvConfig> {
    await this.ensureFile();
    const raw = await readFile(this.filePath, "utf8");
    const config = JSON.parse(raw) as RuntimeEnvConfig;
    await validateContract(schemaPaths.runtimeEnv, config);
    assertUniqueScopes(config);
    return config;
  }

  private async save(config: RuntimeEnvConfig): Promise<void> {
    await validateContract(schemaPaths.runtimeEnv, config);
    assertUniqueScopes(config);
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  private async ensureFile(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(EMPTY_RUNTIME_ENV, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    }).catch((error: unknown) => {
      if (isNodeError(error, "EEXIST")) {
        return;
      }
      throw error;
    });
  }
}

function assertScope(scope: RuntimeEnvScope): void {
  assertIdentifier(scope.projectId, "projectId");
  if (scope.profile !== undefined) {
    assertIdentifier(scope.profile, "profile");
  }
}

function assertIdentifier(value: string, name: string): void {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
}

function assertValues(values: Record<string, string>): void {
  const entries = Object.entries(values);
  if (entries.length === 0) {
    throw new Error("Runtime env values must not be empty");
  }
  for (const [key, value] of entries) {
    assertEnvName(key);
    if (typeof value !== "string") {
      throw new Error(`Runtime env value must be a string: ${key}`);
    }
  }
}

function assertKeys(keys: string[]): void {
  if (keys.length === 0) {
    throw new Error("Runtime env keys must not be empty");
  }
  for (const key of keys) {
    assertEnvName(key);
  }
}

function assertEnvName(key: string): void {
  if (!ENV_NAME_PATTERN.test(key)) {
    throw new Error(`Invalid runtime env key: ${key}`);
  }
}

function assertUniqueScopes(config: RuntimeEnvConfig): void {
  const seen = new Set<string>();
  for (const entry of config.entries) {
    const key = scopeKey(entry);
    if (seen.has(key)) {
      throw new Error(`Duplicate runtime env scope: ${key}`);
    }
    seen.add(key);
  }
}

function findEntry(entries: RuntimeEnvEntry[], scope: RuntimeEnvScope): RuntimeEnvEntry | undefined {
  return entries.find((entry) => entry.projectId === scope.projectId && entry.profile === scope.profile);
}

function replaceEntry(entries: RuntimeEnvEntry[], next: RuntimeEnvEntry): RuntimeEnvEntry[] {
  const filtered = removeEntry(entries, next);
  return [...filtered, next];
}

function removeEntry(entries: RuntimeEnvEntry[], scope: RuntimeEnvScope): RuntimeEnvEntry[] {
  return entries.filter((entry) => !(entry.projectId === scope.projectId && entry.profile === scope.profile));
}

function scopedEntry(scope: RuntimeEnvScope, values: Record<string, string>): RuntimeEnvEntry {
  return {
    projectId: scope.projectId,
    ...(scope.profile ? { profile: scope.profile } : {}),
    values
  };
}

function sortEntries(entries: RuntimeEnvEntry[]): RuntimeEnvEntry[] {
  return [...entries].sort((left, right) => scopeKey(left).localeCompare(scopeKey(right)));
}

function scopeKey(scope: RuntimeEnvScope): string {
  return `${scope.projectId}/${scope.profile ?? ""}`;
}

function sortRecord(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
