import { readFileSync } from "node:fs";
import path from "node:path";

export interface HiveForgeInfo {
  name: string;
  version: string;
}

export function getHiveForgeInfo(): HiveForgeInfo {
  const packageJson = readPackageJson();
  return {
    name: requiredString(packageJson.name, "package.json name"),
    version: requiredString(packageJson.version, "package.json version")
  };
}

function readPackageJson(): Record<string, unknown> {
  const candidates = [
    new URL("../package.json", import.meta.url),
    new URL("../../package.json", import.meta.url),
    path.join(process.cwd(), "package.json")
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate, "utf8")) as Record<string, unknown>;
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
  }

  throw new Error("Unable to locate package.json for HiveForge version metadata");
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required ${label}`);
  }
  return value;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
