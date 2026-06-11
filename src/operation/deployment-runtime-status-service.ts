import type { EnvironmentDefinition } from "../config/environment-types.js";
import type { CommandRunner } from "../workspace/command-runner.js";
import type { DeploymentStateRecord, DeploymentStateStore } from "./deployment-state-store.js";

export const HIVEFORGE_DOCKER_LABELS = {
  deployment: "hiveforge.deployment",
  runtimeIgnore: "hiveforge.runtime.ignore"
} as const;

export interface DeploymentRuntimeStatusRequest {
  deploymentId?: string;
  projectId?: string;
  component?: string;
  profile?: string;
}

export interface DeploymentRuntimeStatusResult {
  deploymentId?: string;
  deploymentName?: string;
  projectId?: string;
  component?: string;
  profile?: string;
  summary: "running" | "unhealthy" | "exited" | "missing" | "unknown";
  requiredLabels: Record<string, string>;
  containers: RuntimeContainerStatus[];
  services: RuntimeServiceStatus[];
  reason?: string;
}

export interface RuntimeContainerStatus {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health?: string;
  ports?: string;
  labels: Record<string, string>;
  mounts: Array<{ source?: string; destination?: string; mode?: string; type?: string }>;
}

export interface RuntimeServiceStatus {
  id: string;
  name: string;
  image: string;
  mode?: string;
  replicas?: string;
  labels: Record<string, string>;
  tasks: RuntimeServiceTaskStatus[];
}

export interface RuntimeServiceTaskStatus {
  id: string;
  name: string;
  image: string;
  node?: string;
  desiredState?: string;
  currentState?: string;
  error?: string;
  ports?: string;
}

export class DeploymentRuntimeStatusService {
  constructor(
    private readonly commandRunner: CommandRunner,
    private readonly environment: EnvironmentDefinition,
    private readonly deploymentState: DeploymentStateStore
  ) {}

  async check(request: DeploymentRuntimeStatusRequest): Promise<DeploymentRuntimeStatusResult> {
    const deployment = await this.resolveDeployment(request);
    if (!deployment) {
      return missingDeploymentResult(request);
    }
    if (deployment.status === "removed") {
      return {
        deploymentId: deployment.deploymentId,
        deploymentName: deployment.deploymentName,
        projectId: deployment.project,
        component: deployment.component,
        ...(deployment.profile ? { profile: deployment.profile } : {}),
        summary: "missing",
        requiredLabels: requiredLabelMap(deployment),
        containers: [],
        services: [],
        reason: "Deployment is recorded as removed in HiveForge state."
      };
    }

    const requiredLabels = requiredLabelMap(deployment);
    const isSwarm = this.environment.capabilities.runtime.includes("docker-swarm");
    const containers = await this.listContainers(requiredLabels);
    const services = isSwarm ? await this.listServices(requiredLabels) : [];
    const visibleContainers = isSwarm ? swarmVisibleContainers(containers) : containers;

    return {
      deploymentId: deployment.deploymentId,
      deploymentName: deployment.deploymentName,
      projectId: deployment.project,
      component: deployment.component,
      ...(deployment.profile ? { profile: deployment.profile } : {}),
      summary: summarize(containers, services),
      requiredLabels,
      containers: visibleContainers,
      services,
      ...(containers.length === 0 && services.length === 0
        ? {
            reason:
              "No Docker containers or services matched the required HiveForge labels. Runtime status does not infer ownership from names."
          }
        : {})
    };
  }

  private async resolveDeployment(request: DeploymentRuntimeStatusRequest): Promise<DeploymentStateRecord | null> {
    if (request.deploymentId) {
      return this.deploymentState.getDeployment(request.deploymentId);
    }
    if (!request.projectId || !request.component) {
      throw new Error("Deployment runtime status requires deploymentId or projectId and component.");
    }
    return this.deploymentState.findDeployment({
      environment: this.environment.id,
      project: request.projectId,
      component: request.component,
      profile: request.profile
    });
  }

  private async listContainers(labels: Record<string, string>): Promise<RuntimeContainerStatus[]> {
    const ps = await this.commandRunner.run("docker", [
      "ps",
      "-a",
      ...labelFilterArgs(labels),
      "--format",
      "{{json .}}"
    ]);
    const ids = parseJsonLines<Record<string, unknown>>(ps.stdout)
      .map((row) => stringField(row, "ID"))
      .filter(Boolean);
    if (ids.length === 0) {
      return [];
    }

    const inspect = await this.commandRunner.run("docker", ["inspect", ...ids]);
    const inspected = parseJsonArray<Record<string, unknown>>(inspect.stdout);
    return inspected.map(containerStatus);
  }

  private async listServices(labels: Record<string, string>): Promise<RuntimeServiceStatus[]> {
    const list = await this.commandRunner.run("docker", [
      "service",
      "ls",
      ...labelFilterArgs(labels),
      "--format",
      "{{json .}}"
    ]);
    const rows = parseJsonLines<Record<string, unknown>>(list.stdout);
    const ids = rows.map((row) => stringField(row, "ID")).filter(Boolean);
    if (ids.length === 0) {
      return [];
    }
    const inspect = await this.commandRunner.run("docker", ["service", "inspect", ...ids]);
    const inspected = parseJsonArray<Record<string, unknown>>(inspect.stdout);
    const tasks = await this.listServiceTasks(ids);
    return rows.map((row) => {
      const status = serviceStatus(row, findInspectedService(inspected, stringField(row, "ID")));
      return {
        ...status,
        tasks: tasks.filter((task) => task.name === status.name || task.name.startsWith(`${status.name}.`))
      };
    });
  }

  private async listServiceTasks(serviceIds: string[]): Promise<RuntimeServiceTaskStatus[]> {
    const result = await this.commandRunner.run("docker", [
      "service",
      "ps",
      "--no-trunc",
      "--format",
      "{{json .}}",
      ...serviceIds
    ]);
    return parseJsonLines<Record<string, unknown>>(result.stdout).map(serviceTaskStatus);
  }
}

function requiredLabelMap(deployment: DeploymentStateRecord): Record<string, string> {
  return {
    [HIVEFORGE_DOCKER_LABELS.deployment]: deployment.deploymentId
  };
}

function missingDeploymentResult(request: DeploymentRuntimeStatusRequest): DeploymentRuntimeStatusResult {
  return {
    ...(request.deploymentId ? { deploymentId: request.deploymentId } : {}),
    ...(request.projectId ? { projectId: request.projectId } : {}),
    ...(request.component ? { component: request.component } : {}),
    ...(request.profile ? { profile: request.profile } : {}),
    summary: "missing",
    requiredLabels: {},
    containers: [],
    services: [],
    reason: "No deployment state matched the requested deployment selector."
  };
}

function labelFilterArgs(labels: Record<string, string>): string[] {
  return Object.entries(labels).flatMap(([name, value]) => ["--filter", `label=${name}=${value}`]);
}

function containerStatus(container: Record<string, unknown>): RuntimeContainerStatus {
  const state = objectField(container, "State");
  const config = objectField(container, "Config");
  return {
    id: stringField(container, "Id"),
    name: stringField(container, "Name").replace(/^\//, ""),
    image: stringField(config, "Image"),
    state: stringField(state, "Status"),
    status: stringField(state, "Status"),
    ...(objectField(state, "Health") ? { health: stringField(objectField(state, "Health"), "Status") } : {}),
    labels: recordOfStrings(objectField(config, "Labels")),
    mounts: arrayField(container, "Mounts").map((mount) => ({
      ...(optionalStringField(mount, "Source") ? { source: optionalStringField(mount, "Source") } : {}),
      ...(optionalStringField(mount, "Destination") ? { destination: optionalStringField(mount, "Destination") } : {}),
      ...(optionalStringField(mount, "Mode") ? { mode: optionalStringField(mount, "Mode") } : {}),
      ...(optionalStringField(mount, "Type") ? { type: optionalStringField(mount, "Type") } : {})
    }))
  };
}

function serviceStatus(service: Record<string, unknown>, inspected?: Record<string, unknown>): RuntimeServiceStatus {
  return {
    id: stringField(service, "ID"),
    name: stringField(service, "Name"),
    image: stringField(service, "Image"),
    ...(optionalStringField(service, "Mode") ? { mode: optionalStringField(service, "Mode") } : {}),
    ...(optionalStringField(service, "Replicas") ? { replicas: optionalStringField(service, "Replicas") } : {}),
    labels: inspected ? recordOfStrings(objectField(objectField(inspected, "Spec"), "Labels")) : parseLabels(optionalStringField(service, "Labels") ?? ""),
    tasks: []
  };
}

function serviceTaskStatus(task: Record<string, unknown>): RuntimeServiceTaskStatus {
  return {
    id: stringField(task, "ID"),
    name: stringField(task, "Name"),
    image: stringField(task, "Image"),
    ...(optionalStringField(task, "Node") ? { node: optionalStringField(task, "Node") } : {}),
    ...(optionalStringField(task, "DesiredState") ? { desiredState: optionalStringField(task, "DesiredState") } : {}),
    ...(optionalStringField(task, "CurrentState") ? { currentState: optionalStringField(task, "CurrentState") } : {}),
    ...(optionalStringField(task, "Error") ? { error: optionalStringField(task, "Error") } : {}),
    ...(optionalStringField(task, "Ports") ? { ports: optionalStringField(task, "Ports") } : {})
  };
}

function findInspectedService(
  inspected: Array<Record<string, unknown>>,
  serviceId: string
): Record<string, unknown> | undefined {
  return inspected.find((service) => stringField(service, "ID") === serviceId || stringField(service, "ID").startsWith(serviceId));
}

function summarize(containers: RuntimeContainerStatus[], services: RuntimeServiceStatus[]): DeploymentRuntimeStatusResult["summary"] {
  if (containers.length === 0 && services.length === 0) {
    return "missing";
  }
  const monitoredServices = services.filter((service) => service.labels[HIVEFORGE_DOCKER_LABELS.runtimeIgnore] !== "true");
  const monitoredContainers = containers.filter((container) => container.labels[HIVEFORGE_DOCKER_LABELS.runtimeIgnore] !== "true");
  if (services.length > 0) {
    if (monitoredServices.some((service) => !serviceReplicasSatisfied(service.replicas))) {
      return "unhealthy";
    }
    if (monitoredContainers.some((container) => container.state === "running" && container.health === "unhealthy")) {
      return "unhealthy";
    }
    if (monitoredServices.length > 0) {
      return "running";
    }
  }
  if (monitoredContainers.some((container) => container.health === "unhealthy")) {
    return "unhealthy";
  }
  if (monitoredContainers.some((container) => ["exited", "dead"].includes(container.state))) {
    return "exited";
  }
  if (monitoredContainers.some((container) => container.state === "running") || monitoredServices.length > 0) {
    return "running";
  }
  return "unknown";
}

function swarmVisibleContainers(containers: RuntimeContainerStatus[]): RuntimeContainerStatus[] {
  return containers.filter(
    (container) =>
      container.labels[HIVEFORGE_DOCKER_LABELS.runtimeIgnore] !== "true" &&
      (container.labels["com.docker.swarm.service.id"] ? container.state === "running" : true)
  );
}

function serviceReplicasSatisfied(replicas: string | undefined): boolean {
  if (!replicas) {
    return true;
  }
  const match = replicas.match(/^(\d+)\/(\d+)$/);
  if (!match) {
    return true;
  }
  const running = Number.parseInt(match[1], 10);
  const desired = Number.parseInt(match[2], 10);
  return desired === 0 || running === desired;
}

function parseJsonLines<T>(stdout: string): T[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function parseJsonArray<T>(stdout: string): T[] {
  const parsed = JSON.parse(stdout) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Expected Docker inspect JSON array");
  }
  return parsed as T[];
}

function objectField(value: Record<string, unknown>, field: string): Record<string, unknown> {
  const fieldValue = value[field];
  return typeof fieldValue === "object" && fieldValue !== null && !Array.isArray(fieldValue)
    ? (fieldValue as Record<string, unknown>)
    : {};
}

function arrayField(value: Record<string, unknown>, field: string): Array<Record<string, unknown>> {
  const fieldValue = value[field];
  return Array.isArray(fieldValue) ? (fieldValue as Array<Record<string, unknown>>) : [];
}

function stringField(value: Record<string, unknown>, field: string): string {
  return optionalStringField(value, field) ?? "";
}

function optionalStringField(value: Record<string, unknown>, field: string): string | undefined {
  const fieldValue = value[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

function recordOfStrings(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

function parseLabels(raw: string): Record<string, string> {
  if (raw.length === 0) {
    return {};
  }
  return Object.fromEntries(
    raw
      .split(",")
      .map((entry) => entry.trim().split("=", 2))
      .filter((entry): entry is [string, string] => entry.length === 2 && entry[0].length > 0)
  );
}
