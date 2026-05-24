import { access, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { AnsibleRunner } from "../action/ansible-runner.js";
import { loadProjectRegistryConfig } from "../config/project-registry-loader.js";
import { JsonlJournal } from "../journal/jsonl-journal.js";
import { DeployOrchestrator } from "../operation/deploy-orchestrator.js";
import { managedFilesEnvironment, ManagedFilesService } from "../operation/managed-files-service.js";
import { SystemClock } from "../operation/clock.js";
import { UuidGenerator } from "../operation/id-generator.js";
import { ProjectActionService } from "../operation/project-action-service.js";
import { ProjectInspectionService } from "../operation/project-inspection-service.js";
import { ProjectValidationService } from "../operation/project-validation-service.js";
import { DockerCliProbe } from "../validation/docker-cli-probe.js";
import { RequirementValidator } from "../validation/requirement-validator.js";
import { NodeCommandRunner } from "../workspace/node-command-runner.js";
import { WorkspaceManager } from "../workspace/workspace-manager.js";

interface CliOptions {
  baseDir?: string;
  registry?: string;
  workspace?: string;
  journal?: string;
  dataRoot?: string;
  project?: string;
  ref?: string;
  component?: string;
  action?: string;
  profile?: string;
}

interface RuntimePaths {
  registry: string;
  workspace: string;
  journal: string;
  dataRoot: string;
}

const PROJECTS_FILE = "projects.yaml";
const WORKSPACE_DIR = "workspace";
const JOURNAL_DIR = "journal";
const JOURNAL_FILE = "operations.jsonl";
const DATA_DIR = "data";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;
  const options = parseOptions(rest);

  if (!command) {
    throw new Error("Missing command");
  }

  const context = await buildContext(options);

  if (command === "inspect") {
    const result = await context.inspection.inspect(requiredProjectRef(options));
    writeJson(result);
    return;
  }

  if (command === "validate") {
    const inspection = await context.inspection.inspect(requiredProjectRef(options));
    const result = await context.validation.validate({
      projectId: inspection.projectId,
      repository: inspection.repository,
      gitRef: inspection.gitRef,
      registry: inspection.registry,
      environment: options.profile ? { HIVEFORGE_PROFILE: options.profile } : {}
    });
    writeJson(result);
    return;
  }

  if (command === "run-action") {
    const inspection = await context.inspection.inspect(requiredProjectRef(options));
    await context.validation.validate({
      projectId: inspection.projectId,
      repository: inspection.repository,
      gitRef: inspection.gitRef,
      registry: inspection.registry
    });
    const managedFiles = await context.managedFiles.prepare({
      projectId: inspection.projectId,
      workspacePath: inspection.workspacePath,
      registry: inspection.registry
    });
    const result = await context.action.run({
      projectId: inspection.projectId,
      repository: inspection.repository,
      gitRef: inspection.gitRef,
      workspacePath: inspection.workspacePath,
      registry: inspection.registry,
      component: required(options.component, "--component"),
      action: required(options.action, "--action"),
      profile: options.profile,
      environment: managedFilesEnvironment(managedFiles)
    });
    writeJson(result);
    return;
  }

  if (command === "deploy") {
    const result = await context.deploy.deploy({
      ...requiredProjectRef(options),
      component: required(options.component, "--component"),
      action: required(options.action, "--action"),
      profile: options.profile
    });
    writeJson(result);
    return;
  }

  if (command === "read-journal") {
    writeJson(await context.journal.readAll());
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error(`Invalid option near: ${key ?? ""}`);
    }

    switch (key) {
      case "--base-dir":
        options.baseDir = value;
        break;
      case "--registry":
        options.registry = value;
        break;
      case "--workspace":
        options.workspace = value;
        break;
      case "--journal":
        options.journal = value;
        break;
      case "--data-root":
        options.dataRoot = value;
        break;
      case "--project":
        options.project = value;
        break;
      case "--ref":
        options.ref = value;
        break;
      case "--component":
        options.component = value;
        break;
      case "--action":
        options.action = value;
        break;
      case "--profile":
        options.profile = value;
        break;
      default:
        throw new Error(`Unknown option: ${key}`);
    }
  }

  return options;
}

async function buildContext(options: CliOptions) {
  const runtimePaths = await resolveRuntimePaths(options);
  const projectRegistry = await loadProjectRegistryConfig(runtimePaths.registry);
  const workspaceRoot = runtimePaths.workspace;
  const journal = new JsonlJournal(runtimePaths.journal);
  const dataRoot = runtimePaths.dataRoot;
  const ids = new UuidGenerator();
  const clock = new SystemClock();
  const commandRunner = new NodeCommandRunner();
  const workspace = new WorkspaceManager(workspaceRoot, projectRegistry, commandRunner);
  const inspection = new ProjectInspectionService(workspace, journal, ids, clock);
  const validation = new ProjectValidationService(
    new RequirementValidator(new DockerCliProbe(commandRunner)),
    journal,
    ids,
    clock
  );
  const action = new ProjectActionService(new AnsibleRunner(commandRunner), journal, ids, clock);
  const managedFiles = new ManagedFilesService(dataRoot);

  return {
    journal,
    inspection,
    validation,
    action,
    managedFiles,
    deploy: new DeployOrchestrator(inspection, validation, action, managedFiles)
  };
}

async function resolveRuntimePaths(options: CliOptions): Promise<RuntimePaths> {
  const explicitOptions = [
    ["--registry", options.registry],
    ["--workspace", options.workspace],
    ["--journal", options.journal],
    ["--data-root", options.dataRoot]
  ] as const;
  const providedExplicitOptions = explicitOptions.filter(([, value]) => value);

  if (options.baseDir && providedExplicitOptions.length > 0) {
    throw new Error("Use either --base-dir or explicit --registry --workspace --journal --data-root, not both.");
  }

  if (options.baseDir) {
    return initializeBaseDir(options.baseDir);
  }

  const missingOptions = explicitOptions.filter(([, value]) => !value).map(([label]) => label);
  if (missingOptions.length > 0) {
    throw new Error(
      `Missing required runtime option(s): ${missingOptions.join(
        ", "
      )}. Use either --base-dir or all explicit --registry --workspace --journal --data-root.`
    );
  }

  return {
    registry: required(options.registry, "--registry"),
    workspace: required(options.workspace, "--workspace"),
    journal: required(options.journal, "--journal"),
    dataRoot: required(options.dataRoot, "--data-root")
  };
}

async function initializeBaseDir(baseDir: string): Promise<RuntimePaths> {
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
    registry: path.join(baseDir, PROJECTS_FILE),
    workspace: path.join(baseDir, WORKSPACE_DIR),
    journal: path.join(baseDir, JOURNAL_DIR),
    dataRoot: path.join(baseDir, DATA_DIR)
  };

  const entries = await readdir(baseDir);
  if (entries.length === 0) {
    await writeFile(runtimePaths.registry, "projects: []\n", { encoding: "utf8", flag: "wx" });
    await mkdir(runtimePaths.workspace);
    await mkdir(runtimePaths.journal);
    await writeFile(path.join(runtimePaths.journal, JOURNAL_FILE), "", { encoding: "utf8", flag: "wx" });
    await mkdir(runtimePaths.dataRoot);
  }

  return runtimePaths;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function requiredProjectRef(options: CliOptions) {
  return {
    projectId: required(options.project, "--project"),
    gitRef: required(options.ref, "--ref")
  };
}

function required(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing required option: ${label}`);
  }
  return value;
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Command failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
