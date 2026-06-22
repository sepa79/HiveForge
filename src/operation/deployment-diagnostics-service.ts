import path from "node:path";
import {
  allowedBindSources,
  inspectComposeBindSources,
  type ComposeBindMountEvidence,
  type ComposeBindSourceValidationResult,
  type ComposeServiceEvidence
} from "./docker-deployment-service.js";
import type { EnvironmentDefinition } from "../config/environment-types.js";
import type { DeploymentComposeResult, DeploymentComposeService } from "./deployment-compose-service.js";
import type {
  DeploymentRuntimeStatusRequest,
  DeploymentRuntimeStatusResult,
  DeploymentRuntimeStatusService,
  RuntimeContainerStatus,
  RuntimeServiceStatus
} from "./deployment-runtime-status-service.js";
import { HIVEFORGE_DOCKER_LABELS } from "./deployment-runtime-status-service.js";
import type { DeploymentStateRecord, DeploymentStateStore } from "./deployment-state-store.js";
import type { RuntimeDiagnosticsReport, RuntimeDiagnosticsService } from "../runtime/runtime-diagnostics-service.js";
import { redactSensitiveText } from "../workspace/command-runner.js";

export type DeploymentDiagnosticsRequest = DeploymentRuntimeStatusRequest;

export interface DeploymentDiagnosticsResult {
  selector: DeploymentDiagnosticsRequest;
  state:
    | {
        status: "present";
        deployment: DeploymentStateRecord;
      }
    | {
        status: "missing";
        reason: string;
      };
  runtime: DeploymentRuntimeStatusResult;
  compose?: DeploymentComposeResult;
  composeValidation:
    | {
        status: "checked";
        result: ComposeBindSourceValidationResult;
      }
    | {
        status: "not_checked";
        reason: string;
      };
  hiveforge: RuntimeDiagnosticsReport;
  analysis: DeploymentDiagnosticsAnalysis;
}

export interface DeploymentDiagnosticsAnalysis {
  summary: "ok" | "degraded" | "missing" | "unknown";
  expected: {
    requiredLabels: Record<string, string>;
    services: ComposeServiceEvidence[];
  };
  actual: {
    containers: Array<{
      name: string;
      composeService?: string;
      image: string;
      state: string;
      health?: string;
      restartCount?: number;
      exitCode?: number;
      error?: string;
    }>;
    services: Array<{
      name: string;
      composeService?: string;
      image: string;
      replicas?: string;
      tasks: Array<{
        name: string;
        node?: string;
        desiredState?: string;
        currentState?: string;
        error?: string;
      }>;
    }>;
  };
  findings: DeploymentDiagnosticFinding[];
}

export interface DeploymentDiagnosticFinding {
  severity: "info" | "warning" | "error";
  type:
    | "missing_state"
    | "missing_resource"
    | "unhealthy_resource"
    | "placement_mismatch"
    | "bind_mount_error"
    | "restart_loop"
    | "repeated_task_failures"
    | "last_exit_hint"
    | "unknown_ownership";
  message: string;
  service?: string;
  runtimeResource?: string;
  node?: string;
  source?: string;
  target?: string;
  evidence?: string[];
}

export class DeploymentDiagnosticsService {
  constructor(
    private readonly deploymentState: DeploymentStateStore,
    private readonly runtimeStatus: DeploymentRuntimeStatusService,
    private readonly deploymentCompose: DeploymentComposeService,
    private readonly runtimeDiagnostics: RuntimeDiagnosticsService,
    private readonly environment: EnvironmentDefinition
  ) {}

  async diagnose(request: DeploymentDiagnosticsRequest): Promise<DeploymentDiagnosticsResult> {
    const [deployment, runtime, hiveforge] = await Promise.all([
      this.resolveDeployment(request),
      this.runtimeStatus.check(request),
      this.runtimeDiagnostics.diagnose()
    ]);

    if (!deployment) {
      return {
        selector: request,
        state: {
          status: "missing",
          reason: "No deployment state matched the requested deployment selector."
        },
        runtime,
        composeValidation: {
          status: "not_checked",
          reason: "No deployment state matched the requested deployment selector."
        },
        hiveforge,
        analysis: analyzeDiagnostics(undefined, runtime, undefined, undefined)
      };
    }

    const compose = await this.deploymentCompose.get(deployment.operationId);
    const composeValidation = await this.validateComposeArtifact(deployment, compose, hiveforge);
    return {
      selector: request,
      state: {
        status: "present",
        deployment
      },
      runtime,
      compose,
      composeValidation,
      hiveforge,
      analysis: analyzeDiagnostics(deployment, runtime, composeValidation, compose)
    };
  }

  private async resolveDeployment(request: DeploymentDiagnosticsRequest): Promise<DeploymentStateRecord | null> {
    if (request.deploymentId) {
      return this.deploymentState.getDeployment(request.deploymentId);
    }
    if (!request.projectId || !request.component) {
      throw new Error("Deployment diagnostics requires deploymentId or projectId and component.");
    }
    return this.deploymentState.findDeployment({
      environment: this.environmentId,
      project: request.projectId,
      component: request.component,
      profile: request.profile
    });
  }

  private async validateComposeArtifact(
    deployment: DeploymentStateRecord,
    compose: DeploymentComposeResult,
    hiveforge: RuntimeDiagnosticsReport
  ): Promise<DeploymentDiagnosticsResult["composeValidation"]> {
    if (compose.status !== "present" || !compose.artifact) {
      return {
        status: "not_checked",
        reason: compose.reason ?? "No readable compose artifact is available for this deployment operation."
      };
    }

    const bindSourceDir = hiveforge.managedRoot.managedDataBindSourceRoot
      ? path.join(hiveforge.managedRoot.managedDataBindSourceRoot, "deployed", deployment.project)
      : undefined;

    try {
      return {
        status: "checked",
        result: await inspectComposeBindSources(compose.artifact.path, bindSourceDir, allowedBindSources(this.environment))
      };
    } catch (error) {
      return {
        status: "not_checked",
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private get environmentId(): string {
    return this.environment.id;
  }
}

function analyzeDiagnostics(
  deployment: DeploymentStateRecord | undefined,
  runtime: DeploymentRuntimeStatusResult,
  composeValidation: DeploymentDiagnosticsResult["composeValidation"] | undefined,
  compose: DeploymentComposeResult | undefined
): DeploymentDiagnosticsAnalysis {
  const expectedServices = composeValidation?.status === "checked" ? composeValidation.result.services : [];
  const findings: DeploymentDiagnosticFinding[] = [];
  const monitoredServices = runtime.services.filter(isMonitoredService);
  const monitoredContainers = runtime.containers.filter(isMonitoredContainer);

  if (!deployment) {
    findings.push({
      severity: "error",
      type: "missing_state",
      message: "No HiveForge deployment state matched the requested selector."
    });
  }

  if (deployment && runtime.summary === "missing") {
    findings.push({
      severity: "error",
      type: "missing_resource",
      message:
        runtime.reason ??
        "No Docker containers or services matched the required HiveForge deployment label. HiveForge does not infer ownership from Docker names."
    });
  }

  if (compose?.status === "missing") {
    findings.push({
      severity: "warning",
      type: "missing_resource",
      message:
        compose.reason ??
        "No recorded Compose/Stack artifact is available, so expected services and bind sources cannot be derived."
    });
  }

  const actualServiceNames = new Set(
    monitoredServices.map((service) => composeServiceName(service.name, deployment?.deploymentName) ?? service.name)
  );
  const actualIgnoredServiceNames = new Set(
    runtime.services
      .filter((service) => !isMonitoredService(service))
      .map((service) => composeServiceName(service.name, deployment?.deploymentName) ?? service.name)
  );
  const actualContainerServiceNames = new Set(
    monitoredContainers
      .map((container) => container.labels["com.docker.compose.service"])
      .filter((serviceName): serviceName is string => typeof serviceName === "string" && serviceName.length > 0)
  );
  const actualIgnoredContainerServiceNames = new Set(
    runtime.containers
      .filter((container) => !isMonitoredContainer(container))
      .map((container) => container.labels["com.docker.compose.service"])
      .filter((serviceName): serviceName is string => typeof serviceName === "string" && serviceName.length > 0)
  );

  for (const expected of expectedServices) {
    if (
      monitoredServices.length > 0 &&
      !actualServiceNames.has(expected.service) &&
      !actualIgnoredServiceNames.has(expected.service)
    ) {
      findings.push({
        severity: "error",
        type: "missing_resource",
        service: expected.service,
        message: `Expected service ${expected.service} from the recorded Compose artifact, but no labelled Docker Swarm service was found.`
      });
    } else if (
      monitoredServices.length === 0 &&
      monitoredContainers.length > 0 &&
      !actualContainerServiceNames.has(expected.service) &&
      !actualIgnoredContainerServiceNames.has(expected.service)
    ) {
      findings.push({
        severity: "warning",
        type: "missing_resource",
        service: expected.service,
        message: `Expected service ${expected.service} from the recorded Compose artifact, but no labelled Docker container could be correlated to that service.`
      });
    }
  }

  for (const service of monitoredServices) {
    const expected = expectedServiceForRuntimeService(expectedServices, service.name, deployment?.deploymentName);
    const serviceReplicasSatisfied = replicasSatisfied(service.replicas);
    if (service.replicas && !serviceReplicasSatisfied) {
      findings.push({
        severity: "error",
        type: "unhealthy_resource",
        service: expected?.service,
        runtimeResource: service.name,
        message: `Docker Swarm service ${service.name} is not at desired replicas: ${service.replicas}.`,
        evidence: [`replicas=${service.replicas}`]
      });
    }

    const failedTasks = serviceReplicasSatisfied
      ? []
      : service.tasks.filter((task) => taskLooksFailed(task.currentState, task.error));
    if (failedTasks.length > 1) {
      findings.push({
        severity: "error",
        type: "repeated_task_failures",
        service: expected?.service,
        runtimeResource: service.name,
        message: `Docker Swarm service ${service.name} has repeated failed tasks while desired replicas are not satisfied.`,
        evidence: failedTasks.map(taskEvidence)
      });
    }

    for (const task of failedTasks) {
      const taskText = [task.currentState, task.error].filter(Boolean).join(" ");
      if (/no suitable node/i.test(taskText)) {
        findings.push({
          severity: "error",
          type: "placement_mismatch",
          service: expected?.service,
          runtimeResource: service.name,
          ...(task.node ? { node: task.node } : {}),
          message: placementMessage(service.name, expected),
          evidence: [taskEvidence(task), ...constraintEvidence(expected)]
        });
      }

      const mountSource = extractBindMountSource(taskText);
      if (mountSource) {
        const mount = findBindMount(expected, mountSource);
        findings.push({
          severity: "error",
          type: "bind_mount_error",
          service: expected?.service,
          runtimeResource: service.name,
          ...(task.node ? { node: task.node } : {}),
          source: mountSource,
          ...(mount?.target ? { target: mount.target } : {}),
          message: bindMountMessage(service.name, mountSource, mount, task.node),
          evidence: [taskEvidence(task)]
        });
      }

      if (taskLooksFailed(task.currentState, task.error) && !/no suitable node/i.test(taskText) && !extractBindMountSource(taskText)) {
        findings.push({
          severity: "warning",
          type: "last_exit_hint",
          service: expected?.service,
          runtimeResource: service.name,
          ...(task.node ? { node: task.node } : {}),
          message: `Docker Swarm task ${task.name} reports ${task.currentState ?? "a failure"} for service ${service.name}.`,
          evidence: [taskEvidence(task)]
        });
      }
    }
  }

  for (const container of monitoredContainers) {
    const composeService = container.labels["com.docker.compose.service"];
    const hasRestartLoopEvidence = (container.restartCount ?? 0) > 0 && ["restarting", "exited", "dead"].includes(container.state);
    if (hasRestartLoopEvidence) {
      findings.push({
        severity: "error",
        type: "restart_loop",
        service: composeService,
        runtimeResource: container.name,
        message: `Docker container ${container.name} has restart count ${container.restartCount} and state ${container.state}.`,
        evidence: containerEvidence(container)
      });
    }
    if (!hasRestartLoopEvidence && ["exited", "dead"].includes(container.state)) {
      findings.push({
        severity: "warning",
        type: "last_exit_hint",
        service: composeService,
        runtimeResource: container.name,
        message: `Docker container ${container.name} is ${container.state}.`,
        evidence: containerEvidence(container)
      });
    }
    if (container.health === "unhealthy") {
      findings.push({
        severity: "error",
        type: "unhealthy_resource",
        service: composeService,
        runtimeResource: container.name,
        message: `Docker container ${container.name} reports unhealthy health status.`,
        evidence: containerEvidence(container)
      });
    }
    if ((container.exitCode ?? 0) !== 0 || container.error) {
      findings.push({
        severity: "warning",
        type: "last_exit_hint",
        service: composeService,
        runtimeResource: container.name,
        message: `Docker container ${container.name} has last exit evidence.`,
        evidence: containerEvidence(container)
      });
    }
  }

  if (runtime.summary === "unknown" && findings.length === 0) {
    findings.push({
      severity: "warning",
      type: "unknown_ownership",
      message: "Docker runtime status is unknown for labelled resources."
    });
  }

  return {
    summary: analysisSummary(runtime.summary, findings),
    expected: {
      requiredLabels: runtime.requiredLabels,
      services: expectedServices
    },
    actual: {
      containers: runtime.containers.map((container) => ({
        name: container.name,
        ...(container.labels["com.docker.compose.service"]
          ? { composeService: container.labels["com.docker.compose.service"] }
          : {}),
        image: container.image,
        state: container.state,
        ...(container.health ? { health: container.health } : {}),
        ...(container.restartCount !== undefined ? { restartCount: container.restartCount } : {}),
        ...(container.exitCode !== undefined ? { exitCode: container.exitCode } : {}),
        ...(container.error ? { error: container.error } : {})
      })),
      services: runtime.services.map((service) => ({
        name: service.name,
        ...(composeServiceName(service.name, deployment?.deploymentName)
          ? { composeService: composeServiceName(service.name, deployment?.deploymentName) }
          : {}),
        image: service.image,
        ...(service.replicas ? { replicas: service.replicas } : {}),
        tasks: service.tasks.map((task) => ({
          name: task.name,
          ...(task.node ? { node: task.node } : {}),
          ...(task.desiredState ? { desiredState: task.desiredState } : {}),
          ...(task.currentState ? { currentState: task.currentState } : {}),
          ...(task.error ? { error: task.error } : {})
        }))
      }))
    },
    findings
  };
}

function isMonitoredService(service: RuntimeServiceStatus): boolean {
  return service.labels[HIVEFORGE_DOCKER_LABELS.runtimeIgnore] !== "true";
}

function isMonitoredContainer(container: RuntimeContainerStatus): boolean {
  return container.labels[HIVEFORGE_DOCKER_LABELS.runtimeIgnore] !== "true";
}

function analysisSummary(
  runtimeSummary: DeploymentRuntimeStatusResult["summary"],
  findings: DeploymentDiagnosticFinding[]
): DeploymentDiagnosticsAnalysis["summary"] {
  if (findings.some((finding) => finding.type === "missing_state") || runtimeSummary === "missing") {
    return "missing";
  }
  if (findings.some((finding) => finding.severity === "error" || finding.severity === "warning")) {
    return "degraded";
  }
  if (runtimeSummary === "running") {
    return "ok";
  }
  return "unknown";
}

function composeServiceName(runtimeName: string, deploymentName: string | undefined): string | undefined {
  if (!deploymentName) {
    return undefined;
  }
  const swarmPrefix = `${deploymentName}_`;
  if (runtimeName.startsWith(swarmPrefix)) {
    return runtimeName.slice(swarmPrefix.length).split(".")[0];
  }
  const composePrefix = `${deploymentName}-`;
  if (runtimeName.startsWith(composePrefix)) {
    return runtimeName.slice(composePrefix.length).split("-")[0];
  }
  return undefined;
}

function expectedServiceForRuntimeService(
  expectedServices: ComposeServiceEvidence[],
  runtimeServiceName: string,
  deploymentName: string | undefined
): ComposeServiceEvidence | undefined {
  const serviceName = composeServiceName(runtimeServiceName, deploymentName) ?? runtimeServiceName;
  return expectedServices.find((service) => service.service === serviceName);
}

function replicasSatisfied(replicas: string | undefined): boolean {
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

function taskLooksFailed(currentState: string | undefined, error: string | undefined): boolean {
  return Boolean(error) || /failed|rejected|shutdown|orphaned/i.test(currentState ?? "");
}

function taskEvidence(task: { name: string; node?: string; currentState?: string; desiredState?: string; error?: string }): string {
  return redactSensitiveText([
    `task=${task.name}`,
    task.node ? `node=${task.node}` : undefined,
    task.desiredState ? `desired=${task.desiredState}` : undefined,
    task.currentState ? `current=${task.currentState}` : undefined,
    task.error ? `error=${task.error}` : undefined
  ]
    .filter((part): part is string => Boolean(part))
    .join(" "));
}

function containerEvidence(container: {
  name: string;
  state: string;
  health?: string;
  restartCount?: number;
  exitCode?: number;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
}): string[] {
  return [
    `container=${container.name}`,
    `state=${container.state}`,
    container.health ? `health=${container.health}` : undefined,
    container.restartCount !== undefined ? `restartCount=${container.restartCount}` : undefined,
    container.exitCode !== undefined ? `exitCode=${container.exitCode}` : undefined,
    container.error ? `error=${redactSensitiveText(container.error)}` : undefined,
    container.startedAt ? `startedAt=${container.startedAt}` : undefined,
    container.finishedAt ? `finishedAt=${container.finishedAt}` : undefined
  ].filter((part): part is string => Boolean(part));
}

function placementMessage(runtimeServiceName: string, expected: ComposeServiceEvidence | undefined): string {
  const constraints = expected?.placementConstraints ?? [];
  if (constraints.length > 0) {
    return `Docker Swarm cannot place service ${runtimeServiceName}; rendered Compose declares placement constraints: ${constraints.join(", ")}.`;
  }
  return `Docker Swarm cannot place service ${runtimeServiceName}; Docker reported no suitable node.`;
}

function constraintEvidence(expected: ComposeServiceEvidence | undefined): string[] {
  return expected?.placementConstraints.map((constraint) => `constraint=${constraint}`) ?? [];
}

function extractBindMountSource(value: string): string | undefined {
  const patterns = [
    /bind source path does not exist:\s*([^\s]+)/i,
    /source path does not exist:\s*([^\s]+)/i,
    /mount source path does not exist:\s*([^\s]+)/i,
    /invalid mount config[^:]*:\s*.*?([/][^\s]+)/i
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/[.,;]+$/, "");
    }
  }
  return undefined;
}

function findBindMount(expected: ComposeServiceEvidence | undefined, source: string): ComposeBindMountEvidence | undefined {
  return expected?.bindMounts.find((mount) => mount.source === source);
}

function bindMountMessage(
  runtimeServiceName: string,
  source: string,
  mount: ComposeBindMountEvidence | undefined,
  node: string | undefined
): string {
  return [
    `Docker reported a bind mount failure for service ${runtimeServiceName}: ${source}.`,
    mount?.target ? `Rendered target is ${mount.target}.` : undefined,
    node ? `The failing task was scheduled on ${node}.` : undefined
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}
