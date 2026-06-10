import path from "node:path";
import { inspectComposeBindSources, type ComposeBindSourceValidationResult } from "./docker-deployment-service.js";
import type { DeploymentComposeResult, DeploymentComposeService } from "./deployment-compose-service.js";
import type {
  DeploymentRuntimeStatusRequest,
  DeploymentRuntimeStatusResult,
  DeploymentRuntimeStatusService
} from "./deployment-runtime-status-service.js";
import type { DeploymentStateRecord, DeploymentStateStore } from "./deployment-state-store.js";
import type { RuntimeDiagnosticsReport, RuntimeDiagnosticsService } from "../runtime/runtime-diagnostics-service.js";

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
}

export class DeploymentDiagnosticsService {
  constructor(
    private readonly deploymentState: DeploymentStateStore,
    private readonly runtimeStatus: DeploymentRuntimeStatusService,
    private readonly deploymentCompose: DeploymentComposeService,
    private readonly runtimeDiagnostics: RuntimeDiagnosticsService,
    private readonly environmentId: string
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
        hiveforge
      };
    }

    const compose = await this.deploymentCompose.get(deployment.operationId);
    return {
      selector: request,
      state: {
        status: "present",
        deployment
      },
      runtime,
      compose,
      composeValidation: await this.validateComposeArtifact(deployment, compose, hiveforge),
      hiveforge
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
        result: await inspectComposeBindSources(compose.artifact.path, bindSourceDir)
      };
    } catch (error) {
      return {
        status: "not_checked",
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
