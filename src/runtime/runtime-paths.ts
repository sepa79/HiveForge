import { constants } from "node:fs";
import { access, mkdir, open, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { CommandRunner } from "../workspace/command-runner.js";
import { createDefaultEnvironmentYaml } from "./default-environment.js";

export interface RuntimePathOptions {
  baseDir?: string;
  registry?: string;
  environments?: string;
  workspace?: string;
  journal?: string;
  dataRoot?: string;
  hostDataRoot?: string;
  requireEnvironments?: boolean;
  defaultEnvironmentDocker?: CommandRunner;
}

export interface RuntimePaths {
  baseDir?: string;
  registry: string;
  environments?: string;
  workspace: string;
  journal: string;
  dataRoot: string;
  hostDataRoot?: string;
  runtimeEnv: string;
}

export const runtimeFileNames = {
  projects: "projects.yaml",
  environments: "environments.yaml",
  authToken: "auth-token",
  operations: "operations.jsonl",
  runtimeEnv: "runtime-env.json"
} as const;

const WORKSPACE_DIR = "workspace";
const JOURNAL_DIR = "journal";
const DATA_DIR = "data";

const EMPTY_PROJECT_REGISTRY = "projects: []\n";
export async function resolveRuntimePaths(options: RuntimePathOptions): Promise<RuntimePaths> {
  const hostDataRoot = normalizeHostDataRoot(options.hostDataRoot);
  const explicitOptions = [
    ["--registry", options.registry],
    ["--environments", options.environments],
    ["--workspace", options.workspace],
    ["--journal", options.journal],
    ["--data-root", options.dataRoot]
  ] as const;
  const providedExplicitOptions = explicitOptions.filter(([, value]) => value);

  if (options.baseDir && providedExplicitOptions.length > 0) {
    throw new Error(
      "Use either --base-dir/HIVEFORGE_BASE_DIR or explicit runtime paths, not both."
    );
  }

  if (options.baseDir) {
    return initializeBaseDir(options.baseDir, hostDataRoot, options.defaultEnvironmentDocker);
  }

  const requiredExplicitOptions = explicitOptions.filter(
    ([label]) => label !== "--environments" || options.requireEnvironments
  );
  const missingOptions = requiredExplicitOptions.filter(([, value]) => !value).map(([label]) => label);
  if (missingOptions.length > 0) {
    throw new Error(
      `Missing required runtime option(s): ${missingOptions.join(
        ", "
      )}. Use either --base-dir/HIVEFORGE_BASE_DIR or all explicit runtime paths.`
    );
  }

  return {
    registry: required(options.registry, "--registry"),
    ...(options.environments ? { environments: options.environments } : {}),
    workspace: required(options.workspace, "--workspace"),
    journal: required(options.journal, "--journal"),
    dataRoot: required(options.dataRoot, "--data-root"),
    ...(hostDataRoot ? { hostDataRoot } : {}),
    runtimeEnv: path.join(required(options.dataRoot, "--data-root"), runtimeFileNames.runtimeEnv)
  };
}

async function initializeBaseDir(
  baseDir: string,
  hostDataRoot?: string,
  defaultEnvironmentDocker?: CommandRunner
): Promise<RuntimePaths> {
  const baseStat = await stat(baseDir).catch((error: unknown) => {
    if (isNodeError(error, "ENOENT")) {
      throw new Error(`Base dir does not exist: ${baseDir}`);
    }
    throw error;
  });
  if (!baseStat.isDirectory()) {
    throw new Error(`Base dir is not a directory: ${baseDir}`);
  }

  await access(baseDir, constants.W_OK).catch((error: unknown) => {
    if (isNodeError(error, "EACCES") || isNodeError(error, "EPERM")) {
      throw new Error(`Base dir is not writable: ${baseDir}`);
    }
    throw error;
  });

  const runtimePaths = {
    baseDir,
    registry: path.join(baseDir, runtimeFileNames.projects),
    environments: path.join(baseDir, runtimeFileNames.environments),
    workspace: path.join(baseDir, WORKSPACE_DIR),
    journal: path.join(baseDir, JOURNAL_DIR),
    dataRoot: path.join(baseDir, DATA_DIR),
    ...(hostDataRoot ? { hostDataRoot } : {}),
    runtimeEnv: path.join(baseDir, DATA_DIR, runtimeFileNames.runtimeEnv)
  };

  await readdir(baseDir);
  await writeFileIfMissing(runtimePaths.registry, EMPTY_PROJECT_REGISTRY);
  await writeFileIfMissing(runtimePaths.environments, () =>
    createDefaultEnvironmentYaml({ docker: defaultEnvironmentDocker })
  );
  await mkdir(runtimePaths.workspace, { recursive: true });
  await mkdir(runtimePaths.journal, { recursive: true });
  await writeFileIfMissing(path.join(runtimePaths.journal, runtimeFileNames.operations), "");
  await mkdir(runtimePaths.dataRoot, { recursive: true });
  await writeFileIfMissing(runtimePaths.runtimeEnv, `${JSON.stringify({ version: 1, entries: [] }, null, 2)}\n`);

  return runtimePaths;
}

function normalizeHostDataRoot(hostDataRoot: string | undefined): string | undefined {
  if (!hostDataRoot) {
    return undefined;
  }
  if (!path.isAbsolute(hostDataRoot)) {
    throw new Error(`Host data root must be an absolute path: ${hostDataRoot}`);
  }
  return path.normalize(hostDataRoot);
}

async function writeFileIfMissing(filePath: string, content: string | (() => Promise<string>)): Promise<void> {
  const handle = await open(filePath, "wx").catch((error: unknown) => {
    if (isNodeError(error, "EEXIST")) {
      return undefined;
    }
    throw error;
  });
  if (!handle) {
    return;
  }
  let wrote = false;
  try {
    await handle.writeFile(typeof content === "string" ? content : await content(), "utf8");
    wrote = true;
  } finally {
    await handle.close();
    if (!wrote) {
      await rm(filePath, { force: true });
    }
  }
}

function required(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing required option: ${label}`);
  }
  return value;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
