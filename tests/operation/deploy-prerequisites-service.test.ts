import { describe, expect, it } from "vitest";
import type { EnvironmentDefinition } from "../../src/config/environment-types.js";
import type { RuntimeEnvStore } from "../../src/config/runtime-env-store.js";
import type { ProjectRegistry } from "../../src/manifest/manifest-types.js";
import { DeployPrerequisitesService } from "../../src/operation/deploy-prerequisites-service.js";
import type { ProjectInspectionService } from "../../src/operation/project-inspection-service.js";
import type { RequirementValidator } from "../../src/validation/requirement-validator.js";

describe("deploy prerequisites service", () => {
  it("returns an explicit checklist without creating missing resources", async () => {
    const service = new DeployPrerequisitesService(
      {
        projects: [
          {
            id: "hivewatch",
            name: "HiveWatch",
            source: "github",
            repository: "https://github.com/sepa79/HiveWatch.git",
            approvedRefs: ["main"]
          }
        ]
      },
      inspection(registry()),
      validator([
        {
          component: "api",
          requirementType: "volume",
          name: "hivewatch-api-data",
          message: "Missing Docker volume for api: hivewatch-api-data"
        },
        {
          component: "api",
          requirementType: "secret",
          name: "hivewatch-api-token",
          message: "Missing Docker secret for api: hivewatch-api-token"
        },
        {
          component: "api",
          requirementType: "environment",
          name: "HIVEWATCH_API_PORT",
          message: "Missing environment variable for api: HIVEWATCH_API_PORT"
        }
      ]),
      runtimeEnv({}),
      environment()
    );

    await expect(
      service.explain({
        projectId: "hivewatch",
        gitRef: "main",
        component: "api",
        action: "deploy",
        profile: "normal"
      })
    ).resolves.toMatchObject({
      ready: false,
      manualPrerequisites: [
        {
          type: "docker_volume",
          required: "hivewatch-api-data",
          status: "missing"
        },
        {
          type: "docker_secret",
          required: "hivewatch-api-token",
          status: "missing"
        }
      ],
      hiveforgePrerequisites: expect.arrayContaining([
        {
          type: "project_registration",
          required: "hivewatch",
          status: "present",
          reason: "Project is registered in HiveForge"
        },
        {
          type: "environment_policy",
          required: "hivewatch",
          status: "present",
          reason: "Environment policy allows project/action/profile"
        },
        {
          type: "runtime_env",
          required: "HIVEWATCH_API_PORT",
          status: "missing",
          reason: "Missing environment variable for api: HIVEWATCH_API_PORT"
        }
      ])
    });
  });

  it("reports release prerequisites only for release mode", async () => {
    const service = new DeployPrerequisitesService(
      {
        projects: [
          {
            id: "hivewatch",
            name: "HiveWatch",
            source: "github",
            repository: "https://github.com/sepa79/HiveWatch.git",
            approvedRefs: ["main"]
          }
        ]
      },
      inspection(registry()),
      validator([]),
      runtimeEnv({ HIVEWATCH_API_PORT: "3000" }),
      environment()
    );

    await expect(
      service.explain({
        projectId: "hivewatch",
        gitRef: "main",
        component: "api",
        action: "deploy",
        profile: "normal",
        deploymentMode: "release",
        releaseVars: { "release.imageTag": "dev-1" }
      })
    ).resolves.toMatchObject({
      ready: false,
      releasePrerequisites: [
        {
          type: "release_var",
          required: "release.imageTag",
          status: "present"
        },
        {
          type: "registry_var",
          required: "imageRepository.project",
          status: "missing"
        },
        {
          type: "release_images",
          required: "images or artifact",
          status: "missing"
        }
      ]
    });
  });
});

function inspection(projectRegistry: ProjectRegistry): ProjectInspectionService {
  return {
    async inspect() {
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

function validator(issues: Array<{ component: string; requirementType: "volume" | "secret" | "environment"; name: string; message: string }>): RequirementValidator {
  return {
    async validateProject() {
      return {
        ok: issues.length === 0,
        issues
      };
    }
  } as unknown as RequirementValidator;
}

function runtimeEnv(values: Record<string, string>): RuntimeEnvStore {
  return {
    async resolve() {
      return values;
    }
  } as unknown as RuntimeEnvStore;
}

function registry(): ProjectRegistry {
  return {
    project: {
      name: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      actions: ["deploy"],
      profiles: [
        {
          id: "normal",
          runtime: "docker-single",
          serviceSet: "normal",
          requires: {
            managedRoot: {
              required: true,
              shared: false,
              node: "local-docker"
            }
          }
        }
      ]
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

function environment(): EnvironmentDefinition {
  return {
    id: "local",
    name: "Local Docker",
    kind: "docker",
    capabilities: {
      runtime: ["docker-single"],
      managedRoot: {
        shared: false,
        nodes: ["local-docker"]
      }
    },
    policy: {
      projects: [
        {
          id: "hivewatch",
          profiles: ["normal"],
          actions: ["deploy"]
        }
      ]
    }
  };
}
