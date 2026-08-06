import { constants } from "node:fs";
import { access, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EnvironmentDefinition } from "../config/environment-types.js";
import type { ManagedRootVerificationReport, ManagedRootVerificationStatus } from "./managed-root-verification-service.js";
import type { RuntimePaths } from "./runtime-paths.js";

export type PathDiagnosticStatus = "present" | "missing" | "inaccessible";
export type ManagedRootVisibilityStatus = "configured" | "unknown" | ManagedRootVerificationStatus;

export interface PathDiagnostic {
  path: string;
  status: PathDiagnosticStatus;
  readable: boolean;
  writable: boolean;
  reason?: string;
}

export interface RuntimeDiagnosticsReport {
  runtimeRoot?: PathDiagnostic;
  derivedPaths: {
    registry: PathDiagnostic;
    environments?: PathDiagnostic;
    workspace: PathDiagnostic;
    journal: PathDiagnostic;
    dataRoot: PathDiagnostic;
    runtimeEnv: PathDiagnostic;
    stateDb: PathDiagnostic;
  };
  environment?: {
    id: string;
    name: string;
    kind: string;
  };
  managedRoot: {
    controlPlanePath: string;
    bindSourceRoot?: string;
    managedDataBindSourceRoot?: string;
    shared: boolean;
    nodes?: string[];
    visibilityStatus: ManagedRootVisibilityStatus;
    reason: string;
    verification?: ManagedRootVerificationReport;
  };
  actionContractPaths: {
    exposedToProjectActions: string[];
    hiddenFromProjectActions: string[];
  };
}

export class RuntimeDiagnosticsService {
  constructor(
    private readonly runtimePaths: RuntimePaths,
    private readonly currentEnvironment: EnvironmentDefinition | undefined
  ) {}

  async recordManagedRootVerification(verification: ManagedRootVerificationReport): Promise<void> {
    const target = managedRootVerificationPath(this.runtimePaths);
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(verification)}\n`, "utf8");
    await rename(temporary, target);
  }

  async diagnose(): Promise<RuntimeDiagnosticsReport> {
    const managedRoot = this.currentEnvironment?.capabilities.managedRoot;
    const controlPlanePath = this.runtimePaths.dataRoot;
    const bindSourceRoot = managedRoot?.bindSourceRoot;
    const managedDataBindSourceRoot = bindSourceRoot ? path.join(bindSourceRoot, "data") : undefined;
    const verification = await loadManagedRootVerification(this.runtimePaths);

    return {
      ...(this.runtimePaths.runtimeRoot
        ? {
            runtimeRoot: await diagnosePath(this.runtimePaths.runtimeRoot)
          }
        : {}),
      derivedPaths: {
        registry: await diagnosePath(this.runtimePaths.registry),
        ...(this.runtimePaths.environments ? { environments: await diagnosePath(this.runtimePaths.environments) } : {}),
        workspace: await diagnosePath(this.runtimePaths.workspace),
        journal: await diagnosePath(this.runtimePaths.journal),
        dataRoot: await diagnosePath(this.runtimePaths.dataRoot),
        runtimeEnv: await diagnosePath(this.runtimePaths.runtimeEnv),
        stateDb: await diagnosePath(this.runtimePaths.stateDb)
      },
      ...(this.currentEnvironment
        ? {
            environment: {
              id: this.currentEnvironment.id,
              name: this.currentEnvironment.name,
              kind: this.currentEnvironment.kind
            }
          }
        : {}),
      managedRoot: {
        controlPlanePath,
        ...(bindSourceRoot ? { bindSourceRoot } : {}),
        ...(managedDataBindSourceRoot ? { managedDataBindSourceRoot } : {}),
        shared: managedRoot?.shared ?? false,
        ...(managedRoot?.nodes ? { nodes: managedRoot.nodes } : {}),
        visibilityStatus: managedRootVisibilityStatus(this.currentEnvironment, bindSourceRoot, verification),
        reason: managedRootVisibilityReason(this.currentEnvironment, bindSourceRoot, verification),
        ...(matchingVerification(this.currentEnvironment, bindSourceRoot, verification)
          ? { verification: verification! }
          : {})
      },
      actionContractPaths: {
        exposedToProjectActions: ["/hf", "/hf/stacks/compose.yml", "HIVEFORGE_BIND_SOURCE_DIR"],
        hiddenFromProjectActions: [
          "HIVEFORGE_DATA_ROOT",
          "HIVEFORGE_RENDERED_COMPOSE_FILE",
          "HIVEFORGE_PROJECT_DIR",
          "HIVEFORGE_STACK_DIR",
          "HIVEFORGE_ARTIFACTS_DIR",
          "HIVEFORGE_PROJECT_HOST_DIR",
          "HIVEFORGE_STACK_HOST_DIR",
          "HIVEFORGE_ARTIFACTS_HOST_DIR"
        ]
      }
    };
  }
}

function managedRootVerificationPath(runtimePaths: RuntimePaths): string {
  return path.join(runtimePaths.dataRoot, "managed-root-verification.json");
}

async function loadManagedRootVerification(runtimePaths: RuntimePaths): Promise<ManagedRootVerificationReport | undefined> {
  const target = managedRootVerificationPath(runtimePaths);
  let raw: string;
  try {
    raw = await readFile(target, "utf8");
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw new Error(`Could not read managed-root verification evidence: ${errorMessage(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Managed-root verification evidence is not valid JSON: ${errorMessage(error)}`);
  }
  if (!isManagedRootVerificationReport(parsed)) {
    throw new Error("Managed-root verification evidence has an invalid shape.");
  }
  return parsed;
}

function isManagedRootVerificationReport(value: unknown): value is ManagedRootVerificationReport {
  if (!isRecord(value) || !isVerificationStatus(value.status) || typeof value.checkedAt !== "string" || !isRuntime(value.runtime)) {
    return false;
  }
  if (!Array.isArray(value.nodes) || !value.nodes.every(isVerificationNode) || typeof value.reason !== "string") {
    return false;
  }
  return (
    (value.bindSourceRoot === undefined || typeof value.bindSourceRoot === "string") &&
    (value.managedDataBindSourceRoot === undefined || typeof value.managedDataBindSourceRoot === "string") &&
    (value.cleanupError === undefined || typeof value.cleanupError === "string")
  );
}

function isVerificationStatus(value: unknown): value is ManagedRootVerificationStatus {
  return value === "verified" || value === "failed" || value === "inconclusive" || value === "unknown";
}

function isRuntime(value: unknown): boolean {
  return value === "docker-single" || value === "docker-swarm";
}

function isVerificationNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.hostname === "string" &&
    (value.status === "verified" || value.status === "failed" || value.status === "inconclusive") &&
    typeof value.reason === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function matchingVerification(
  environment: EnvironmentDefinition | undefined,
  bindSourceRoot: string | undefined,
  verification: ManagedRootVerificationReport | undefined
): boolean {
  if (!environment || !verification || verification.bindSourceRoot !== bindSourceRoot || verification.runtime !== runtimeFor(environment)) {
    return false;
  }
  return sameNodeScope(verification.nodes.map((node) => node.hostname), verificationNodeScope(environment));
}

function managedRootVisibilityStatus(
  environment: EnvironmentDefinition | undefined,
  bindSourceRoot: string | undefined,
  verification: ManagedRootVerificationReport | undefined
): ManagedRootVisibilityStatus {
  if (matchingVerification(environment, bindSourceRoot, verification) && verification) {
    return verification.status;
  }
  return bindSourceRoot ? "configured" : "unknown";
}

function managedRootVisibilityReason(
  environment: EnvironmentDefinition | undefined,
  bindSourceRoot: string | undefined,
  verification: ManagedRootVerificationReport | undefined
): string {
  if (matchingVerification(environment, bindSourceRoot, verification) && verification) {
    return verification.reason;
  }
  if (bindSourceRoot && verification?.bindSourceRoot === bindSourceRoot) {
    return "Stored managed-root verification does not cover the current runtime node scope; run verify_managed_root_access again.";
  }
  return bindSourceRoot
    ? "Docker bind-source root is configured in environment capabilities; run verify_managed_root_access for an active per-node check."
    : "No Docker bind-source managedRoot.bindSourceRoot is configured; Docker bind-source visibility on runtime nodes is unknown.";
}

function runtimeFor(environment: EnvironmentDefinition): "docker-single" | "docker-swarm" {
  return environment.kind === "swarm" ? "docker-swarm" : "docker-single";
}

function verificationNodeScope(environment: EnvironmentDefinition): string[] {
  if (environment.kind !== "swarm") {
    return [environment.id];
  }
  return (environment.nodes ?? [])
    .filter((node) => node.availability === "active" && node.status.toLowerCase() === "ready")
    .map((node) => node.hostname);
}

function sameNodeScope(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((hostname, index) => hostname === sortedRight[index]);
}

async function diagnosePath(targetPath: string): Promise<PathDiagnostic> {
  try {
    await stat(targetPath);
  } catch (error) {
    return {
      path: targetPath,
      status: "missing",
      readable: false,
      writable: false,
      reason: errorMessage(error)
    };
  }

  const readable = await canAccess(targetPath, constants.R_OK);
  const writable = await canAccess(targetPath, constants.W_OK);
  return {
    path: targetPath,
    status: readable || writable ? "present" : "inaccessible",
    readable,
    writable,
    ...(!readable && !writable ? { reason: "Path exists but is not readable or writable" } : {})
  };
}

async function canAccess(targetPath: string, mode: number): Promise<boolean> {
  try {
    await access(targetPath, mode);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
