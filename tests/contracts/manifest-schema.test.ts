import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ContractValidationError, schemaPaths, validateContract } from "../../src/contracts/schema-loader.js";
import { loadProjectRegistry } from "../../src/manifest/project-registry.js";

describe("manifest schema", () => {
  it("accepts explicit HiveWatch root and component manifests", async () => {
    const rootManifest = {
      kind: "project",
      project: {
        name: "hivewatch",
        repository: "https://github.com/sepa79/HiveWatch.git",
        actions: ["deploy", "remove", "update"],
        vars: {
          "imageRepository.project": "ghcr.io/sepa79/hivewatch",
          "extRepository.docker": "docker.io",
          "extRepository.ghcr": "ghcr.io"
        },
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
          },
          {
            id: "test",
            runtime: "docker-single",
            serviceSet: "test",
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
      components: [{ name: "api", manifest: "components/api/hiveforge.yaml" }],
      artifacts: {
        managedPaths: [{ name: "api-config", source: "deploy/config", target: "artifacts/config", mode: "replace" }]
      }
    };

    const componentManifest = {
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
          update: {
            playbook: "ansible/update.yml"
          }
        }
      },
      requirements: {
        volumes: ["hivewatch-api-data"],
        secrets: ["hivewatch-api-token"],
        environment: ["HIVEWATCH_API_PORT"]
      }
    };

    await expect(validateContract(schemaPaths.manifest, rootManifest)).resolves.toBeUndefined();
    await expect(validateContract(schemaPaths.manifest, componentManifest)).resolves.toBeUndefined();
  });

  it("rejects implicit component manifest locations", async () => {
    const rootManifest = {
      kind: "project",
      project: {
        name: "hivewatch",
        repository: "https://github.com/sepa79/HiveWatch.git"
      },
      components: ["api"]
    };

    await expect(validateContract(schemaPaths.manifest, rootManifest)).rejects.toBeInstanceOf(ContractValidationError);
  });

  it("rejects action names outside the canonical lifecycle", async () => {
    const componentManifest = {
      kind: "component",
      component: {
        name: "api",
        project: "hivewatch"
      },
      deployment: {
        adapter: "ansible",
        actions: {
          restart: {
            playbook: "ansible/deploy.yml"
          }
        }
      }
    };

    await expect(validateContract(schemaPaths.manifest, componentManifest)).rejects.toBeInstanceOf(
      ContractValidationError
    );
  });

  it("rejects non-shared managed root requirements without an explicit node", async () => {
    const rootManifest = {
      kind: "project",
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
                shared: false
              }
            }
          }
        ]
      },
      components: [{ name: "api", manifest: "components/api/hiveforge.yaml" }]
    };

    await expect(validateContract(schemaPaths.manifest, rootManifest)).rejects.toBeInstanceOf(ContractValidationError);
  });

  it("rejects shared managed root requirements with node placement", async () => {
    const rootManifest = {
      kind: "project",
      project: {
        name: "hivewatch",
        repository: "https://github.com/sepa79/HiveWatch.git",
        actions: ["deploy"],
        profiles: [
          {
            id: "normal",
            runtime: "docker-swarm",
            serviceSet: "normal",
            requires: {
              managedRoot: {
                required: true,
                shared: true,
                node: "docker-swarm-mgr-1"
              }
            }
          }
        ]
      },
      components: [{ name: "api", manifest: "components/api/hiveforge.yaml" }]
    };

    await expect(validateContract(schemaPaths.manifest, rootManifest)).rejects.toBeInstanceOf(ContractValidationError);
  });

  it("builds a registry only from listed component manifests and declared action files", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "hiveforge-"));
    await mkdir(path.join(workspace, "components/api/ansible"), { recursive: true });
    await writeFile(
      path.join(workspace, "hiveforge.yaml"),
      [
        "kind: project",
        "project:",
        "  name: hivewatch",
        "  repository: https://github.com/sepa79/HiveWatch.git",
        "  actions:",
        "    - deploy",
        "    - remove",
        "    - update",
        "  vars:",
        "    imageRepository.project: ghcr.io/sepa79/hivewatch",
        "    extRepository.docker: docker.io",
        "    extRepository.ghcr: ghcr.io",
        "  profiles:",
        "    - id: normal",
        "      runtime: docker-single",
        "      serviceSet: normal",
        "      requires:",
        "        managedRoot:",
        "          required: true",
        "          shared: false",
        "          node: local-docker",
        "components:",
        "  - name: api",
        "    manifest: components/api/hiveforge.yaml",
        "artifacts:",
        "  managedPaths:",
        "    - name: api-config",
        "      source: deploy/config",
        "      target: artifacts/config",
        "      mode: replace",
        ""
      ].join("\n")
    );
    await writeFile(
      path.join(workspace, "components/api/hiveforge.yaml"),
      [
        "kind: component",
        "component:",
        "  name: api",
        "  project: hivewatch",
        "deployment:",
        "  adapter: ansible",
        "  actions:",
        "    deploy:",
        "      playbook: ansible/deploy.yml",
        "    remove:",
        "      playbook: ansible/remove.yml",
        "    update:",
        "      playbook: ansible/update.yml",
        ""
      ].join("\n")
    );
    for (const action of ["deploy", "remove", "update"]) {
      await writeFile(path.join(workspace, `components/api/ansible/${action}.yml`), "---\n- hosts: localhost\n");
    }

    const registry = await loadProjectRegistry(workspace);

    expect(registry.project.name).toBe("hivewatch");
    expect(registry.artifacts?.managedPaths?.map((managedPath) => managedPath.name)).toEqual(["api-config"]);
    expect(registry.components.map((component) => component.name)).toEqual(["api"]);
  });

  it("fails explicitly when a declared action file is missing", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "hiveforge-"));
    await mkdir(path.join(workspace, "components/api"), { recursive: true });
    await writeFile(
      path.join(workspace, "hiveforge.yaml"),
      [
        "kind: project",
        "project:",
        "  name: hivewatch",
        "  repository: https://github.com/sepa79/HiveWatch.git",
        "  actions:",
        "    - deploy",
        "    - remove",
        "    - update",
        "components:",
        "  - name: api",
        "    manifest: components/api/hiveforge.yaml",
        ""
      ].join("\n")
    );
    await writeFile(
      path.join(workspace, "components/api/hiveforge.yaml"),
      [
        "kind: component",
        "component:",
        "  name: api",
        "  project: hivewatch",
        "deployment:",
        "  adapter: ansible",
        "  actions:",
        "    deploy:",
        "      playbook: ansible/deploy.yml",
        "    remove:",
        "      playbook: ansible/remove.yml",
        "    update:",
        "      playbook: ansible/update.yml",
        ""
      ].join("\n")
    );

    await expect(loadProjectRegistry(workspace)).rejects.toThrow(
      "Action file missing for api.deploy: ansible/deploy.yml"
    );
  });

  it("fails explicitly when project profile ids are duplicated", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "hiveforge-"));
    await mkdir(path.join(workspace, "components/api/ansible"), { recursive: true });
    await writeFile(
      path.join(workspace, "hiveforge.yaml"),
      [
        "kind: project",
        "project:",
        "  name: hivewatch",
        "  repository: https://github.com/sepa79/HiveWatch.git",
        "  actions:",
        "    - deploy",
        "  profiles:",
        "    - id: normal",
        "      runtime: docker-single",
        "      serviceSet: normal",
        "    - id: normal",
        "      runtime: docker-single",
        "      serviceSet: test",
        "components:",
        "  - name: api",
        "    manifest: components/api/hiveforge.yaml",
        ""
      ].join("\n")
    );
    await writeFile(
      path.join(workspace, "components/api/hiveforge.yaml"),
      [
        "kind: component",
        "component:",
        "  name: api",
        "  project: hivewatch",
        "deployment:",
        "  adapter: ansible",
        "  actions:",
        "    deploy:",
        "      playbook: ansible/deploy.yml",
        ""
      ].join("\n")
    );
    await writeFile(path.join(workspace, "components/api/ansible/deploy.yml"), "---\n- hosts: localhost\n");

    await expect(loadProjectRegistry(workspace)).rejects.toThrow("Duplicate project profile in root manifest: normal");
  });

  it("fails explicitly when the root manifest is missing", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "hiveforge-"));

    await expect(loadProjectRegistry(workspace)).rejects.toThrow("Root manifest missing: hiveforge.yaml");
  });
});
