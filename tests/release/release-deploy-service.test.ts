import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EnvironmentPolicyService } from "../../src/config/environment-policy.js";
import type { EnvironmentDefinition } from "../../src/config/environment-types.js";
import type { ManagedFilesService } from "../../src/operation/managed-files-service.js";
import type { ProjectInspectionService } from "../../src/operation/project-inspection-service.js";
import { ReleaseDeployService } from "../../src/release/release-deploy-service.js";
import type { ReleaseDeployOperationRequest } from "../../src/release/release-deploy-service.js";

describe("release deploy service", () => {
  it("prepares a release deploy plan from project, environment, and release vars", async () => {
    const service = new ReleaseDeployService({
      environment: environment({
        vars: {
          "imageRepository.project": "registry.lan:5000/pockethive"
        }
      }),
      environmentPolicy: new EnvironmentPolicyService(environment())
    });

    const result = await service.prepare(request());

    expect(result.environmentId).toBe("local");
    expect(result.plan.images[0]).toEqual({
      name: "orchestrator",
      image: "registry.lan:5000/pockethive/orchestrator:dev-20260521-1415-gd6819e34",
      application: true
    });
  });

  it("fails on invalid release inputs before policy/profile checks need to recover", async () => {
    const service = new ReleaseDeployService({
      environment: environment(),
      environmentPolicy: new EnvironmentPolicyService(environment())
    });

    await expect(
      service.prepare(
        request({
          releaseVars: {
            "release.imageTag": "latest"
          }
        })
      )
    ).rejects.toThrow("release.imageTag must not be latest");
  });

  it("preserves environment policy checks", async () => {
    const service = new ReleaseDeployService({
      environment: environment(),
      environmentPolicy: new EnvironmentPolicyService(environment())
    });

    await expect(service.prepare(request({ action: "upgrade" }))).rejects.toThrow(
      "Action is not allowed on environment local for pockethive: upgrade"
    );
  });

  it("preserves profile capability checks", async () => {
    const service = new ReleaseDeployService({
      environment: environment({
        capabilities: {
          runtime: ["docker-single"],
          managedRoot: {
            shared: false,
            nodes: ["local-docker"]
          }
        }
      }),
      environmentPolicy: new EnvironmentPolicyService(environment())
    });

    await expect(service.prepare(request())).rejects.toThrow("Profile swarm-reduced is not eligible for environment local");
  });

  it("requires an explicit profile when environment eligibility validation is configured", async () => {
    const service = new ReleaseDeployService({
      environment: environment(),
      environmentPolicy: new EnvironmentPolicyService(environment())
    });

    await expect(service.prepare(request({ profile: undefined }))).rejects.toThrow(
      "Missing required profile for environment local: pockethive"
    );
  });

  it("rejects mismatched project metadata", async () => {
    const service = new ReleaseDeployService();

    await expect(
      service.prepare(
        request({
          project: {
            ...project(),
            id: "other"
          }
        })
      )
    ).rejects.toThrow("Release project metadata does not match request project: other != pockethive");
  });

  it("prepares managed runtime files from a checked out project before release validation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hiveforge-release-"));
    const projectDir = path.join(root, "deployed", "pockethive");
    const artifactsDir = path.join(projectDir, "artifacts");
    await mkdir(path.join(projectDir, "artifacts", "pockethive-runtime", "compose"), { recursive: true });
    await writeFile(path.join(projectDir, "artifacts", "pockethive-runtime", "compose", "docker-compose.yml"), "services: {}\n");

    const calls: string[] = [];
    const service = new ReleaseDeployService({
      environment: environment(),
      environmentPolicy: new EnvironmentPolicyService(environment()),
      inspection: inspectionService(calls),
      managedFiles: managedFilesService(calls, { projectDir, artifactsDir })
    });

    const result = await service.prepare({
      ...request({ project: undefined }),
      gitRef: "v1.2.3",
      requiredFiles: ["artifacts/pockethive-runtime/compose/docker-compose.yml"]
    });

    expect(calls).toEqual(["inspect", "managed_files"]);
    expect(result.inspection?.gitRef).toBe("v1.2.3");
    expect(result.managedFiles?.projectDir).toBe(projectDir);
    expect(result.releaseVarsFile).toBe(path.join(artifactsDir, "release-vars.json"));
    expect(result.plan.env).toMatchObject({
      HIVEFORGE_RENDERED_COMPOSE_FILE: path.join(projectDir, "stacks", "compose.yml"),
      HIVEFORGE_RELEASE_VARS_FILE: path.join(artifactsDir, "release-vars.json")
    });
    expect(result.plan.env).not.toHaveProperty("HIVEFORGE_PROJECT_DIR");
    expect(result.plan.env).not.toHaveProperty("HIVEFORGE_STACK_DIR");
    expect(result.plan.env).not.toHaveProperty("HIVEFORGE_ARTIFACTS_DIR");
    await expect(readFile(path.join(artifactsDir, "release-vars.json"), "utf8")).resolves.toContain(
      '"release.imageTag": "dev-20260521-1415-gd6819e34"'
    );
  });

  it("fails checkout release preparation when a required runtime file is missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "hiveforge-release-"));
    const projectDir = path.join(root, "deployed", "pockethive");
    const artifactsDir = path.join(projectDir, "artifacts");
    await mkdir(artifactsDir, { recursive: true });

    const service = new ReleaseDeployService({
      environment: environment(),
      environmentPolicy: new EnvironmentPolicyService(environment()),
      inspection: inspectionService([]),
      managedFiles: managedFilesService([], { projectDir, artifactsDir })
    });

    await expect(
      service.prepare({
        ...request({ project: undefined }),
        gitRef: "v1.2.3",
        requiredFiles: ["artifacts/pockethive-runtime/compose/docker-compose.yml"]
      })
    ).rejects.toThrow("Required runtime file missing: artifacts/pockethive-runtime/compose/docker-compose.yml");
  });
});

function request(overrides: Partial<ReleaseDeployOperationRequest> = {}): ReleaseDeployOperationRequest {
  return {
    projectId: "pockethive",
    component: "stack",
    action: "deploy",
    profile: "swarm-reduced",
    project: project(),
    releaseVars: {
      "release.imageTag": "dev-20260521-1415-gd6819e34"
    },
    images: [
      {
        name: "orchestrator",
        image: "{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}",
        application: true
      }
    ],
    ...overrides
  };
}

function project(): ReleaseDeployOperationRequest["project"] {
  return {
    id: "pockethive",
    vars: {
      "imageRepository.project": "ghcr.io/sepa79/pockethive",
      "extRepository.docker": "docker.io",
      "extRepository.ghcr": "ghcr.io"
    },
    profiles: [
      {
        id: "swarm-reduced",
        runtime: "docker-swarm",
        serviceSet: "reduced",
        requires: {
          managedRoot: {
            required: true,
            shared: true
          },
          capabilities: ["placement"]
        }
      }
    ]
  };
}

function inspectionService(calls: string[]): ProjectInspectionService {
  return {
    async inspect(request: { projectId: string; gitRef: string }) {
      calls.push("inspect");
      return {
        operationId: "inspect-op",
        projectId: request.projectId,
        repository: "https://github.com/sepa79/PocketHive.git",
        gitRef: request.gitRef,
        workspacePath: "/workspace/pockethive",
        registry: {
          project: {
            name: "pockethive",
            repository: "https://github.com/sepa79/PocketHive.git",
            actions: ["deploy"],
            vars: {
              "imageRepository.project": "registry.lan:5000/pockethive",
              "extRepository.docker": "docker.io",
              "extRepository.ghcr": "ghcr.io"
            },
            profiles: project()?.profiles
          },
          artifacts: {
            managedPaths: [
              {
                name: "runtime-compose",
                source: "deploy/hiveforge/runtime/compose",
                target: "artifacts/pockethive-runtime/compose",
                mode: "replace"
              }
            ]
          },
          components: []
        }
      };
    }
  } as unknown as ProjectInspectionService;
}

function managedFilesService(
  calls: string[],
  dirs: { projectDir: string; artifactsDir: string }
): ManagedFilesService {
  return {
    async prepare() {
      calls.push("managed_files");
      return {
        projectDir: dirs.projectDir,
        stackDir: path.join(dirs.projectDir, "stacks"),
        artifactsDir: dirs.artifactsDir,
        renderedComposeFile: path.join(dirs.projectDir, "stacks", "compose.yml"),
        prepared: [
          {
            name: "runtime-compose",
            source: "/workspace/pockethive/deploy/hiveforge/runtime/compose",
            target: path.join(dirs.projectDir, "artifacts", "pockethive-runtime", "compose")
          }
        ]
      };
    }
  } as unknown as ManagedFilesService;
}

function environment(overrides: Partial<EnvironmentDefinition> = {}): EnvironmentDefinition {
  return {
    id: "local",
    name: "Local Swarm",
    kind: "swarm",
    capabilities: {
      runtime: ["docker-swarm"],
      managedRoot: {
        shared: true
      },
      placement: true
    },
    policy: {
      projects: [
        {
          id: "pockethive",
          profiles: ["swarm-reduced"],
          actions: ["deploy"]
        }
      ]
    },
    ...overrides
  };
}
