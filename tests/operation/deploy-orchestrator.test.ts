import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DeployOrchestrator } from "../../src/operation/deploy-orchestrator.js";
import type { ProjectActionService } from "../../src/operation/project-action-service.js";
import type { ProjectInspectionService } from "../../src/operation/project-inspection-service.js";
import type { ProjectValidationService } from "../../src/operation/project-validation-service.js";
import type { ManagedFilesService } from "../../src/operation/managed-files-service.js";
import type { ProjectRegistry } from "../../src/manifest/manifest-types.js";
import type { EnvironmentDefinition } from "../../src/config/environment-types.js";
import type { DeploymentStateRecord, DeploymentStateStore } from "../../src/operation/deployment-state-store.js";
import type { DeploymentExecutor } from "../../src/operation/deployment-executor.js";

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
          HIVEFORGE_BIND_SOURCE_DIR: "/srv/hiveforge/data/deployed/hivewatch"
        })
      })
    });
    const runCall = calls.find((call): call is { run: { environment: Record<string, string> } } =>
      typeof call === "object" && call !== null && "run" in call
    );
    expect(runCall?.run).toMatchObject({
      managedFiles: expect.objectContaining({
        actionRoot: "/hf",
        actionRootSource: "/srv/hiveforge/data/deployed/hivewatch"
      })
    });
    expect(runCall?.run.environment).not.toHaveProperty("HIVEFORGE_RENDERED_COMPOSE_FILE");
    expect(runCall?.run.environment).not.toHaveProperty("HIVEFORGE_PROJECT_DIR");
    expect(runCall?.run.environment).not.toHaveProperty("HIVEFORGE_STACK_DIR");
    expect(runCall?.run.environment).not.toHaveProperty("HIVEFORGE_ARTIFACTS_DIR");
  });

  it("deploys rendered compose through HiveForge after the action renders it", async () => {
    const calls: unknown[] = [];
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls as string[]),
      validationService(calls as string[]),
      actionServiceThatRunsAfterHook(calls),
      managedFilesService(calls as string[]),
      environment({
        runtime: ["docker-single"],
        managedRoot: {
          shared: true
        }
      }),
      undefined,
      deploymentState(calls),
      dockerDeployment(calls)
    );

    const result = await orchestrator.deploy({
      projectId: "hivewatch",
      gitRef: "main",
      component: "api",
      action: "deploy",
      environmentId: "local",
      profile: "test"
    });

    expect(result.action).toEqual({
      operationId: "action-op",
      deploymentId: "deployment-1",
      stdout: "changed=1",
      stderr: ""
    });
    expect(calls).toEqual([
      "inspect",
      "validate",
      "managed_files",
      "run_action",
      {
        ensureDeployment: expect.objectContaining({
          environment: "local",
          project: "hivewatch",
          component: "api",
          profile: "test",
          operationId: "action-op"
        })
      },
      {
        dockerDeploy: {
          deployment: expect.objectContaining({
            deploymentId: "deployment-1",
            deploymentName: "hivewatch",
            executorKind: "docker-direct",
            project: "hivewatch",
            component: "api",
            profile: "test"
          }),
          composeFile: expect.stringMatching(/compose\.yml$/),
          bindSourceDir: "/srv/hiveforge/data/deployed/hivewatch"
        }
      },
      {
        recordLifecycleAction: expect.objectContaining({
          environment: "local",
          project: "hivewatch",
          component: "api",
          action: "deploy",
          operationId: "action-op"
        })
      }
    ]);
  });

  it("passes an explicit deployment name to the HiveForge Docker deploy step", async () => {
    const calls: unknown[] = [];
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls as string[]),
      validationService(calls as string[]),
      actionServiceThatRunsAfterHook(calls),
      managedFilesService(calls as string[]),
      environment({
        runtime: ["docker-single"],
        managedRoot: {
          shared: true
        }
      }),
      undefined,
      deploymentState(calls),
      dockerDeployment(calls)
    );

    await orchestrator.deploy({
      projectId: "hivewatch",
      gitRef: "main",
      component: "api",
      action: "deploy",
      environmentId: "local",
      deploymentName: "hivewatch-canary"
    });

    expect(calls).toContainEqual({
      ensureDeployment: expect.objectContaining({
        deploymentName: "hivewatch-canary"
      })
    });
    expect(calls).toContainEqual({
      dockerDeploy: {
        deployment: expect.objectContaining({
          deploymentId: "deployment-1",
          deploymentName: "hivewatch-canary",
          executorKind: "docker-direct"
        }),
        composeFile: expect.stringMatching(/compose\.yml$/),
        bindSourceDir: "/srv/hiveforge/data/deployed/hivewatch"
      }
    });
  });

  it("records failed deployment state when HiveForge Docker deploy fails", async () => {
    const calls: unknown[] = [];
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls as string[]),
      validationService(calls as string[]),
      actionServiceThatRunsAfterHook(calls),
      managedFilesService(calls as string[]),
      environment({
        runtime: ["docker-single"],
        managedRoot: {
          shared: true
        }
      }),
      undefined,
      deploymentState(calls),
      {
        async deploy() {
          calls.push("docker_deploy_failed");
          throw new Error("Docker bind source path does not exist");
        }
      } as unknown as DeploymentExecutor
    );

    await expect(
      orchestrator.deploy({
        projectId: "hivewatch",
        gitRef: "main",
        component: "api",
        action: "deploy",
        environmentId: "local"
      })
    ).rejects.toThrow("Docker bind source path does not exist");
    expect(calls).toContainEqual({
      recordDeploymentFailure: expect.objectContaining({
        environment: "local",
        project: "hivewatch",
        component: "api",
        action: "deploy",
        operationId: "action-op",
        reason: "Docker bind source path does not exist"
      })
    });
  });

  it("reconciles a stale missing runtime to gone before redeploying the slot", async () => {
    const calls: unknown[] = [];
    const stale = deploymentRecord({
      deploymentName: "hivewatch-old",
      executorKind: "portainer-stack",
      status: "deployed",
      portainer: {
        endpointId: 3,
        stackId: 41,
        stackName: "hivewatch-old"
      }
    });
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls as string[]),
      validationService(calls as string[]),
      actionServiceThatRunsAfterHook(calls),
      managedFilesService(calls as string[]),
      environment({
        capabilities: {
          runtime: ["docker-swarm"],
          managedRoot: {
            shared: true
          }
        },
        deployment: {
          executor: "portainer-stack",
          portainer: {
            baseUrl: "https://portainer.example.com/api",
            endpointId: 9,
            apiKey: "ptr_test_token"
          }
        }
      }),
      undefined,
      deploymentState(calls, stale),
      dockerDeployment(calls),
      runtimeStatus(calls, "missing")
    );

    await orchestrator.deploy({
      projectId: "hivewatch",
      gitRef: "main",
      component: "api",
      action: "deploy",
      environmentId: "local",
      deploymentName: "hivewatch-canary"
    });

    expect(calls).toContainEqual({
      runtimeStatus: { deploymentId: "deployment-1" }
    });
    expect(calls).toContainEqual({
      markGone: {
        deploymentId: "deployment-1",
        updatedAt: "2026-05-17T10:00:00.000Z"
      }
    });
    expect(calls).toContainEqual({
      ensureDeployment: expect.objectContaining({
        deploymentName: "hivewatch-canary",
        executorKind: "portainer-stack"
      })
    });
  });

  it("removes HiveForge-owned Docker deployments without preparing managed files", async () => {
    const calls: unknown[] = [];
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls as string[], registryWithRemoveAction()),
      validationService(calls as string[]),
      actionService(calls as string[]),
      managedFilesService(calls as string[]),
      environment({
        runtime: ["docker-swarm"],
        managedRoot: {
          shared: true
        }
      }),
      undefined,
      deploymentState(calls),
      dockerDeployment(calls)
    );

    const result = await orchestrator.deploy({
      projectId: "hivewatch",
      gitRef: "main",
      component: "api",
      action: "remove",
      environmentId: "swarm",
      profile: "test"
    });

    expect(result.action).toMatchObject({
      deploymentId: "deployment-1",
      stdout: "",
      stderr: ""
    });
    expect(calls).toEqual([
      "inspect",
      "validate",
      {
        ensureDeployment: expect.objectContaining({
          environment: "swarm",
          project: "hivewatch",
          component: "api",
          profile: "test",
          action: "remove"
        })
      },
      {
        dockerRemove: {
          deployment: expect.objectContaining({
            deploymentId: "deployment-1",
            deploymentName: "hivewatch",
            executorKind: "docker-direct",
            project: "hivewatch",
            component: "api",
            profile: "test"
          })
        }
      },
      {
        recordLifecycleAction: expect.objectContaining({
          environment: "swarm",
          project: "hivewatch",
          component: "api",
          action: "remove"
        })
      }
    ]);
  });

  it("closes the inspection workspace after a successful inactive lifecycle action", async () => {
    const calls: unknown[] = [];
    const orchestrator = new DeployOrchestrator(
      inspectionServiceWithLease(calls as string[], registryWithRemoveAction()),
      validationService(calls as string[]),
      actionService(calls as string[]),
      managedFilesService(calls as string[]),
      environment({
        runtime: ["docker-swarm"],
        managedRoot: {
          shared: true
        }
      }),
      undefined,
      deploymentState(calls),
      dockerDeployment(calls)
    );

    await orchestrator.deploy({
      projectId: "hivewatch",
      gitRef: "main",
      component: "api",
      action: "remove",
      environmentId: "swarm"
    });

    expect(calls).toContain("close_workspace:completed");
  });

  it("marks missing runtime as gone and skips executor removal", async () => {
    const calls: unknown[] = [];
    const stale = deploymentRecord({
      status: "deployed"
    });
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls as string[], registryWithRemoveAction()),
      validationService(calls as string[]),
      actionService(calls as string[]),
      managedFilesService(calls as string[]),
      environment({
        runtime: ["docker-swarm"],
        managedRoot: {
          shared: true
        }
      }),
      undefined,
      deploymentState(calls, stale),
      dockerDeployment(calls),
      runtimeStatus(calls, "missing")
    );

    const result = await orchestrator.deploy({
      projectId: "hivewatch",
      gitRef: "main",
      component: "api",
      action: "remove",
      environmentId: "swarm",
      profile: "test"
    });

    expect(result.action).toMatchObject({
      deploymentId: "deployment-1",
      stdout: "",
      stderr: ""
    });
    expect(calls).toContainEqual({
      markGone: {
        deploymentId: "deployment-1",
        updatedAt: expect.any(String)
      }
    });
    expect(calls).not.toContainEqual(expect.objectContaining({ dockerRemove: expect.anything() }));
    expect(calls).not.toContainEqual(expect.objectContaining({ recordLifecycleAction: expect.anything() }));
  });

  it("marks a previously removed missing runtime as gone before purge", async () => {
    const calls: unknown[] = [];
    const stale = deploymentRecord({
      status: "removed",
      lastAction: "remove",
      executorKind: "portainer-stack",
      portainer: {
        endpointId: 3,
        stackId: 41,
        stackName: "hivewatch"
      }
    });
    const removeExecutor: DeploymentExecutor = {
      executorKind: "portainer-stack",
      async deploy() {
        throw new Error("deploy should not be called");
      },
      async remove(input: unknown) {
        calls.push({ executorRemove: input });
        return {
          runtime: "docker-swarm",
          executorKind: "portainer-stack",
          stdout: "",
          stderr: ""
        };
      }
    };
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls as string[], registryWithPurgeAction()),
      validationService(calls as string[]),
      actionService(calls as string[]),
      managedFilesService(calls as string[]),
      environment({
        runtime: ["docker-swarm"],
        managedRoot: {
          shared: true
        }
      }),
      undefined,
      deploymentState(calls, stale),
      removeExecutor,
      runtimeStatus(calls, "missing")
    );

    const result = await orchestrator.deploy({
      projectId: "hivewatch",
      gitRef: "main",
      component: "api",
      action: "purge",
      environmentId: "swarm",
      profile: "test"
    });

    expect(result.action).toMatchObject({
      deploymentId: "deployment-1",
      stdout: "",
      stderr: ""
    });
    expect(calls).toContainEqual({
      markGone: {
        deploymentId: "deployment-1",
        updatedAt: expect.any(String)
      }
    });
    expect(calls).not.toContainEqual(expect.objectContaining({ ensureDeployment: expect.anything() }));
    expect(calls).not.toContainEqual(expect.objectContaining({ executorRemove: expect.anything() }));
    expect(calls).not.toContainEqual(expect.objectContaining({ recordLifecycleAction: expect.anything() }));
  });

  it("does not reconcile failed slots to gone when runtime is missing", async () => {
    const calls: unknown[] = [];
    const stale = deploymentRecord({
      status: "failed"
    });
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls as string[]),
      validationService(calls as string[]),
      actionServiceThatRunsAfterHook(calls),
      managedFilesService(calls as string[]),
      environment({
        runtime: ["docker-swarm"],
        managedRoot: {
          shared: true
        }
      }),
      undefined,
      deploymentState(calls, stale),
      dockerDeployment(calls),
      runtimeStatus(calls, "missing")
    );

    await orchestrator.deploy({
      projectId: "hivewatch",
      gitRef: "main",
      component: "api",
      action: "deploy",
      environmentId: "local"
    });

    expect(calls).not.toContainEqual(expect.objectContaining({ markGone: expect.anything() }));
    expect(calls).not.toContainEqual(expect.objectContaining({ runtimeStatus: expect.anything() }));
  });

  it("rejects inactive lifecycle actions that are not declared by the component", async () => {
    const calls: unknown[] = [];
    const orchestrator = new DeployOrchestrator(
      inspectionService(calls as string[]),
      validationService(calls as string[]),
      actionService(calls as string[]),
      managedFilesService(calls as string[]),
      environment({
        runtime: ["docker-swarm"],
        managedRoot: {
          shared: true
        }
      }),
      undefined,
      deploymentState(calls),
      dockerDeployment(calls)
    );

    await expect(
      orchestrator.deploy({
        projectId: "hivewatch",
        gitRef: "main",
        component: "api",
        action: "purge",
        environmentId: "swarm"
      })
    ).rejects.toThrow("Action is not declared for api: purge");
    expect(calls).toEqual(["inspect", "validate"]);
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

function inspectionServiceWithLease(calls: string[], projectRegistry = registry()): ProjectInspectionService {
  return {
    async inspect() {
      calls.push("inspect");
      return {
        operationId: "inspect-op",
        projectId: "hivewatch",
        repository: "https://github.com/sepa79/HiveWatch.git",
        gitRef: "main",
        workspacePath: "/workspace",
        registry: projectRegistry,
        async closeWorkspace(state = "completed") {
          calls.push(`close_workspace:${state}`);
        }
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

function actionServiceThatRunsAfterHook(calls: unknown[]): ProjectActionService {
  return {
    async run(request: { afterRun?: (context: { operationId: string; endedAt: string }) => Promise<{ deploymentId?: string } | void> }) {
      calls.push("run_action");
      const afterRun = await request.afterRun?.({
        operationId: "action-op",
        endedAt: "2026-05-17T10:00:00.000Z"
      });
      return {
        operationId: "action-op",
        ...(afterRun?.deploymentId ? { deploymentId: afterRun.deploymentId } : {}),
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
      const root = await mkdtemp(path.join(os.tmpdir(), "hf-managed-files-"));
      const projectDir = path.join(root, "data/deployed/hivewatch");
      const stackDir = path.join(projectDir, "stacks");
      const artifactsDir = path.join(projectDir, "artifacts");
      const renderedComposeFile = path.join(stackDir, "compose.yml");
      await mkdir(stackDir, { recursive: true });
      await mkdir(artifactsDir, { recursive: true });
      await writeFile(
        renderedComposeFile,
        [
          "services:",
          "  api:",
          "    image: hivewatch:test",
          "    volumes:",
          "      - /srv/hiveforge/data/deployed/hivewatch/config:/config",
          ""
        ].join("\n"),
        "utf8"
      );
      return {
        projectDir: "/data/deployed/hivewatch",
        stackDir: "/data/deployed/hivewatch/stacks",
        artifactsDir: "/data/deployed/hivewatch/artifacts",
        renderedComposeFile,
        actionRoot: "/hf",
        actionRenderedComposeFile: "/hf/stacks/compose.yml",
        actionRootSource: "/srv/hiveforge/data/deployed/hivewatch",
        workspaceSource: "/srv/hiveforge/workspace/hivewatch",
        bindSourceDir: "/srv/hiveforge/data/deployed/hivewatch",
        prepared: []
      };
    }
  } as unknown as ManagedFilesService;
}

function deploymentState(calls: unknown[], existing: DeploymentStateRecord | null = null): DeploymentStateStore {
  let current = existing;
  return {
    async listDeployments() {
      return current ? [current] : [];
    },
    async getDeployment(deploymentId) {
      return current?.deploymentId === deploymentId ? current : null;
    },
    async findDeployment() {
      return current;
    },
    async ensureDeployment(input) {
      calls.push({ ensureDeployment: input });
      current = {
        deploymentId: current?.deploymentId ?? "deployment-1",
        deploymentName: input.deploymentName ?? "hivewatch",
        environment: input.environment,
        project: input.project,
        repository: input.repository,
        gitRef: input.gitRef,
        component: input.component,
        ...(input.profile ? { profile: input.profile } : {}),
        executorKind: input.executorKind,
        ...(input.portainer ? { portainer: input.portainer } : {}),
        status: "preparing",
        lastAction: input.action,
        operationId: input.operationId,
        updatedAt: input.updatedAt
      };
      return current;
    },
    async markGone(deploymentId, updatedAt) {
      calls.push({ markGone: { deploymentId, updatedAt } });
      if (!current || current.deploymentId !== deploymentId) {
        return null;
      }
      current = {
        ...current,
        status: "gone",
        updatedAt
      };
      delete current.portainer;
      return current;
    },
    async recordLifecycleAction(input) {
      calls.push({ recordLifecycleAction: input });
      current = {
        deploymentId: current?.deploymentId ?? "deployment-1",
        deploymentName: input.deploymentName ?? "hivewatch",
        environment: input.environment,
        project: input.project,
        repository: input.repository,
        gitRef: input.gitRef,
        component: input.component,
        ...(input.profile ? { profile: input.profile } : {}),
        executorKind: input.executorKind,
        ...(input.portainer ? { portainer: input.portainer } : {}),
        status: "deployed",
        lastAction: input.action,
        operationId: input.operationId,
        updatedAt: input.updatedAt
      };
      return current;
    },
    async recordDeploymentFailure(input) {
      calls.push({ recordDeploymentFailure: input });
      current = {
        deploymentId: current?.deploymentId ?? "deployment-1",
        deploymentName: input.deploymentName ?? "hivewatch",
        environment: input.environment,
        project: input.project,
        repository: input.repository,
        gitRef: input.gitRef,
        component: input.component,
        ...(input.profile ? { profile: input.profile } : {}),
        executorKind: input.executorKind,
        ...(input.portainer ? { portainer: input.portainer } : {}),
        status: "failed",
        lastAction: input.action,
        operationId: input.operationId,
        updatedAt: input.updatedAt
      };
      return current;
    }
  };
}

function runtimeStatus(calls: unknown[], summary: "missing" | "running") {
  return {
    async check(request: unknown) {
      calls.push({ runtimeStatus: request });
      return {
        deploymentId: "deployment-1",
        deploymentName: "hivewatch",
        projectId: "hivewatch",
        component: "api",
        summary,
        requiredLabels: {
          "hiveforge.deployment": "deployment-1"
        },
        containers: [],
        services: []
      };
    }
  };
}

function deploymentRecord(overrides: Partial<DeploymentStateRecord> = {}): DeploymentStateRecord {
  return {
    deploymentId: "deployment-1",
    deploymentName: "hivewatch",
    environment: "local",
    project: "hivewatch",
    repository: "https://github.com/sepa79/HiveWatch.git",
    gitRef: "main",
    component: "api",
    profile: "test",
    executorKind: "docker-direct",
    status: "deployed",
    lastAction: "deploy",
    operationId: "op-1",
    updatedAt: "2026-05-17T09:00:00.000Z",
    ...overrides
  };
}

function dockerDeployment(calls: unknown[]): DeploymentExecutor {
  return {
    executorKind: "docker-direct",
    async deploy(input: unknown) {
      calls.push({ dockerDeploy: input });
      return {
        composeFile: "/data/deployed/hivewatch/stacks/compose.yml",
        runtime: "docker-single",
        executorKind: "docker-direct",
        stdout: "deployed",
        stderr: ""
      };
    },
    async remove(input: unknown) {
      calls.push({ dockerRemove: input });
      return {
        runtime: "docker-swarm",
        executorKind: "docker-direct",
        stdout: "removed",
        stderr: ""
      };
    }
  };
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

function registryWithRemoveAction(): ProjectRegistry {
  return {
    ...registry(),
    project: {
      name: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      actions: ["deploy", "remove"]
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
              },
              remove: {
                playbook: "ansible/remove.yml"
              }
            }
          }
        }
      }
    ]
  };
}

function registryWithPurgeAction(): ProjectRegistry {
  return {
    ...registry(),
    project: {
      name: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      actions: ["deploy", "remove", "purge"]
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
              },
              remove: {
                playbook: "ansible/remove.yml"
              },
              purge: {
                playbook: "ansible/purge.yml"
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

function environment(
  input:
    | EnvironmentDefinition["capabilities"]
    | (Partial<EnvironmentDefinition> & { capabilities: EnvironmentDefinition["capabilities"] })
): EnvironmentDefinition {
  const overrides = "capabilities" in input ? input : { capabilities: input };
  const { capabilities, ...rest } = overrides;
  return {
    id: "local",
    name: "Local",
    kind: "local-docker",
    capabilities,
    policy: {
      projects: []
    },
    ...rest
  };
}
