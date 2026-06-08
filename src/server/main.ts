import { AnsibleRunner } from "../action/ansible-runner.js";
import { getHiveForgeInfo } from "../app-info.js";
import { EnvironmentPolicyService } from "../config/environment-policy.js";
import { EnvironmentPolicyEditor } from "../config/environment-policy-editor.js";
import { loadEnvironmentConfig } from "../config/environment-loader.js";
import { loadProjectRegistryConfig } from "../config/project-registry-loader.js";
import { RuntimeEnvStore } from "../config/runtime-env-store.js";
import { JsonlJournal } from "../journal/jsonl-journal.js";
import { SystemClock } from "../operation/clock.js";
import { DeployOrchestrator } from "../operation/deploy-orchestrator.js";
import { DeploymentInventoryService } from "../operation/deployment-inventory-service.js";
import { ManagedFilesService } from "../operation/managed-files-service.js";
import { OperationLogService } from "../operation/operation-log-service.js";
import { UuidGenerator } from "../operation/id-generator.js";
import { ProjectActionService } from "../operation/project-action-service.js";
import { ProjectInspectionService } from "../operation/project-inspection-service.js";
import { ProjectRegistrationService } from "../operation/project-registration-service.js";
import { RepositoryInspectionService } from "../operation/repository-inspection-service.js";
import { ProjectValidationService } from "../operation/project-validation-service.js";
import { ReleaseDeployService } from "../release/release-deploy-service.js";
import { resolveAuthToken } from "../runtime/auth-token.js";
import { resolveRuntimePaths } from "../runtime/runtime-paths.js";
import { DockerCliProbe } from "../validation/docker-cli-probe.js";
import { RequirementValidator } from "../validation/requirement-validator.js";
import { NodeCommandRunner } from "../workspace/node-command-runner.js";
import { WorkspaceManager } from "../workspace/workspace-manager.js";
import { createHttpServer } from "./http-server.js";
import { createRestRoutes } from "./rest-api.js";
import { createUiRoutes, uiPublicPaths } from "./ui-routes.js";

interface ServerOptions {
  baseDir?: string;
  registry?: string;
  environments?: string;
  workspace?: string;
  journal?: string;
  dataRoot?: string;
  hostDataRoot?: string;
}

const serverOptions = parseServerOptions(process.argv.slice(2));
const commandRunner = new NodeCommandRunner();
const runtimePaths = await resolveRuntimePaths({
  baseDir: serverOptions.baseDir ?? process.env.HIVEFORGE_BASE_DIR,
  registry: serverOptions.registry ?? process.env.HIVEFORGE_PROJECT_REGISTRY_PATH,
  environments: serverOptions.environments ?? process.env.HIVEFORGE_ENVIRONMENTS_PATH,
  workspace: serverOptions.workspace ?? process.env.HIVEFORGE_WORKSPACE_DIR,
  journal: serverOptions.journal ?? process.env.HIVEFORGE_JOURNAL_DIR,
  dataRoot: serverOptions.dataRoot ?? process.env.HIVEFORGE_DATA_ROOT,
  hostDataRoot: serverOptions.hostDataRoot ?? process.env.HIVEFORGE_HOST_DATA_ROOT,
  requireEnvironments: true,
  defaultEnvironmentDocker: commandRunner
});
const auth = await resolveAuthToken({
  authToken: process.env.HIVEFORGE_AUTH_TOKEN,
  baseDir: runtimePaths.baseDir
});
process.stdout.write(`HiveForge auth token source: ${auth.source}\n`);
if (auth.source === "environment" && auth.ignoredTokenPath) {
  process.stdout.write(
    `Warning: HiveForge auth token file ignored because HIVEFORGE_AUTH_TOKEN is set: ${auth.ignoredTokenPath}\n`
  );
}
if (auth.source === "generated" && auth.tokenPath) {
  process.stdout.write(`HiveForge auth token created at ${auth.tokenPath}\n`);
}

const appInfo = getHiveForgeInfo();
const projectRegistryPath = runtimePaths.registry;
const environmentsPath = required(runtimePaths.environments, "--environments");
const workspaceRoot = runtimePaths.workspace;
const journalDir = runtimePaths.journal;
const dataRoot = runtimePaths.dataRoot;
const hostDataRoot = runtimePaths.hostDataRoot;
const runtimeEnvPath = runtimePaths.runtimeEnv;
const port = Number.parseInt(process.env.HIVEFORGE_PORT ?? "3000", 10);
const host = process.env.HIVEFORGE_BIND_HOST ?? "127.0.0.1";

const projectRegistry = await loadProjectRegistryConfig(projectRegistryPath);
const environmentConfig = await loadEnvironmentConfig(environmentsPath);
const journal = new JsonlJournal(journalDir);
const runtimeEnv = new RuntimeEnvStore(runtimeEnvPath);
const ids = new UuidGenerator();
const clock = new SystemClock();
const workspace = new WorkspaceManager(workspaceRoot, projectRegistry, commandRunner);
const inspection = new ProjectInspectionService(workspace, journal, ids, clock);
const validation = new ProjectValidationService(
  new RequirementValidator(new DockerCliProbe(commandRunner)),
  journal,
  ids,
  clock
);
const action = new ProjectActionService(new AnsibleRunner(commandRunner), journal, ids, clock);
const managedFiles = new ManagedFilesService(dataRoot, hostDataRoot);
const repositoryInspection = new RepositoryInspectionService(workspaceRoot, commandRunner);
const projectRegistration = new ProjectRegistrationService(projectRegistryPath, projectRegistry, repositoryInspection);
const currentEnvironment = environmentConfig.environments.find((environment) => environment.id === environmentConfig.current);
if (!currentEnvironment) {
  throw new Error(`Current environment is not defined: ${environmentConfig.current}`);
}
const deploy = new DeployOrchestrator(inspection, validation, action, managedFiles, currentEnvironment, runtimeEnv);
const environmentPolicy = new EnvironmentPolicyService(currentEnvironment);
const environmentPolicyEditor = new EnvironmentPolicyEditor(environmentsPath, environmentConfig);
const releaseDeploy = new ReleaseDeployService({
  environment: currentEnvironment,
  environmentPolicy,
  inspection,
  managedFiles
});
const deploymentInventory = new DeploymentInventoryService(journal, currentEnvironment.id);
const operations = new OperationLogService(deploy, ids, clock);

createHttpServer(
  [
    ...createUiRoutes(appInfo),
    ...createRestRoutes({
      appInfo,
      projectRegistry,
      journal,
      inspection,
      validation,
      deploy,
      releaseDeploy,
      currentEnvironmentId: currentEnvironment.id,
      currentEnvironment,
      environmentPolicy,
      deploymentInventory,
      operations,
      runtimeEnv,
      repositoryInspection,
      projectRegistration,
      environmentPolicyEditor,
      environments: {
        current: currentEnvironment,
        known: environmentConfig.environments
      }
    })
  ],
  { authToken: auth.authToken, publicPaths: [...uiPublicPaths, /^\/health$/] }
).listen(port, host, () => {
  process.stdout.write(`HiveForge REST API listening on ${host}:${port}\n`);
});

function parseServerOptions(args: string[]): ServerOptions {
  const options: ServerOptions = {};

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
      case "--environments":
        options.environments = value;
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
      case "--host-data-root":
        options.hostDataRoot = value;
        break;
      default:
        throw new Error(`Unknown option: ${key}`);
    }
  }

  return options;
}

function required(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing required option: ${label}`);
  }
  return value;
}
