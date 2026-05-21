import { AnsibleRunner } from "../action/ansible-runner.js";
import { getHiveForgeInfo } from "../app-info.js";
import { EnvironmentPolicyService } from "../config/environment-policy.js";
import { loadEnvironmentConfig } from "../config/environment-loader.js";
import { loadProjectRegistryConfig } from "../config/project-registry-loader.js";
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
import { DockerCliProbe } from "../validation/docker-cli-probe.js";
import { RequirementValidator } from "../validation/requirement-validator.js";
import { NodeCommandRunner } from "../workspace/node-command-runner.js";
import { WorkspaceManager } from "../workspace/workspace-manager.js";
import { createHttpServer } from "./http-server.js";
import { createRestRoutes } from "./rest-api.js";
import { createUiRoutes, uiPublicPaths } from "./ui-routes.js";

const projectRegistryPath = requiredEnv("HIVEFORGE_PROJECT_REGISTRY_PATH");
const environmentsPath = requiredEnv("HIVEFORGE_ENVIRONMENTS_PATH");
const authToken = requiredEnv("HIVEFORGE_AUTH_TOKEN");
const appInfo = getHiveForgeInfo();
const workspaceRoot = process.env.HIVEFORGE_WORKSPACE_DIR ?? "/var/lib/hiveforge/workspace";
const journalDir = process.env.HIVEFORGE_JOURNAL_DIR ?? "/var/lib/hiveforge/journal";
const dataRoot = process.env.HIVEFORGE_DATA_ROOT ?? "/var/lib/hiveforge/data";
const port = Number.parseInt(process.env.HIVEFORGE_PORT ?? "3000", 10);
const host = process.env.HIVEFORGE_BIND_HOST ?? "127.0.0.1";

const projectRegistry = await loadProjectRegistryConfig(projectRegistryPath);
const environmentConfig = await loadEnvironmentConfig(environmentsPath);
const journal = new JsonlJournal(journalDir);
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
const repositoryInspection = new RepositoryInspectionService(workspaceRoot, commandRunner);
const projectRegistration = new ProjectRegistrationService(projectRegistryPath, projectRegistry, repositoryInspection);
const currentEnvironment = environmentConfig.environments.find((environment) => environment.id === environmentConfig.current);
if (!currentEnvironment) {
  throw new Error(`Current environment is not defined: ${environmentConfig.current}`);
}
const deploy = new DeployOrchestrator(inspection, validation, action, managedFiles, currentEnvironment);
const environmentPolicy = new EnvironmentPolicyService(currentEnvironment);
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
      environmentPolicy,
      deploymentInventory,
      operations,
      repositoryInspection,
      projectRegistration,
      environments: {
        current: currentEnvironment,
        known: environmentConfig.environments
      }
    })
  ],
  { authToken, publicPaths: uiPublicPaths }
).listen(port, host, () => {
  process.stdout.write(`HiveForge REST API listening on ${host}:${port}\n`);
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
