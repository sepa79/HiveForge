import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import type { EnvironmentDefinition } from "../config/environment-types.js";
import type { RuntimePaths } from "./runtime-paths.js";

export type PathDiagnosticStatus = "present" | "missing" | "inaccessible";
export type ManagedRootVisibilityStatus = "configured" | "unknown";

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

  async diagnose(): Promise<RuntimeDiagnosticsReport> {
    const managedRoot = this.currentEnvironment?.capabilities.managedRoot;
    const controlPlanePath = this.runtimePaths.dataRoot;
    const bindSourceRoot = managedRoot?.bindSourceRoot;
    const managedDataBindSourceRoot = bindSourceRoot ? path.join(bindSourceRoot, "data") : undefined;

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
        visibilityStatus: bindSourceRoot ? "configured" : "unknown",
        reason: bindSourceRoot
          ? "Docker bind-source root is configured in environment capabilities; active per-node access is not verified by this check."
          : "No Docker bind-source managedRoot.bindSourceRoot is configured; Docker bind-source visibility on runtime nodes is unknown."
      },
      actionContractPaths: {
        exposedToProjectActions: ["HIVEFORGE_RENDERED_COMPOSE_FILE", "HIVEFORGE_BIND_SOURCE_DIR"],
        hiddenFromProjectActions: [
          "HIVEFORGE_DATA_ROOT",
          "HIVEFORGE_PROJECT_DIR",
          "HIVEFORGE_PROJECT_HOST_DIR"
        ]
      }
    };
  }
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
