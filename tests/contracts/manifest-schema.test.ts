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
        profiles: ["normal", "test"]
      },
      components: [{ name: "api", manifest: "components/api/hiveforge.yaml" }]
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
    for (const action of ["deploy", "remove", "update"]) {
      await writeFile(path.join(workspace, `components/api/ansible/${action}.yml`), "---\n- hosts: localhost\n");
    }

    const registry = await loadProjectRegistry(workspace);

    expect(registry.project.name).toBe("hivewatch");
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

  it("fails explicitly when the root manifest is missing", async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), "hiveforge-"));

    await expect(loadProjectRegistry(workspace)).rejects.toThrow("Root manifest missing: hiveforge.yaml");
  });
});
