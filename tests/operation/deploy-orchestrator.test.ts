import { describe, expect, it } from "vitest";
import { DeployOrchestrator } from "../../src/operation/deploy-orchestrator.js";
import type { ProjectActionService } from "../../src/operation/project-action-service.js";
import type { ProjectInspectionService } from "../../src/operation/project-inspection-service.js";
import type { ProjectValidationService } from "../../src/operation/project-validation-service.js";
import type { ManagedFilesService } from "../../src/operation/managed-files-service.js";
import type { ProjectRegistry } from "../../src/manifest/manifest-types.js";
import type { EnvironmentDefinition } from "../../src/config/environment-types.js";

describe("deploy orchestrator", () => {
  it("runs checkout/inspect, validation, and declared action in order", async () => {
    const calls: string[] = [];
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls),
      validationService(calls),
      actionService(calls),
      managedFilesService(calls)
    );

    const result = await orchestrator.deploy({
      projectId: "hivewatch",
      gitRef: "main",
      component: "api",
      action: "deploy"
    });

    expect(calls).toEqual(["inspect", "validate", "managed_files", "run_action"]);
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

  it("passes profile eligibility context to validation", async () => {
    const calls: unknown[] = [];
    const currentEnvironment = environment({
      runtime: ["docker-swarm"],
      managedRoot: {
        shared: false,
        nodes: ["docker-swarm-mgr-1"]
      },
      placement: true
    });
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls as string[], registryWithProfiles()),
      {
        async validate(request: unknown) {
          calls.push({ validate: request });
          throw new Error("Profile swarm is not eligible for environment local");
        }
      } as unknown as ProjectValidationService,
      actionService(calls as string[]),
      managedFilesService(calls as string[]),
      currentEnvironment
    );

    await expect(
      orchestrator.deploy({
        projectId: "hivewatch",
        gitRef: "main",
        component: "api",
        action: "deploy",
        profile: "swarm"
      })
    ).rejects.toThrow("Profile swarm is not eligible for environment local");
    expect(calls).toEqual([
      "inspect",
      {
        validate: expect.objectContaining({
          deploymentEnvironment: currentEnvironment,
          profile: "swarm"
        })
      }
    ]);
  });

  it("passes missing profile context to validation when environment eligibility is configured", async () => {
    const calls: unknown[] = [];
    const currentEnvironment = environment({
      runtime: ["docker-single"],
      managedRoot: {
        shared: false,
        nodes: ["local-docker"]
      }
    });
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls as string[], registryWithProfiles()),
      {
        async validate(request: unknown) {
          calls.push({ validate: request });
          throw new Error("Missing required profile for profile eligibility validation");
        }
      } as unknown as ProjectValidationService,
      actionService(calls as string[]),
      managedFilesService(calls as string[]),
      currentEnvironment
    );

    await expect(
      orchestrator.deploy({ projectId: "hivewatch", gitRef: "main", component: "api", action: "deploy" })
    ).rejects.toThrow("Missing required profile for profile eligibility validation");
    expect(calls).toEqual([
      "inspect",
      {
        validate: expect.objectContaining({
          deploymentEnvironment: currentEnvironment,
          profile: undefined
        })
      }
    ]);
  });

  it("passes resolved runtime env to validation and action", async () => {
    const calls: unknown[] = [];
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls as string[]),
      {
        async validate(request: unknown) {
          calls.push({ validate: request });
          return {
            operationId: "validate-op",
            report: { ok: true, issues: [] }
          };
        }
      } as unknown as ProjectValidationService,
      {
        async run(request: unknown) {
          calls.push({ run: request });
          return {
            operationId: "action-op",
            stdout: "changed=1",
            stderr: ""
          };
        }
      } as unknown as ProjectActionService,
      managedFilesService(calls as string[]),
      undefined,
      {
        async resolve(scope: unknown) {
          calls.push({ resolveRuntimeEnv: scope });
          return {
            IMAGE_TAG: "latest",
            PUBLIC_URL: "http://local"
          };
        }
      }
    );

    await orchestrator.deploy({
      projectId: "hivewatch",
      gitRef: "main",
      component: "api",
      action: "deploy",
      profile: "test"
    });

    expect(calls).toContainEqual({ resolveRuntimeEnv: { projectId: "hivewatch", profile: "test" } });
    expect(calls).toContainEqual({
      validate: expect.objectContaining({
        environment: {
          IMAGE_TAG: "latest",
          PUBLIC_URL: "http://local",
          HIVEFORGE_PROFILE: "test"
        }
      })
    });
    expect(calls).toContainEqual({
      run: expect.objectContaining({
        environment: expect.objectContaining({
          IMAGE_TAG: "latest",
          PUBLIC_URL: "http://local",
          HIVEFORGE_PROFILE: "test",
          HIVEFORGE_PROJECT_DIR: "/data/deployed/hivewatch",
          HIVEFORGE_STACK_DIR: "/data/deployed/hivewatch/stacks",
          HIVEFORGE_ARTIFACTS_DIR: "/data/deployed/hivewatch/artifacts"
        })
      })
    });
  });
});

function inspectionService(calls: string[], projectRegistry = registry()): ProjectInspectionService {
  return {
    async inspect() {
      calls.push("inspect");
      return {
        operationId: "inspect-op",
        projectId: "hivewatch",
        repository: "https://github.com/sepa79/HiveWatch.git",
        gitRef: "main",
        workspacePath: "/workspace",
        registry: projectRegistry
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

function managedFilesService(calls: string[]): ManagedFilesService {
  return {
    async prepare() {
      calls.push("managed_files");
      return {
        projectDir: "/data/deployed/hivewatch",
        stackDir: "/data/deployed/hivewatch/stacks",
        artifactsDir: "/data/deployed/hivewatch/artifacts",
        prepared: []
      };
    }
  } as unknown as ManagedFilesService;
}

function registry(): ProjectRegistry {
  return {
    project: {
      name: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      actions: ["deploy"]
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

function registryWithProfiles(): ProjectRegistry {
  return {
    ...registry(),
    project: {
      name: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      actions: ["deploy"],
      profiles: [
        {
          id: "swarm",
          runtime: "docker-swarm",
          serviceSet: "normal",
          requires: {
            managedRoot: {
              required: true,
              shared: true
            },
            capabilities: ["placement"]
          }
        }
      ]
    }
  };
}

function environment(capabilities: EnvironmentDefinition["capabilities"]): EnvironmentDefinition {
  return {
    id: "local",
    name: "Local",
    kind: "local-docker",
    capabilities,
    policy: {
      projects: []
    }
  };
}
