import { readFile } from "node:fs/promises";
import { Agent } from "undici";
import type { EnvironmentDefinition, PortainerDeploymentConfig } from "../config/environment-types.js";
import type { DeploymentExecutor, DeploymentExecutorRequest, DeploymentExecutorResult, PreparedComposeDeploymentRequest } from "./deployment-executor.js";

export class PortainerDeploymentService implements DeploymentExecutor {
  public readonly executorKind = "portainer-stack" as const;

  constructor(
    private readonly environment: EnvironmentDefinition,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async deploy(request: PreparedComposeDeploymentRequest): Promise<DeploymentExecutorResult> {
    const config = portainerConfig(this.environment);
    const stackFileContent = await readFile(request.composeFile, "utf8");
    const existingStackId = request.deployment.portainer?.stackId;
    const endpointId = deploymentEndpointId(config, request.deployment);

    const stack = existingStackId
      ? await this.updateStack(config, endpointId, existingStackId, stackFileContent)
      : await this.createStack(config, endpointId, request.deployment.deploymentName, stackFileContent);

    return {
      stdout: "",
      stderr: "",
      composeFile: request.composeFile,
      runtime: "docker-swarm",
      executorKind: this.executorKind,
      portainer: {
        endpointId,
        stackId: stack.id,
        stackName: stack.name
      }
    };
  }

  async remove(request: DeploymentExecutorRequest): Promise<DeploymentExecutorResult> {
    const config = portainerConfig(this.environment);
    const endpointId = deploymentEndpointId(config, request.deployment);
    const stackId = request.deployment.portainer?.stackId;
    if (stackId === undefined) {
      throw new Error(
        `Portainer-owned deployment ${request.deployment.deploymentId} is missing recorded stackId.`
      );
    }

    await this.callJson(
      "DELETE",
      config,
      `/stacks/${stackId}?endpointId=${endpointId}`
    );

    return {
      stdout: "",
      stderr: "",
      runtime: "docker-swarm",
      executorKind: this.executorKind,
      portainer: {
        endpointId,
        stackId,
        stackName: request.deployment.portainer?.stackName ?? request.deployment.deploymentName
      }
    };
  }

  private async createStack(
    config: PortainerDeploymentConfig,
    endpointId: number,
    deploymentName: string,
    stackFileContent: string
  ): Promise<{ id: number; name: string }> {
    const swarmId = await this.readSwarmId(config, endpointId);
    const stack = await this.callJson(
      "POST",
      config,
      `/stacks/create/swarm/string?endpointId=${endpointId}`,
      {
        Name: deploymentName,
        StackFileContent: stackFileContent,
        SwarmID: swarmId,
        Env: []
      }
    );
    return stackIdentity(stack, deploymentName);
  }

  private async updateStack(
    config: PortainerDeploymentConfig,
    endpointId: number,
    stackId: number,
    stackFileContent: string
  ): Promise<{ id: number; name: string }> {
    const stack = await this.callJson(
      "PUT",
      config,
      `/stacks/${stackId}?endpointId=${endpointId}`,
      {
        StackFileContent: stackFileContent,
        Env: [],
        PullImage: false,
        Prune: false
      }
    );
    return stackIdentity(stack, undefined, stackId);
  }

  private async readSwarmId(config: PortainerDeploymentConfig, endpointId: number): Promise<string> {
    const info = await this.callJson("GET", config, `/endpoints/${endpointId}/docker/info`);
    if (!isRecord(info) || !isRecord(info.Swarm) || !isRecord(info.Swarm.Cluster) || typeof info.Swarm.Cluster.ID !== "string") {
      throw new Error(`Portainer endpoint ${endpointId} did not return a Docker Swarm cluster id.`);
    }
    return info.Swarm.Cluster.ID;
  }

  private async callJson(
    method: "GET" | "POST" | "PUT" | "DELETE",
    config: PortainerDeploymentConfig,
    apiPath: string,
    body?: unknown
  ): Promise<unknown> {
    const dispatcher = portainerDispatcher(config);
    const response = await this.fetchImpl(`${normalizedBaseUrl(config.baseUrl)}${apiPath}`, {
      method,
      ...(dispatcher ? { dispatcher } : {}),
      headers: {
        "X-API-Key": config.apiKey,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    if (!response.ok) {
      throw new Error(await portainerErrorMessage(response));
    }

    if (response.status === 204) {
      return {};
    }

    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`Portainer returned a non-JSON response for ${method} ${apiPath}.`);
    }
  }
}

function portainerConfig(environment: EnvironmentDefinition): PortainerDeploymentConfig {
  if (!environment.capabilities.runtime.includes("docker-swarm")) {
    throw new Error(`Portainer stack deployment requires docker-swarm runtime for environment ${environment.id}.`);
  }
  if (environment.deployment?.executor !== "portainer-stack" || !environment.deployment.portainer) {
    throw new Error(`Portainer stack deployment is not configured for environment ${environment.id}.`);
  }
  return environment.deployment.portainer;
}

function normalizedBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function deploymentEndpointId(
  config: PortainerDeploymentConfig,
  deployment: DeploymentExecutorRequest["deployment"]
): number {
  const recordedEndpointId = deployment.portainer?.endpointId;
  if (recordedEndpointId === undefined) {
    return config.endpointId;
  }
  if (recordedEndpointId !== config.endpointId) {
    throw new Error(
      `Portainer-owned deployment ${deployment.deploymentId} is recorded for endpoint ${recordedEndpointId}, ` +
        `but environment ${config.endpointId} is configured.`
    );
  }
  return recordedEndpointId;
}

function portainerDispatcher(config: PortainerDeploymentConfig): Agent | undefined {
  if (!config.tlsInsecureSkipVerify) {
    return undefined;
  }
  return new Agent({
    connect: {
      rejectUnauthorized: false
    }
  });
}

function stackIdentity(value: unknown, fallbackName?: string, fallbackId?: number): { id: number; name: string } {
  if (!isRecord(value)) {
    throw new Error("Portainer stack response is not a JSON object.");
  }
  const id = typeof value.Id === "number" ? value.Id : fallbackId;
  const name = typeof value.Name === "string" && value.Name.length > 0 ? value.Name : fallbackName;
  if (id === undefined || !name) {
    throw new Error("Portainer stack response is missing stack identity.");
  }
  return { id, name };
}

async function portainerErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return `Portainer API request failed: ${response.status} ${response.statusText}`;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (isRecord(parsed)) {
      const message = typeof parsed.message === "string" ? parsed.message : undefined;
      const details = typeof parsed.details === "string" ? parsed.details : undefined;
      if (message && details) {
        return `Portainer API request failed: ${message} (${details})`;
      }
      if (message) {
        return `Portainer API request failed: ${message}`;
      }
      if (details) {
        return `Portainer API request failed: ${details}`;
      }
    }
  } catch {
    return `Portainer API request failed: ${response.status} ${response.statusText}`;
  }
  return `Portainer API request failed: ${response.status} ${response.statusText}`;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
