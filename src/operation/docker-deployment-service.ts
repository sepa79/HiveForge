import { readFile, writeFile } from "node:fs/promises";
import YAML from "yaml";
import type { EnvironmentDefinition } from "../config/environment-types.js";
import type { CommandRunner, CommandResult } from "../workspace/command-runner.js";
import { HIVEFORGE_DOCKER_LABELS } from "./deployment-runtime-status-service.js";

export interface DockerDeploymentRequest {
  deploymentId: string;
  deploymentName: string;
  project: string;
  component: string;
  profile?: string;
  composeFile: string;
  bindSourceDir?: string;
}

export interface DockerDeploymentRemovalRequest {
  deploymentId: string;
  deploymentName: string;
  project: string;
  component: string;
  profile?: string;
}

export interface DockerDeploymentResult extends CommandResult {
  composeFile?: string;
  deploymentId: string;
  runtime: "docker-single" | "docker-swarm";
}

export interface ComposeBindSourceValidationResult {
  ok: boolean;
  composeFile: string;
  bindSourceDir?: string;
  allowedBindSources: string[];
  services: Array<{
    service: string;
    bindSources: string[];
  }>;
  issues: Array<{
    service: string;
    source: string;
    reason: string;
  }>;
}

export class DockerDeploymentService {
  constructor(
    private readonly commandRunner: CommandRunner,
    private readonly environment: EnvironmentDefinition
  ) {}

  async deploy(request: DockerDeploymentRequest): Promise<DockerDeploymentResult> {
    await validateComposeBindSources(request.composeFile, request.bindSourceDir, allowedBindSources(this.environment));
    await injectDeploymentLabel(request.composeFile, request.deploymentId);
    const runtime = this.environment.capabilities.runtime.includes("docker-swarm") ? "docker-swarm" : "docker-single";
    const dockerProjectName = await dockerProjectNameFor(request, runtime);
    const result =
      runtime === "docker-swarm"
        ? await this.commandRunner.run("docker", ["stack", "deploy", "-c", request.composeFile, dockerProjectName])
        : await this.commandRunner.run("docker", [
            "compose",
            "-p",
            dockerProjectName,
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

  async remove(request: DockerDeploymentRemovalRequest): Promise<DockerDeploymentResult> {
    const runtime = this.environment.capabilities.runtime.includes("docker-swarm") ? "docker-swarm" : "docker-single";
    const dockerProjectName = dockerProjectNameForRequest(request);
    const result =
      runtime === "docker-swarm"
        ? await this.removeSwarmStack(dockerProjectName, request.deploymentId)
        : await this.removeComposeProject(dockerProjectName);
    return {
      ...result,
      deploymentId: request.deploymentId,
      runtime
    };
  }

  private async removeSwarmStack(stackName: string, deploymentId: string): Promise<CommandResult> {
    const result = await this.commandRunner.run("docker", ["stack", "rm", stackName]);
    await this.waitForNoDockerMatches([
      {
        kind: "service",
        args: ["service", "ls", "--filter", `${LABEL_FILTER_PREFIX}${HIVEFORGE_DOCKER_LABELS.deployment}=${deploymentId}`, "-q"]
      },
      {
        kind: "container",
        args: ["ps", "-a", "--filter", `${LABEL_FILTER_PREFIX}${HIVEFORGE_DOCKER_LABELS.deployment}=${deploymentId}`, "-q"]
      }
    ]);
    return result;
  }

  private async removeComposeProject(projectName: string): Promise<CommandResult> {
    const containers = await this.listDockerMatches([
      "ps",
      "-a",
      "--filter",
      `${LABEL_FILTER_PREFIX}${DOCKER_COMPOSE_PROJECT_LABEL}=${projectName}`,
      "-q"
    ]);
    const removeContainers =
      containers.length > 0 ? await this.commandRunner.run("docker", ["rm", "-f", ...containers]) : { stdout: "", stderr: "" };

    const networks = await this.listDockerMatches([
      "network",
      "ls",
      "--filter",
      `${LABEL_FILTER_PREFIX}${DOCKER_COMPOSE_PROJECT_LABEL}=${projectName}`,
      "-q"
    ]);
    const removeNetworks =
      networks.length > 0 ? await this.commandRunner.run("docker", ["network", "rm", ...networks]) : { stdout: "", stderr: "" };

    await this.waitForNoDockerMatches([
      {
        kind: "container",
        args: ["ps", "-a", "--filter", `${LABEL_FILTER_PREFIX}${DOCKER_COMPOSE_PROJECT_LABEL}=${projectName}`, "-q"]
      },
      {
        kind: "network",
        args: ["network", "ls", "--filter", `${LABEL_FILTER_PREFIX}${DOCKER_COMPOSE_PROJECT_LABEL}=${projectName}`, "-q"]
      }
    ]);

    return combineCommandResults(removeContainers, removeNetworks);
  }

  private async waitForNoDockerMatches(checks: DockerMatchCheck[]): Promise<void> {
    for (let attempt = 1; attempt <= DOCKER_REMOVE_WAIT_ATTEMPTS; attempt += 1) {
      const remaining: string[] = [];
      for (const check of checks) {
        const matches = await this.listDockerMatches(check.args);
        if (matches.length > 0) {
          remaining.push(`${check.kind}: ${matches.join(", ")}`);
        }
      }
      if (remaining.length === 0) {
        return;
      }
      if (attempt < DOCKER_REMOVE_WAIT_ATTEMPTS) {
        await sleep(DOCKER_REMOVE_WAIT_DELAY_MS);
      }
    }
    throw new Error(`Docker removal did not finish before timeout: ${checks.map((check) => check.kind).join(", ")}`);
  }

  private async listDockerMatches(args: string[]): Promise<string[]> {
    const result = await this.commandRunner.run("docker", args);
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
}

const ALLOWED_BIND_SOURCES = new Set(["/var/run/docker.sock"]);
const DOCKER_COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
const DOCKER_SWARM_SERVICE_NAME_LIMIT = 63;
const DOCKER_REMOVE_WAIT_ATTEMPTS = 60;
const DOCKER_REMOVE_WAIT_DELAY_MS = 1000;
const LABEL_FILTER_PREFIX = "label=";

interface DockerMatchCheck {
  kind: string;
  args: string[];
}

async function validateComposeBindSources(
  composeFile: string,
  bindSourceDir: string | undefined,
  allowedSources: string[] = [...ALLOWED_BIND_SOURCES]
): Promise<void> {
  const result = await inspectComposeBindSources(composeFile, bindSourceDir, allowedSources);
  if (!result.ok) {
    const issue = result.issues[0];
    throw new Error(issue ? issue.reason : "Rendered compose bind-source validation failed.");
  }
}

export async function inspectComposeBindSources(
  composeFile: string,
  bindSourceDir: string | undefined,
  allowedSources: string[] = [...ALLOWED_BIND_SOURCES]
): Promise<ComposeBindSourceValidationResult> {
  const compose = YAML.parse(await readFile(composeFile, "utf8")) as unknown;
  if (!isRecord(compose)) {
    throw new Error("Rendered compose must be a YAML object.");
  }
  const services = compose.services;
  if (!isRecord(services) || Object.keys(services).length === 0) {
    throw new Error("Rendered compose must define at least one service.");
  }

  const result: ComposeBindSourceValidationResult = {
    ok: true,
    composeFile,
    ...(bindSourceDir ? { bindSourceDir } : {}),
    allowedBindSources: allowedSources,
    services: [],
    issues: []
  };

  for (const [serviceName, serviceValue] of Object.entries(services)) {
    if (!isRecord(serviceValue)) {
      throw new Error(`Rendered compose service must be an object: ${serviceName}`);
    }
    const sources = bindSources(serviceValue.volumes, serviceName);
    result.services.push({
      service: serviceName,
      bindSources: sources
    });
    for (const source of sources) {
      const issue = bindSourceIssue(source, bindSourceDir, serviceName, allowedSources);
      if (issue) {
        result.issues.push({
          service: serviceName,
          source,
          reason: issue
        });
      }
    }
  }

  result.ok = result.issues.length === 0;
  return result;
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

async function dockerProjectNameFor(
  request: DockerDeploymentRequest,
  runtime: "docker-single" | "docker-swarm"
): Promise<string> {
  const compose = YAML.parse(await readFile(request.composeFile, "utf8")) as unknown;
  if (!isRecord(compose)) {
    throw new Error("Rendered compose must be a YAML object.");
  }
  const services = compose.services;
  if (!isRecord(services) || Object.keys(services).length === 0) {
    throw new Error("Rendered compose must define at least one service.");
  }

  const projectName = dockerProjectNameForRequest(request);
  if (runtime !== "docker-swarm") {
    return projectName;
  }
  const maxServiceNameLength = DOCKER_SWARM_SERVICE_NAME_LIMIT - projectName.length - 1;
  for (const serviceName of Object.keys(services)) {
    if (serviceName.length > maxServiceNameLength) {
      throw new Error(
        `Rendered compose service name is too long for Docker Swarm with HiveForge project name ${projectName}: ${serviceName}. ` +
          `Maximum service name length is ${maxServiceNameLength} characters.`
      );
    }
  }
  return projectName;
}

function dockerProjectNameForRequest(request: { deploymentName: string }): string {
  assertDockerDeploymentName(request.deploymentName);
  return request.deploymentName;
}

function assertDockerDeploymentName(value: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new Error(`Deployment name is not safe for Docker project/stack names: ${value}`);
  }
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

function bindSourceIssue(
  source: string,
  bindSourceDir: string | undefined,
  serviceName: string,
  allowedSources: string[]
): string | null {
  if (source === "/hf" || source.startsWith("/hf/")) {
    return `Rendered compose service ${serviceName} uses HiveForge internal bind source: ${source}`;
  }
  if (allowedSources.includes(source)) {
    return null;
  }
  if (!bindSourceDir) {
    return `Rendered compose service ${serviceName} uses bind source ${source}, but the environment has no HIVEFORGE_BIND_SOURCE_DIR.`;
  }
  if (source !== bindSourceDir && !source.startsWith(`${bindSourceDir}/`)) {
    return `Rendered compose service ${serviceName} uses bind source outside HIVEFORGE_BIND_SOURCE_DIR: ${source}`;
  }
  return null;
}

export function allowedBindSources(environment: EnvironmentDefinition): string[] {
  return [...new Set([...ALLOWED_BIND_SOURCES, ...(environment.capabilities.bindSources?.allowed ?? [])])];
}

function combineCommandResults(...results: CommandResult[]): CommandResult {
  return {
    stdout: results
      .map((result) => result.stdout)
      .filter(Boolean)
      .join("\n"),
    stderr: results
      .map((result) => result.stderr)
      .filter(Boolean)
      .join("\n")
  };
}

async function sleep(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
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
