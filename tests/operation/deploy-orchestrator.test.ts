import { describe, expect, it } from "vitest";
import { DeployOrchestrator } from "../../src/operation/deploy-orchestrator.js";
import type { ProjectActionService } from "../../src/operation/project-action-service.js";
import type { ProjectInspectionService } from "../../src/operation/project-inspection-service.js";
import type { ProjectValidationService } from "../../src/operation/project-validation-service.js";
import type { ProjectRegistry } from "../../src/manifest/manifest-types.js";

describe("deploy orchestrator", () => {
  it("runs checkout/inspect, validation, and declared action in order", async () => {
    const calls: string[] = [];
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls),
      validationService(calls),
      actionService(calls)
    );

    const result = await orchestrator.deploy({
      projectId: "hivewatch",
      gitRef: "main",
      component: "api",
      action: "deploy"
    });

    expect(calls).toEqual(["inspect", "validate", "run_action"]);
    expect(result.inspection.operationId).toBe("inspect-op");
    expect(result.validation.operationId).toBe("validate-op");
    expect(result.action.operationId).toBe("action-op");
  });

  it("does not validate or run action when inspection fails", async () => {
    const calls: string[] = [];
    const orchestrator = new DeployOrchestrator(
      {
        async inspect() {
          calls.push("inspect");
          throw new Error("Root manifest missing or invalid");
        }
      } as unknown as ProjectInspectionService,
      validationService(calls),
      actionService(calls)
    );

    await expect(
      orchestrator.deploy({ projectId: "hivewatch", gitRef: "main", component: "api", action: "deploy" })
    ).rejects.toThrow("Root manifest missing or invalid");
    expect(calls).toEqual(["inspect"]);
  });

  it("does not run action when validation fails", async () => {
    const calls: string[] = [];
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls),
      {
        async validate() {
          calls.push("validate");
          throw new Error("Missing Docker secret for api: hivewatch-api-token");
        }
      } as unknown as ProjectValidationService,
      actionService(calls)
    );

    await expect(
      orchestrator.deploy({ projectId: "hivewatch", gitRef: "main", component: "api", action: "deploy" })
    ).rejects.toThrow("Missing Docker secret for api: hivewatch-api-token");
    expect(calls).toEqual(["inspect", "validate"]);
  });
});

function inspectionService(calls: string[]): ProjectInspectionService {
  return {
    async inspect() {
      calls.push("inspect");
      return {
        operationId: "inspect-op",
        projectId: "hivewatch",
        repository: "https://github.com/sepa79/HiveWatch.git",
        gitRef: "main",
        workspacePath: "/workspace",
        registry: registry()
      };
    }
  } as unknown as ProjectInspectionService;
}

function validationService(calls: string[]): ProjectValidationService {
  return {
    async validate() {
      calls.push("validate");
      return {
        operationId: "validate-op",
        report: {
          ok: true,
          issues: []
        }
      };
    }
  } as unknown as ProjectValidationService;
}

function actionService(calls: string[]): ProjectActionService {
  return {
    async run() {
      calls.push("run_action");
      return {
        operationId: "action-op",
        stdout: "changed=1",
        stderr: ""
      };
    }
  } as unknown as ProjectActionService;
}

function registry(): ProjectRegistry {
  return {
    project: {
      name: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git"
    },
    components: [
      {
        name: "api",
        manifestPath: "components/api/hiveforge.yaml",
        manifest: {
          kind: "component",
          component: {
            name: "api",
            project: "hivewatch"
          },
          deployment: {
            adapter: "ansible",
            actions: {
              deploy: {
                playbook: "ansible/deploy.yml"
              }
            }
          }
        }
      }
    ]
  };
}
