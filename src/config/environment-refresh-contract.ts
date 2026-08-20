import type { EnvironmentDefinition } from "./environment-types.js";

const REFRESH_RUNTIME_FIELD_PATHS = [
  ["kind"],
  ["nodes"],
  ["capabilities", "runtime"],
  ["capabilities", "placement"]
] as const;

export function applyDetectedEnvironmentRuntime(
  current: EnvironmentDefinition,
  detected: EnvironmentDefinition
): EnvironmentDefinition {
  const refreshed = structuredClone(current);
  for (const path of REFRESH_RUNTIME_FIELD_PATHS) {
    syncPath(refreshed, detected, path);
  }
  return refreshed;
}

function syncPath(target: EnvironmentDefinition, source: EnvironmentDefinition, path: readonly [string, ...string[]]): void {
  const targetParent = parentFor(target, path);
  const sourceParent = parentFor(source, path);
  const key = path[path.length - 1];

  if (hasOwn(sourceParent, key)) {
    targetParent[key] = structuredClone(sourceParent[key]);
    return;
  }

  delete targetParent[key];
}

function parentFor(root: unknown, path: readonly [string, ...string[]]): Record<string, unknown> {
  let current = root;
  for (const segment of path.slice(0, -1)) {
    if (!isRecord(current) || !hasOwn(current, segment) || !isRecord(current[segment])) {
      throw new Error(`Environment refresh contract path is invalid: ${path.join(".")}`);
    }
    current = current[segment];
  }

  if (!isRecord(current)) {
    throw new Error(`Environment refresh contract path is invalid: ${path.join(".")}`);
  }
  return current;
}

function hasOwn(target: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
