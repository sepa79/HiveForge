import path from "node:path";
import type { EnvironmentDefinition, EnvironmentNode } from "../config/environment-types.js";
import type { CommandRunner } from "../workspace/command-runner.js";

export type ManagedRootVerificationStatus = "verified" | "failed" | "inconclusive" | "unknown";

export interface ManagedRootVerificationNode {
  hostname: string;
  status: Exclude<ManagedRootVerificationStatus, "unknown">;
  reason: string;
}

export interface ManagedRootVerificationReport {
  status: ManagedRootVerificationStatus;
  checkedAt: string;
  runtime: "docker-single" | "docker-swarm";
  bindSourceRoot?: string;
  managedDataBindSourceRoot?: string;
  nodes: ManagedRootVerificationNode[];
  reason: string;
  cleanupError?: string;
}

export interface ManagedRootVerificationOptions {
  probeImage?: string;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
  maxPolls?: number;
  pollDelayMs?: number;
  probeId?: () => string;
}

const DEFAULT_MAX_POLLS = 40;
const DEFAULT_POLL_DELAY_MS = 250;
const PROBE_COMMAND = ["sh", "-ec", "test -d /probe && test -r /probe"];

export class ManagedRootVerificationService {
  private readonly now: () => Date;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly maxPolls: number;
  private readonly pollDelayMs: number;
  private readonly probeId: () => string;

  constructor(
    private readonly commandRunner: CommandRunner,
    private readonly environment: EnvironmentDefinition,
    private readonly options: ManagedRootVerificationOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.maxPolls = options.maxPolls ?? DEFAULT_MAX_POLLS;
    this.pollDelayMs = options.pollDelayMs ?? DEFAULT_POLL_DELAY_MS;
    this.probeId = options.probeId ?? (() => crypto.randomUUID());
  }

  async verify(): Promise<ManagedRootVerificationReport> {
    const checkedAt = this.now().toISOString();
    const bindSourceRoot = this.environment.capabilities.managedRoot.bindSourceRoot;
    if (!bindSourceRoot) {
      return {
        status: "unknown",
        checkedAt,
        runtime: runtimeFor(this.environment),
        nodes: [],
        reason: "Cannot verify managed-root visibility because capabilities.managedRoot.bindSourceRoot is not configured."
      };
    }

    const probeImage = this.options.probeImage?.trim();
    if (!probeImage) {
      return {
        status: "unknown",
        checkedAt,
        runtime: runtimeFor(this.environment),
        bindSourceRoot,
        managedDataBindSourceRoot: managedDataBindSourceRoot(bindSourceRoot),
        nodes: [],
        reason: "Cannot verify managed-root visibility because HIVEFORGE_MANAGED_ROOT_PROBE_IMAGE is not configured."
      };
    }

    return runtimeFor(this.environment) === "docker-swarm"
      ? this.verifySwarm(checkedAt, bindSourceRoot, probeImage)
      : this.verifySingle(checkedAt, bindSourceRoot, probeImage);
  }

  private async verifySingle(
    checkedAt: string,
    bindSourceRoot: string,
    probeImage: string
  ): Promise<ManagedRootVerificationReport> {
    const source = managedDataBindSourceRoot(bindSourceRoot);
    try {
      await this.commandRunner.run("docker", [
        "run",
        "--rm",
        "--mount",
        bindMount(source),
        probeImage,
        ...PROBE_COMMAND
      ]);
      return {
        status: "verified",
        checkedAt,
        runtime: "docker-single",
        bindSourceRoot,
        managedDataBindSourceRoot: source,
        nodes: [
          {
            hostname: this.environment.id,
            status: "verified",
            reason: "Read-only Docker bind mount was accessible."
          }
        ],
        reason: "Managed-root bind-source visibility is verified on the current Docker host."
      };
    } catch (error) {
      const reason = errorMessage(error);
      return {
        status: "failed",
        checkedAt,
        runtime: "docker-single",
        bindSourceRoot,
        managedDataBindSourceRoot: source,
        nodes: [
          {
            hostname: this.environment.id,
            status: "failed",
            reason
          }
        ],
        reason: `Managed-root bind-source verification failed on the current Docker host: ${reason}`
      };
    }
  }

  private async verifySwarm(
    checkedAt: string,
    bindSourceRoot: string,
    probeImage: string
  ): Promise<ManagedRootVerificationReport> {
    const source = managedDataBindSourceRoot(bindSourceRoot);
    const nodes = activeReadyNodes(this.environment);
    if (nodes.length === 0) {
      return {
        status: "unknown",
        checkedAt,
        runtime: "docker-swarm",
        bindSourceRoot,
        managedDataBindSourceRoot: source,
        nodes: [],
        reason: "Cannot verify managed-root visibility because current Swarm node inventory has no active ready nodes. Refresh the environment first."
      };
    }

    const probeId = this.probeId();
    const serviceName = `hiveforge-managed-root-probe-${probeId}`;
    let created = false;
    let cleanupError: string | undefined;
    let result: ManagedRootVerificationReport;
    try {
      await this.commandRunner.run("docker", [
        "service",
        "create",
        "--name",
        serviceName,
        "--mode",
        "global",
        "--restart-condition",
        "none",
        "--mount",
        bindMount(source),
        "--label",
        `hiveforge.managed-root-probe=${probeId}`,
        probeImage,
        ...PROBE_COMMAND
      ]);
      created = true;
      const probeResult = await this.waitForSwarmTasks(serviceName, nodes);
      result = {
        ...probeResult,
        checkedAt,
        runtime: "docker-swarm",
        bindSourceRoot,
        managedDataBindSourceRoot: source
      };
    } catch (error) {
      const reason = errorMessage(error);
      result = {
        status: "inconclusive",
        checkedAt,
        runtime: "docker-swarm",
        bindSourceRoot,
        managedDataBindSourceRoot: source,
        nodes: nodes.map((node) => ({ hostname: node.hostname, status: "inconclusive", reason })),
        reason: `Managed-root Swarm probe could not run: ${reason}`
      };
    }

    if (created) {
      try {
        await this.commandRunner.run("docker", ["service", "rm", serviceName]);
      } catch (error) {
        cleanupError = errorMessage(error);
      }
    }
    if (cleanupError) {
      return {
        ...result,
        status: "inconclusive",
        reason: `Managed-root Swarm probe completed but temporary service cleanup failed: ${cleanupError}`,
        cleanupError
      };
    }
    return result;
  }

  private async waitForSwarmTasks(
    serviceName: string,
    nodes: EnvironmentNode[]
  ): Promise<Omit<ManagedRootVerificationReport, "checkedAt" | "runtime" | "bindSourceRoot" | "managedDataBindSourceRoot">> {
    let tasks: SwarmProbeTask[] = [];
    for (let attempt = 0; attempt < this.maxPolls; attempt += 1) {
      tasks = await listSwarmProbeTasks(this.commandRunner, serviceName);
      const statuses = nodeStatuses(nodes, tasks);
      if (statuses.every((node) => node.status === "verified" || node.status === "failed")) {
        return reportFromNodeStatuses(statuses);
      }
      if (attempt < this.maxPolls - 1) {
        await this.sleep(this.pollDelayMs);
      }
    }

    return reportFromNodeStatuses(nodeStatuses(nodes, tasks));
  }
}

interface SwarmProbeTask {
  Node?: string;
  CurrentState?: string;
  Error?: string;
}

async function listSwarmProbeTasks(commandRunner: CommandRunner, serviceName: string): Promise<SwarmProbeTask[]> {
  const result = await commandRunner.run("docker", ["service", "ps", serviceName, "--no-trunc", "--format", "{{json .}}"]);
  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => parseTask(line));
}

function parseTask(line: string): SwarmProbeTask {
  try {
    const task = JSON.parse(line) as unknown;
    if (typeof task !== "object" || task === null || Array.isArray(task)) {
      throw new Error("not an object");
    }
    return task as SwarmProbeTask;
  } catch {
    throw new Error("Docker Swarm probe returned an invalid task record.");
  }
}

function nodeStatuses(nodes: EnvironmentNode[], tasks: SwarmProbeTask[]): ManagedRootVerificationNode[] {
  return nodes.map((node) => nodeStatus(node, tasks.filter((task) => task.Node === node.hostname)));
}

function nodeStatus(node: EnvironmentNode, tasks: SwarmProbeTask[]): ManagedRootVerificationNode {
  const task = tasks.at(0);
  if (!task) {
    return {
      hostname: node.hostname,
      status: "inconclusive",
      reason: "Probe task has not been scheduled on this active ready node."
    };
  }

  const state = task.CurrentState ?? "unknown";
  if (state.toLowerCase().startsWith("complete")) {
    return {
      hostname: node.hostname,
      status: "verified",
      reason: "Read-only Docker bind mount was accessible."
    };
  }
  if (state.toLowerCase().startsWith("failed") || state.toLowerCase().startsWith("rejected")) {
    return {
      hostname: node.hostname,
      status: "failed",
      reason: task.Error || state
    };
  }
  return {
    hostname: node.hostname,
    status: "inconclusive",
    reason: task.Error || state
  };
}

function reportFromNodeStatuses(
  nodes: ManagedRootVerificationNode[]
): Omit<ManagedRootVerificationReport, "checkedAt" | "runtime" | "bindSourceRoot" | "managedDataBindSourceRoot"> {
  if (nodes.every((node) => node.status === "verified")) {
    return {
      status: "verified",
      nodes,
      reason: "Managed-root bind-source visibility is verified on every active ready Swarm node."
    };
  }
  if (nodes.some((node) => node.status === "failed")) {
    return {
      status: "failed",
      nodes,
      reason: "Managed-root bind-source verification failed on one or more active ready Swarm nodes."
    };
  }
  return {
    status: "inconclusive",
    nodes,
    reason: "Managed-root Swarm probe did not reach a terminal result for every active ready node before timeout."
  };
}

function activeReadyNodes(environment: EnvironmentDefinition): EnvironmentNode[] {
  return environment.nodes?.filter((node) => node.availability === "active" && node.status.toLowerCase() === "ready") ?? [];
}

function runtimeFor(environment: EnvironmentDefinition): "docker-single" | "docker-swarm" {
  return environment.capabilities.runtime.includes("docker-swarm") ? "docker-swarm" : "docker-single";
}

function managedDataBindSourceRoot(bindSourceRoot: string): string {
  return path.join(bindSourceRoot, "data");
}

function bindMount(source: string): string {
  return `type=bind,src=${source},dst=/probe,readonly`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
