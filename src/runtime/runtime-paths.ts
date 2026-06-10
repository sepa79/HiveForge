import { constants } from "node:fs";
import { access, mkdir, open, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { CommandRunner } from "../workspace/command-runner.js";
import { createDefaultEnvironmentYaml } from "./default-environment.js";

export interface RuntimePathOptions {
  runtimeRoot?: string;
  registry?: string;
  environments?: string;
  workspace?: string;
  journal?: string;
  dataRoot?: string;
  requireEnvironments?: boolean;
  defaultEnvironmentDocker?: CommandRunner;
}

export interface RuntimePaths {
  runtimeRoot?: string;
  registry: string;
  environments?: string;
  workspace: string;
  journal: string;
  dataRoot: string;
  runtimeEnv: string;
}

export const runtimeFileNames = {
  projects: "projects.yaml",
  environments: "environments.yaml",
  authToken: "auth-token",
  operations: "operations.jsonl",
  runtimeEnv: "runtime-env.json"
} as const;

export const HIVEFORGE_CONTAINER_RUNTIME_ROOT = "/hf";

const WORKSPACE_DIR = "workspace";
const JOURNAL_DIR = "journal";
const DATA_DIR = "data";

const EMPTY_PROJECT_REGISTRY = "projects: []\n";
export async function resolveRuntimePaths(options: RuntimePathOptions): Promise<RuntimePaths> {
  const explicitOptions = [
    ["--registry", options.registry],
    ["--environments", options.environments],
    ["--workspace", options.workspace],
    ["--journal", options.journal],
    ["--data-root", options.dataRoot]
  ] as const;
  const providedExplicitOptions = explicitOptions.filter(([, value]) => value);

  if (options.runtimeRoot && providedExplicitOptions.length > 0) {
    throw new Error("Use either --runtime-root or explicit runtime paths, not both.");
  }

  if (options.runtimeRoot) {
    return initializeRuntimeRoot(options.runtimeRoot, options.defaultEnvironmentDocker);
  }

  const requiredExplicitOptions = explicitOptions.filter(
    ([label]) => label !== "--environments" || options.requireEnvironments
  );
  const missingOptions = requiredExplicitOptions.filter(([, value]) => !value).map(([label]) => label);
  if (missingOptions.length > 0) {
    throw new Error(
      `Missing required runtime option(s): ${missingOptions.join(
        ", "
      )}. Use either --runtime-root or all explicit runtime paths.`
    );
  }

  return {
    registry: required(options.registry, "--registry"),
    ...(options.environments ? { environments: options.environments } : {}),
    workspace: required(options.workspace, "--workspace"),
    journal: required(options.journal, "--journal"),
    dataRoot: required(options.dataRoot, "--data-root"),
    runtimeEnv: path.join(required(options.dataRoot, "--data-root"), runtimeFileNames.runtimeEnv)
  };
}

async function initializeRuntimeRoot(
  runtimeRoot: string,
  defaultEnvironmentDocker?: CommandRunner
): Promise<RuntimePaths> {
  const rootStat = await stat(runtimeRoot).catch((error: unknown) => {
    if (isNodeError(error, "ENOENT")) {
      throw new Error(`Runtime root does not exist: ${runtimeRoot}`);
    }
    throw error;
  });
  if (!rootStat.isDirectory()) {
    throw new Error(`Runtime root is not a directory: ${runtimeRoot}`);
  }

  await access(runtimeRoot, constants.W_OK).catch((error: unknown) => {
    if (isNodeError(error, "EACCES") || isNodeError(error, "EPERM")) {
      throw new Error(`Runtime root is not writable: ${runtimeRoot}`);
    }
    throw error;
  });

  const runtimePaths = {
    runtimeRoot,
    registry: path.join(runtimeRoot, runtimeFileNames.projects),
    environments: path.join(runtimeRoot, runtimeFileNames.environments),
    workspace: path.join(runtimeRoot, WORKSPACE_DIR),
    journal: path.join(runtimeRoot, JOURNAL_DIR),
    dataRoot: path.join(runtimeRoot, DATA_DIR),
    runtimeEnv: path.join(runtimeRoot, DATA_DIR, runtimeFileNames.runtimeEnv)
  };

  await readdir(runtimeRoot);
  await writeFileIfMissing(runtimePaths.registry, EMPTY_PROJECT_REGISTRY);
  await writeFileIfMissing(runtimePaths.environments, () =>
    createDefaultEnvironmentYaml({
      docker: defaultEnvironmentDocker
    })
  );
  await mkdir(runtimePaths.workspace, { recursive: true });
  await mkdir(runtimePaths.journal, { recursive: true });
  await writeFileIfMissing(path.join(runtimePaths.journal, runtimeFileNames.operations), "");
  await mkdir(runtimePaths.dataRoot, { recursive: true });
  await writeFileIfMissing(runtimePaths.runtimeEnv, `${JSON.stringify({ version: 1, entries: [] }, null, 2)}\n`);

  return runtimePaths;
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
