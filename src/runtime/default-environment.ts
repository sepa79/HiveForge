import YAML from "yaml";
import type {
  EnvironmentConfig,
  EnvironmentDefinition,
  EnvironmentNode
} from "../config/environment-types.js";
import type { CommandRunner } from "../workspace/command-runner.js";

export interface DefaultEnvironmentOptions {
  docker?: CommandRunner;
  managedRoot?: {
    bindSourceRoot?: string;
  };
}

interface DockerSwarmInfo {
  LocalNodeState?: string;
  ControlAvailable?: boolean;
}

interface DockerNodeInspect {
  ID?: string;
  Description?: {
    Hostname?: string;
  };
  Spec?: {
    Role?: string;
    Availability?: string;
    Labels?: Record<string, string>;
  };
  Status?: {
    State?: string;
  };
}

export async function createDefaultEnvironmentYaml(options: DefaultEnvironmentOptions = {}): Promise<string> {
  return YAML.stringify(await createDefaultEnvironmentConfig(options));
}

export async function createDefaultEnvironmentConfig(
  options: DefaultEnvironmentOptions = {}
): Promise<EnvironmentConfig> {
  if (!options.docker) {
    return dockerHostEnvironmentConfig(options.managedRoot);
  }

  const swarm = await inspectDockerSwarm(options.docker);
  if (!swarm.active) {
    return dockerHostEnvironmentConfig(options.managedRoot);
  }

  if (!swarm.manager) {
    throw new Error(
      "Docker Swarm is active but this node is not a manager; run HiveForge on a Swarm manager or provide environments.yaml explicitly."
    );
  }

  const nodes = await inspectDockerSwarmNodes(options.docker);
  return dockerSwarmEnvironmentConfig(nodes, options.managedRoot);
}

function dockerHostEnvironmentConfig(managedRootPaths: DefaultEnvironmentOptions["managedRoot"]): EnvironmentConfig {
  return {
    current: "docker",
    environments: [
      {
        id: "docker",
        name: "Docker host",
        kind: "docker",
        capabilities: {
          runtime: ["docker-single"],
          managedRoot: {
            shared: true,
            ...managedRootPaths
          }
        },
        policy: {
          projects: []
        }
      }
    ]
  };
}

function dockerSwarmEnvironmentConfig(
  nodes: EnvironmentNode[],
  managedRootPaths: DefaultEnvironmentOptions["managedRoot"]
): EnvironmentConfig {
  return {
    current: "swarm",
    environments: [
      {
        id: "swarm",
        name: "Docker Swarm",
        kind: "swarm",
        capabilities: {
          runtime: ["docker-swarm"],
          managedRoot: {
            shared: true,
            ...managedRootPaths
          },
          placement: true
        },
        nodes,
        policy: {
          projects: []
        }
      }
    ]
  };
}

async function inspectDockerSwarm(docker: CommandRunner): Promise<{ active: boolean; manager: boolean }> {
  const result = await docker
    .run("docker", ["info", "--format", "{{json .Swarm}}"])
    .catch((error: unknown) => {
      throw new Error(`Failed to inspect Docker Swarm state: ${errorMessage(error)}`);
    });
  const info = parseJsonObject<DockerSwarmInfo>(result.stdout, "Docker Swarm info");
  const state = info.LocalNodeState;
  if (state === "inactive") {
    return { active: false, manager: false };
  }
  if (state !== "active") {
    throw new Error(`Docker Swarm state is ${state ?? "unknown"}; cannot autodetect Swarm nodes.`);
  }
  return { active: true, manager: info.ControlAvailable === true };
}

async function inspectDockerSwarmNodes(docker: CommandRunner): Promise<EnvironmentNode[]> {
  const list = await docker.run("docker", ["node", "ls", "-q"]).catch((error: unknown) => {
    throw new Error(`Failed to list Docker Swarm nodes: ${errorMessage(error)}`);
  });
  const nodeIds = list.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (nodeIds.length === 0) {
    throw new Error("Docker Swarm node autodetection returned no nodes.");
  }

  const inspect = await docker.run("docker", ["node", "inspect", ...nodeIds]).catch((error: unknown) => {
    throw new Error(`Failed to inspect Docker Swarm nodes: ${errorMessage(error)}`);
  });
  const nodes = parseJsonArray<DockerNodeInspect>(inspect.stdout, "Docker Swarm node inspect").map(toEnvironmentNode);
  if (nodes.length === 0) {
    throw new Error("Docker Swarm node inspect returned no nodes.");
  }
  return nodes.sort((left, right) => left.hostname.localeCompare(right.hostname) || left.id.localeCompare(right.id));
}

function toEnvironmentNode(node: DockerNodeInspect): EnvironmentNode {
  const id = requiredString(node.ID, "Docker Swarm node id");
  const hostname = requiredString(node.Description?.Hostname, `Docker Swarm node ${id} hostname`);
  return {
    id,
    hostname,
    role: parseNodeRole(node.Spec?.Role, hostname),
    availability: parseNodeAvailability(node.Spec?.Availability, hostname),
    status: requiredString(node.Status?.State, `Docker Swarm node ${hostname} status`),
    labels: node.Spec?.Labels ?? {}
  };
}

function parseNodeRole(role: string | undefined, hostname: string): EnvironmentNode["role"] {
  if (role === "manager" || role === "worker") {
    return role;
  }
  throw new Error(`Docker Swarm node ${hostname} has unsupported role: ${role ?? "unknown"}`);
}

function parseNodeAvailability(
  availability: string | undefined,
  hostname: string
): EnvironmentNode["availability"] {
  if (availability === "active" || availability === "pause" || availability === "drain") {
    return availability;
  }
  throw new Error(`Docker Swarm node ${hostname} has unsupported availability: ${availability ?? "unknown"}`);
}

function parseJsonObject<T>(value: string, label: string): T {
  const parsed = parseJson(value, label);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} did not return a JSON object.`);
  }
  return parsed as T;
}

function parseJsonArray<T>(value: string, label: string): T[] {
  const parsed = parseJson(value, label);
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} did not return a JSON array.`);
  }
  return parsed as T[];
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${errorMessage(error)}`);
  }
}

function requiredString(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing ${label}.`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
