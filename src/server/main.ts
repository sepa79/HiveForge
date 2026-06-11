import { AnsibleRunner } from "../action/ansible-runner.js";
import { getHiveForgeInfo } from "../app-info.js";
import { EnvironmentPolicyService } from "../config/environment-policy.js";
import { EnvironmentPolicyEditor } from "../config/environment-policy-editor.js";
import { loadEnvironmentConfig } from "../config/environment-loader.js";
import { EnvironmentRefreshService } from "../config/environment-refresh-service.js";
import { loadProjectRegistryConfig } from "../config/project-registry-loader.js";
import { RuntimeEnvStore } from "../config/runtime-env-store.js";
import { JsonlJournal } from "../journal/jsonl-journal.js";
import { SystemClock } from "../operation/clock.js";
import { DeployOrchestrator } from "../operation/deploy-orchestrator.js";
import { DeploymentComposeService } from "../operation/deployment-compose-service.js";
import { DeploymentDiagnosticsService } from "../operation/deployment-diagnostics-service.js";
import { DeployPrerequisitesService } from "../operation/deploy-prerequisites-service.js";
import { DeploymentInventoryService } from "../operation/deployment-inventory-service.js";
import { DeploymentRuntimeStatusService } from "../operation/deployment-runtime-status-service.js";
import { DockerDeploymentService } from "../operation/docker-deployment-service.js";
import { ManagedFilesService } from "../operation/managed-files-service.js";
import { OperationLogService } from "../operation/operation-log-service.js";
import { UuidGenerator } from "../operation/id-generator.js";
import { ProjectActionService } from "../operation/project-action-service.js";
import { ProjectInspectionService } from "../operation/project-inspection-service.js";
import { ProjectRegistrationService } from "../operation/project-registration-service.js";
import { RepositoryInspectionService } from "../operation/repository-inspection-service.js";
import { ProjectValidationService } from "../operation/project-validation-service.js";
import { SqliteDeploymentStateStore } from "../operation/sqlite-deployment-state-store.js";
import { ReleaseDeployService } from "../release/release-deploy-service.js";
import { resolveAuthToken } from "../runtime/auth-token.js";
import { RuntimeDiagnosticsService } from "../runtime/runtime-diagnostics-service.js";
import { HIVEFORGE_CONTAINER_RUNTIME_ROOT, resolveRuntimePaths } from "../runtime/runtime-paths.js";
import { SelfUpdateService } from "../runtime/self-update-service.js";
import { DockerCliProbe } from "../validation/docker-cli-probe.js";
import { RequirementValidator } from "../validation/requirement-validator.js";
import { NodeCommandRunner } from "../workspace/node-command-runner.js";
import { WorkspaceManager } from "../workspace/workspace-manager.js";
import { createHttpServer } from "./http-server.js";
import { createRestRoutes } from "./rest-api.js";
import { createUiRoutes, uiPublicPaths } from "./ui-routes.js";

interface ServerOptions {
  registry?: string;
  environments?: string;
  workspace?: string;
  journal?: string;
  dataRoot?: string;
}

const serverOptions = parseServerOptions(process.argv.slice(2));
const commandRunner = new NodeCommandRunner();
const explicitRuntimePaths = {
  registry: serverOptions.registry ?? process.env.HIVEFORGE_PROJECT_REGISTRY_PATH,
  environments: serverOptions.environments ?? process.env.HIVEFORGE_ENVIRONMENTS_PATH,
  workspace: serverOptions.workspace ?? process.env.HIVEFORGE_WORKSPACE_DIR,
  journal: serverOptions.journal ?? process.env.HIVEFORGE_JOURNAL_DIR,
  dataRoot: serverOptions.dataRoot ?? process.env.HIVEFORGE_DATA_ROOT
};
const usesExplicitRuntimePaths = Object.values(explicitRuntimePaths).some((value) => value !== undefined);
const runtimePaths = await resolveRuntimePaths({
  runtimeRoot: usesExplicitRuntimePaths ? undefined : HIVEFORGE_CONTAINER_RUNTIME_ROOT,
  ...explicitRuntimePaths,
  requireEnvironments: true,
  defaultEnvironmentDocker: commandRunner,
  defaultEnvironment: {
    name: nonEmptyEnv("HIVEFORGE_ENVIRONMENT_NAME"),
    description: nonEmptyEnv("HIVEFORGE_ENVIRONMENT_DESCRIPTION")
  }
});
const auth = await resolveAuthToken({
  authToken: process.env.HIVEFORGE_AUTH_TOKEN,
  runtimeRoot: runtimePaths.runtimeRoot
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
const runtimeEnvPath = runtimePaths.runtimeEnv;
const stateDbPath = runtimePaths.stateDb;
const port = Number.parseInt(process.env.HIVEFORGE_PORT ?? "3000", 10);
const host = process.env.HIVEFORGE_BIND_HOST ?? "127.0.0.1";

const projectRegistry = await loadProjectRegistryConfig(projectRegistryPath);
const environmentConfig = await loadEnvironmentConfig(environmentsPath);
const journal = new JsonlJournal(journalDir);
const runtimeEnv = new RuntimeEnvStore(runtimeEnvPath);
const ids = new UuidGenerator();
const deploymentState = new SqliteDeploymentStateStore(stateDbPath, ids);
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
const repositoryInspection = new RepositoryInspectionService(workspaceRoot, commandRunner);
const projectRegistration = new ProjectRegistrationService(projectRegistryPath, projectRegistry, repositoryInspection);
const currentEnvironment = environmentConfig.environments.find((environment) => environment.id === environmentConfig.current);
if (!currentEnvironment) {
  throw new Error(`Current environment is not defined: ${environmentConfig.current}`);
}
const managedRootBindSourceRoot = currentEnvironment.capabilities.managedRoot.bindSourceRoot;
const managedFiles = new ManagedFilesService(dataRoot, managedRootBindSourceRoot);
const dockerDeployment = new DockerDeploymentService(commandRunner, currentEnvironment);
const deploy = new DeployOrchestrator(
  inspection,
  validation,
  action,
  managedFiles,
  currentEnvironment,
  runtimeEnv,
  deploymentState,
  dockerDeployment
);
const environmentPolicy = new EnvironmentPolicyService(currentEnvironment);
const environmentPolicyEditor = new EnvironmentPolicyEditor(environmentsPath, environmentConfig);
const environmentRefresh = new EnvironmentRefreshService(environmentsPath, environmentConfig, {
  docker: commandRunner
});
const releaseDeploy = new ReleaseDeployService({
  environment: currentEnvironment,
  environmentPolicy,
  inspection,
  managedFiles
});
const deployPrerequisites = new DeployPrerequisitesService(
  projectRegistry,
  inspection,
  new RequirementValidator(new DockerCliProbe(commandRunner)),
  runtimeEnv,
  currentEnvironment
);
const deploymentInventory = new DeploymentInventoryService(deploymentState, currentEnvironment.id);
const deploymentCompose = new DeploymentComposeService(journal);
const deploymentRuntimeStatus = new DeploymentRuntimeStatusService(commandRunner, currentEnvironment, deploymentState);
const operations = new OperationLogService(deploy, ids, clock);
const runtimeDiagnostics = new RuntimeDiagnosticsService(runtimePaths, currentEnvironment);
const selfUpdate = new SelfUpdateService({ appInfo, commandRunner });
const deploymentDiagnostics = new DeploymentDiagnosticsService(
  deploymentState,
  deploymentRuntimeStatus,
  deploymentCompose,
  runtimeDiagnostics,
  currentEnvironment
);

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
      deploymentCompose,
      deploymentDiagnostics,
      deploymentRuntimeStatus,
      deployPrerequisites,
      operations,
      runtimeEnv,
      runtimeDiagnostics,
      repositoryInspection,
      projectRegistration,
      environmentPolicyEditor,
      environmentRefresh,
      selfUpdate,
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

function nonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}
