import { HiveForgeApiClientError } from "./api-client.js";
import type { HiveForgeApiClient, ReleaseDeployApiInput } from "./api-client.js";

export function createHiveForgeMcpRuntime(apiClient: HiveForgeApiClient) {
  return {
    checkHealth: () => call(() => apiClient.getHealth()),
    getHiveForgeInfo: () => call(() => apiClient.getInfo()),
    getOperatorWorkflows: (input: { topic?: "production" | "development" | "hiveforge-maintainer" }) =>
      call(async () => operatorWorkflows(input.topic)),
    getManagedRepositoriesInfo: () => call(() => apiClient.getManagedRepositoriesInfo()),
    listProjects: () => call(() => apiClient.listProjects()),
    listEnvironments: () => call(() => apiClient.listEnvironments()),
    refreshEnvironment: () => call(() => apiClient.refreshEnvironment()),
    listEnvironmentNodes: () => call(() => listEnvironmentNodes(apiClient)),
    listDeployments: () => call(() => apiClient.listDeployments()),
    listWorkspaces: () => call(() => apiClient.listWorkspaces()),
    cleanupWorkspaces: (input: { dryRun: boolean; olderThanHours: number }) => call(() => apiClient.cleanupWorkspaces(input)),
    diagnoseHiveForgeRuntime: () => call(() => apiClient.diagnoseHiveForgeRuntime()),
    verifyManagedRootAccess: () => call(() => apiClient.verifyManagedRootAccess()),
    getDeploymentCompose: (input: { operationId: string }) => call(() => apiClient.getDeploymentCompose(input)),
    checkDeploymentRuntimeStatus: (input: {
      deploymentId?: string;
      projectId?: string;
      component?: string;
      profile?: string;
    }) =>
      call(() => apiClient.checkDeploymentRuntimeStatus(input)),
    diagnoseDeployment: (input: { deploymentId: string }) => call(() => apiClient.diagnoseDeployment(input)),
    listOperations: () => call(() => apiClient.listOperations()),
    getOperation: (input: { operationId: string }) => call(() => apiClient.getOperation(input.operationId)),
    readJournal: () => call(() => apiClient.readJournal()),
    inspectRepository: (input: { repository: string; gitRef: string }) => call(() => apiClient.inspectRepository(input)),
    registerProject: (input: { repository: string; gitRef: string; registrationKind?: "official" | "development" }) =>
      call(() => apiClient.registerProject(input)),
    replaceProjectRepository: (input: { projectId: string; repository: string; gitRef: string }) =>
      call(() => apiClient.replaceProjectRepository(input)),
    unregisterProjectRef: (input: { projectId: string; gitRef: string }) => call(() => apiClient.unregisterProjectRef(input)),
    setEnvironmentProjectPolicy: (input: {
      environmentId: string;
      projectId: string;
      actions: string[];
      profiles?: string[];
    }) => call(() => apiClient.setEnvironmentProjectPolicy(input)),
    listProjectRuntimeEnv: (input: { projectId: string }) => call(() => apiClient.listProjectRuntimeEnv(input)),
    setProjectRuntimeEnv: (input: { projectId: string; profile?: string; values: Record<string, string> }) =>
      call(() => apiClient.setProjectRuntimeEnv(input)),
    unsetProjectRuntimeEnv: (input: { projectId: string; profile?: string; keys: string[] }) =>
      call(() => apiClient.unsetProjectRuntimeEnv(input)),
    inspectProject: (input: { projectId: string; gitRef: string }) => call(() => apiClient.inspectProject(input)),
    explainDeployPrerequisites: (input: {
      projectId: string;
      gitRef: string;
      component: string;
      action: string;
      profile?: string;
      deploymentMode?: "action" | "release";
      vars?: Record<string, string>;
      releaseVars?: Record<string, string>;
      images?: unknown[];
      artifact?: unknown;
    }) => call(() => apiClient.explainDeployPrerequisites(input)),
    validateRequirements: (input: { projectId: string; gitRef: string; profile?: string }) =>
      call(() => apiClient.validateRequirements(input)),
    startAction: (input: {
      projectId: string;
      gitRef: string;
      component: string;
      action: string;
      profile?: string;
      deploymentName?: string;
    }) =>
      call(() => apiClient.startAction(input)),
    prepareReleaseDeploy: (input: ReleaseDeployApiInput) => call(() => apiClient.prepareReleaseDeploy(input))
  };
}

function operatorWorkflows(topic?: "production" | "development" | "hiveforge-maintainer") {
  const workflows = [
    {
      id: "production",
      title: "Production or release deployment through HiveForge",
      summary: "Use this when deploying a registered project through normal HiveForge operator flows.",
      steps: [
        "Use `check_health` and `get_hiveforge_info` to confirm the connected target.",
        "Use `list_environments`, `refresh_environment` when needed, and `list_projects` to confirm the target environment and registered project.",
        "Use `inspect_project`, `explain_deploy_prerequisites`, and `validate_requirements` before deployment.",
        "For repo/ref lifecycle deploys, use `start_action` with an explicit `projectId`, `gitRef`, `component`, `action`, and optional `profile`.",
        "For release/image-tag-set deploy preparation, use `prepare_release_deploy` first; it validates inputs but does not build, push, or execute deployment.",
        "Use `get_operation`, `get_deployment_compose`, `check_deployment_runtime_status`, and `read_journal` for evidence and post-deploy verification."
      ],
      notes: [
        "MCP is the supported operator interface; REST is an implementation and maintainer debug surface.",
        "Use published release images or explicitly prepared image references. Do not infer tags, refs, or fallback profiles."
      ]
    },
    {
      id: "development",
      title: "Development project deployment on a Full node",
      summary: "Use this when a project is hosted in the Full-node Forgejo service and development images are pushed to the Full-node OCI registry.",
      steps: [
        "Use `get_managed_repositories_info` to discover the shared Forgejo Git base URL, OCI registry address, and owner namespace for the current Full node.",
        "Push Git changes to the Full-node Forgejo repository and push the development image to the discovered OCI registry using your normal Git and Docker tooling.",
        "Register or update the project as a `development` variant when appropriate so HiveForge tracks it as `<project>-development`.",
        "Run the normal HiveForge operator flow: `inspect_project`, `explain_deploy_prerequisites`, `validate_requirements`, then `start_action` or `prepare_release_deploy` with the explicit dev ref and image inputs.",
        "Use `get_operation`, `check_deployment_runtime_status`, and `read_journal` to confirm the deployed development runtime."
      ],
      notes: [
        "Full-node Git and OCI discovery does not build images, choose repository paths, or choose tags for you.",
        "The same deployment validation rules apply to development variants as to official project variants."
      ]
    },
    {
      id: "hiveforge-maintainer",
      title: "HiveForge maintainer development update on a Full node",
      summary: "Use this when developing HiveForge itself against a Full-node Forgejo and OCI registry without publishing an official release.",
      steps: [
        "Use `get_managed_repositories_info` to discover the Full-node Git and OCI endpoints.",
        "Push HiveForge source changes to the Full-node Forgejo repository using normal Git tooling.",
        "Build a development HiveForge image and push it to the Full-node OCI registry using normal Docker tooling.",
        "Update the running HiveForge Compose project or Swarm service manually to that explicit development image.",
        "After the update, use `check_health`, `get_hiveforge_info`, and other MCP tools against the refreshed endpoint to verify the new build."
      ],
      notes: [
        "This is a maintainer workflow. It is separate from deploying ordinary application projects through HiveForge.",
        "The `Update HF` UI action remains release-only; it targets published official releases and is not a development-image deployment path."
      ]
    }
  ] as const;

  return {
    workflows: topic ? workflows.filter((workflow) => workflow.id === topic) : workflows
  };
}

async function listEnvironmentNodes(apiClient: HiveForgeApiClient): Promise<unknown> {
  const payload = await apiClient.listEnvironments();
  if (!isRecord(payload) || !isRecord(payload.current)) {
    throw new Error("HiveForge environments response does not include a current environment.");
  }
  const current = payload.current;
  const deployment = isRecord(current.deployment) ? current.deployment : null;
  return {
    environmentId: current.id,
    environmentName: current.name,
    executor: typeof deployment?.executor === "string" ? deployment.executor : "docker-direct",
    ...(isRecord(deployment?.portainer)
      ? {
          portainer: {
            ...(typeof deployment.portainer.baseUrl === "string" ? { baseUrl: deployment.portainer.baseUrl } : {}),
            ...(typeof deployment.portainer.endpointId === "number" ? { endpointId: deployment.portainer.endpointId } : {}),
            ...(typeof deployment.portainer.tlsInsecureSkipVerify === "boolean"
              ? { tlsInsecureSkipVerify: deployment.portainer.tlsInsecureSkipVerify }
              : {})
          }
        }
      : {}),
    nodes: Array.isArray(current.nodes) ? current.nodes : []
  };
}

async function call(loader: () => Promise<unknown>) {
  try {
    return jsonResult(await loader());
  } catch (error) {
    return errorResult(error);
  }
}

function jsonResult(payload: unknown) {
  const structuredContent = toStructuredContent(payload);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2)
      }
    ],
    structuredContent
  };
}

function toStructuredContent(payload: unknown): Record<string, unknown> {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return { value: payload };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorResult(error: unknown) {
  if (error instanceof HiveForgeApiClientError) {
    return {
      isError: true,
      ...jsonResult({
        error: {
          code: error.code,
          message: error.message,
          status: error.status,
          details: error.details
        }
      })
    };
  }

  return {
    isError: true,
    ...jsonResult({
      error: {
        code: "MCP_RUNTIME_ERROR",
        message: error instanceof Error ? error.message : String(error),
        details: {}
      }
    })
  };
}
