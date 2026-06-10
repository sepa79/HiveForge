import { readFile, writeFile } from "node:fs/promises";
import YAML from "yaml";
import type { EnvironmentDefinition } from "../config/environment-types.js";
import type { CommandRunner, CommandResult } from "../workspace/command-runner.js";
import { HIVEFORGE_DOCKER_LABELS } from "./deployment-runtime-status-service.js";

export interface DockerDeploymentRequest {
  deploymentId: string;
  composeFile: string;
}

export interface DockerDeploymentResult extends CommandResult {
  composeFile: string;
  deploymentId: string;
  runtime: "docker-single" | "docker-swarm";
}

export class DockerDeploymentService {
  constructor(
    private readonly commandRunner: CommandRunner,
    private readonly environment: EnvironmentDefinition
  ) {}

  async deploy(request: DockerDeploymentRequest): Promise<DockerDeploymentResult> {
    await injectDeploymentLabel(request.composeFile, request.deploymentId);
    const runtime = this.environment.capabilities.runtime.includes("docker-swarm") ? "docker-swarm" : "docker-single";
    const result =
      runtime === "docker-swarm"
        ? await this.commandRunner.run("docker", ["stack", "deploy", "-c", request.composeFile, request.deploymentId])
        : await this.commandRunner.run("docker", [
            "compose",
            "-p",
            request.deploymentId,
            "-f",
            request.composeFile,
            "up",
            "-d"
          ]);
    return {
      ...result,
      composeFile: request.composeFile,
      deploymentId: request.deploymentId,
      runtime
    };
  }
}

async function injectDeploymentLabel(composeFile: string, deploymentId: string): Promise<void> {
  const compose = YAML.parse(await readFile(composeFile, "utf8")) as unknown;
  if (!isRecord(compose)) {
    throw new Error("Rendered compose must be a YAML object.");
  }
  const services = compose.services;
  if (!isRecord(services) || Object.keys(services).length === 0) {
    throw new Error("Rendered compose must define at least one service.");
  }

  for (const [serviceName, serviceValue] of Object.entries(services)) {
    if (!isRecord(serviceValue)) {
      throw new Error(`Rendered compose service must be an object: ${serviceName}`);
    }
    serviceValue.labels = labelsWithDeployment(serviceValue.labels, deploymentId, `services.${serviceName}.labels`);
    const deploy = isRecord(serviceValue.deploy) ? serviceValue.deploy : {};
    deploy.labels = labelsWithDeployment(deploy.labels, deploymentId, `services.${serviceName}.deploy.labels`);
    serviceValue.deploy = deploy;
  }

  await writeFile(composeFile, YAML.stringify(compose), "utf8");
}

function labelsWithDeployment(value: unknown, deploymentId: string, path: string): Record<string, string> {
  const labels = normalizeLabels(value, path);
  labels[HIVEFORGE_DOCKER_LABELS.deployment] = deploymentId;
  return labels;
}

function normalizeLabels(value: unknown, path: string): Record<string, string> {
  if (value === undefined || value === null) {
    return {};
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, labelValue]) => {
        if (!isScalarLabelValue(labelValue)) {
          throw new Error(`Compose label value must be scalar at ${path}.${key}`);
        }
        return [key, String(labelValue)];
      })
    );
  }
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.map((entry) => {
        if (typeof entry !== "string" || !entry.includes("=")) {
          throw new Error(`Compose label list entries must use key=value form at ${path}`);
        }
        const separator = entry.indexOf("=");
        return [entry.slice(0, separator), entry.slice(separator + 1)];
      })
    );
  }
  throw new Error(`Compose labels must be a map or key=value list at ${path}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalarLabelValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
