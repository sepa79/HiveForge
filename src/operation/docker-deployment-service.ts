import { readFile, writeFile } from "node:fs/promises";
import YAML from "yaml";
import type { EnvironmentDefinition } from "../config/environment-types.js";
import type { CommandRunner, CommandResult } from "../workspace/command-runner.js";
import { HIVEFORGE_DOCKER_LABELS } from "./deployment-runtime-status-service.js";

export interface DockerDeploymentRequest {
  deploymentId: string;
  composeFile: string;
  bindSourceDir?: string;
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
    await validateComposeBindSources(request.composeFile, request.bindSourceDir);
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

const ALLOWED_BIND_SOURCES = new Set(["/var/run/docker.sock"]);

async function validateComposeBindSources(composeFile: string, bindSourceDir: string | undefined): Promise<void> {
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
    for (const source of bindSources(serviceValue.volumes, serviceName)) {
      validateBindSource(source, bindSourceDir, serviceName);
    }
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

function bindSources(value: unknown, serviceName: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`Compose service volumes must be a list: ${serviceName}`);
  }

  const sources: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const source = shortSyntaxBindSource(entry);
      if (source) {
        sources.push(source);
      }
      continue;
    }
    if (!isRecord(entry)) {
      throw new Error(`Compose service volume entries must be strings or objects: ${serviceName}`);
    }
    const type = typeof entry.type === "string" ? entry.type : undefined;
    const source = typeof entry.source === "string" ? entry.source : undefined;
    if (type === "bind" && source) {
      sources.push(source);
      continue;
    }
    if (!type && source && looksLikeHostPath(source)) {
      sources.push(source);
    }
  }
  return sources;
}

function shortSyntaxBindSource(value: string): string | null {
  const parts = value.split(":");
  if (parts.length < 2) {
    return null;
  }
  const source = parts[0];
  if (!source || !looksLikeHostPath(source)) {
    return null;
  }
  return source;
}

function looksLikeHostPath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || value === "." || value === ".." || value.startsWith("~");
}

function validateBindSource(source: string, bindSourceDir: string | undefined, serviceName: string): void {
  if (ALLOWED_BIND_SOURCES.has(source)) {
    return;
  }
  if (source === "/hf" || source.startsWith("/hf/")) {
    throw new Error(`Rendered compose service ${serviceName} uses HiveForge internal bind source: ${source}`);
  }
  if (!bindSourceDir) {
    throw new Error(
      `Rendered compose service ${serviceName} uses bind source ${source}, but the environment has no HIVEFORGE_BIND_SOURCE_DIR.`
    );
  }
  if (source !== bindSourceDir && !source.startsWith(`${bindSourceDir}/`)) {
    throw new Error(
      `Rendered compose service ${serviceName} uses bind source outside HIVEFORGE_BIND_SOURCE_DIR: ${source}`
    );
  }
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
