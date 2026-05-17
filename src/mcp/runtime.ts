import { HiveForgeApiClientError } from "./api-client.js";
import type { HiveForgeApiClient } from "./api-client.js";

export function createHiveForgeMcpRuntime(apiClient: HiveForgeApiClient) {
  return {
    listProjects: () => call(() => apiClient.listProjects()),
    listEnvironments: () => call(() => apiClient.listEnvironments()),
    listDeployments: () => call(() => apiClient.listDeployments()),
    listOperations: () => call(() => apiClient.listOperations()),
    getOperation: (input: { operationId: string }) => call(() => apiClient.getOperation(input.operationId)),
    readJournal: () => call(() => apiClient.readJournal()),
    inspectRepository: (input: { repository: string; gitRef: string }) => call(() => apiClient.inspectRepository(input)),
    inspectProject: (input: { projectId: string; gitRef: string }) => call(() => apiClient.inspectProject(input)),
    validateRequirements: (input: { projectId: string; gitRef: string; profile?: string }) =>
      call(() => apiClient.validateRequirements(input)),
    startAction: (input: { projectId: string; gitRef: string; component: string; action: string; profile?: string }) =>
      call(() => apiClient.startAction(input))
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
