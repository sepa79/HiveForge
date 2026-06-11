import { HiveForgeApiClientError } from "./api-client.js";
import type { HiveForgeApiClient, ReleaseDeployApiInput } from "./api-client.js";

export function createHiveForgeMcpRuntime(apiClient: HiveForgeApiClient) {
  return {
    checkHealth: () => call(() => apiClient.getHealth()),
    getHiveForgeInfo: () => call(() => apiClient.getInfo()),
    listProjects: () => call(() => apiClient.listProjects()),
    listEnvironments: () => call(() => apiClient.listEnvironments()),
    refreshEnvironment: () => call(() => apiClient.refreshEnvironment()),
    listEnvironmentNodes: () => call(() => listEnvironmentNodes(apiClient)),
    listDeployments: () => call(() => apiClient.listDeployments()),
    diagnoseHiveForgeRuntime: () => call(() => apiClient.diagnoseHiveForgeRuntime()),
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
    registerProject: (input: { repository: string; gitRef: string }) => call(() => apiClient.registerProject(input)),
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

async function listEnvironmentNodes(apiClient: HiveForgeApiClient): Promise<unknown> {
  const payload = await apiClient.listEnvironments();
  if (!isRecord(payload) || !isRecord(payload.current)) {
    throw new Error("HiveForge environments response does not include a current environment.");
  }
  const current = payload.current;
  return {
    environmentId: current.id,
    environmentName: current.name,
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
