import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

export interface KnownHiveForgeTarget {
  id: string;
  name: string;
  baseUrl: string;
  authTokenEnv: string;
}

export interface KnownHiveForgesConfig {
  knownHiveForges: KnownHiveForgeTarget[];
}

export interface ResolvedHiveForgeTarget {
  target: KnownHiveForgeTarget;
  authToken: string;
}

const TARGET_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export function defaultKnownHiveForgesPath(cwd = process.cwd()): string {
  return path.join(cwd, "known-hiveforges.local.yaml");
}

export function defaultActiveTargetPath(cwd = process.cwd()): string {
  return path.join(cwd, ".hiveforge-target");
}

export async function loadKnownHiveForges(configPath = defaultKnownHiveForgesPath()): Promise<KnownHiveForgesConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = parse(raw);
  return validateKnownHiveForgesConfig(parsed, configPath);
}

export async function readActiveTargetId(statePath = defaultActiveTargetPath()): Promise<string> {
  const raw = await readFile(statePath, "utf8");
  const targetId = raw.trim();
  if (!targetId) {
    throw new Error(`Active HiveForge target file is empty: ${statePath}`);
  }
  return targetId;
}

export async function writeActiveTargetId(targetId: string, statePath = defaultActiveTargetPath()): Promise<void> {
  if (!TARGET_ID_PATTERN.test(targetId)) {
    throw new Error(`Invalid HiveForge target id: ${targetId}`);
  }
  await writeFile(statePath, `${targetId}\n`, { mode: 0o600 });
}

export function findKnownHiveForgeTarget(config: KnownHiveForgesConfig, targetId: string): KnownHiveForgeTarget {
  const target = config.knownHiveForges.find((candidate) => candidate.id === targetId);
  if (!target) {
    throw new Error(`Unknown HiveForge target: ${targetId}`);
  }
  return target;
}

export async function resolveActiveHiveForgeTarget(options: {
  configPath?: string;
  statePath?: string;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<ResolvedHiveForgeTarget> {
  const config = await loadKnownHiveForges(options.configPath);
  const targetId = await readActiveTargetId(options.statePath);
  const target = findKnownHiveForgeTarget(config, targetId);
  const authToken = options.env?.[target.authTokenEnv] ?? process.env[target.authTokenEnv];
  if (!authToken) {
    throw new Error(`Missing auth token environment variable for HiveForge target ${target.id}: ${target.authTokenEnv}`);
  }
  return { target, authToken };
}

function validateKnownHiveForgesConfig(value: unknown, configPath: string): KnownHiveForgesConfig {
  if (!isRecord(value) || !Array.isArray(value.knownHiveForges)) {
    throw new Error(`Invalid known HiveForges config: ${configPath}`);
  }

  const seen = new Set<string>();
  const knownHiveForges = value.knownHiveForges.map((target, index) => validateTarget(target, index, seen));
  if (knownHiveForges.length === 0) {
    throw new Error(`Known HiveForges config must declare at least one target: ${configPath}`);
  }

  return { knownHiveForges };
}

function validateTarget(value: unknown, index: number, seen: Set<string>): KnownHiveForgeTarget {
  if (!isRecord(value)) {
    throw new Error(`Invalid HiveForge target at index ${index}`);
  }

  const id = requiredString(value.id, `knownHiveForges[${index}].id`);
  const name = requiredString(value.name, `knownHiveForges[${index}].name`);
  const baseUrl = requiredString(value.baseUrl, `knownHiveForges[${index}].baseUrl`);
  const authTokenEnv = requiredString(value.authTokenEnv, `knownHiveForges[${index}].authTokenEnv`);

  if (!TARGET_ID_PATTERN.test(id)) {
    throw new Error(`Invalid HiveForge target id: ${id}`);
  }
  if (seen.has(id)) {
    throw new Error(`Duplicate HiveForge target id: ${id}`);
  }
  seen.add(id);

  try {
    new URL(baseUrl);
  } catch {
    throw new Error(`Invalid HiveForge baseUrl for target ${id}: ${baseUrl}`);
  }

  if (!ENV_NAME_PATTERN.test(authTokenEnv)) {
    throw new Error(`Invalid authTokenEnv for target ${id}: ${authTokenEnv}`);
  }

  return { id, name, baseUrl, authTokenEnv };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required field: ${label}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
