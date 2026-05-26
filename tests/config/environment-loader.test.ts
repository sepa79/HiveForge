import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEnvironmentConfig } from "../../src/config/environment-loader.js";
import { EnvironmentPolicyEditor } from "../../src/config/environment-policy-editor.js";

describe("environment loader", () => {
  it("loads explicit known environments", async () => {
    const filePath = await writeConfig([
      "current: local",
      "environments:",
      "  - id: local",
      "    name: Local Docker",
      "    kind: local-docker",
      "    capabilities:",
      "      runtime:",
      "        - docker-single",
      "      managedRoot:",
      "        shared: false",
      "        nodes:",
      "          - local-docker",
      "    policy:",
      "      projects:",
      "        - id: hivewatch",
      "          actions:",
      "            - deploy",
      ""
    ]);

    await expect(loadEnvironmentConfig(filePath)).resolves.toEqual({
      current: "local",
      environments: [
        {
          id: "local",
          name: "Local Docker",
          kind: "local-docker",
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
                actions: ["deploy"]
              }
            ]
          }
        }
      ]
    });
  });

  it("loads explicit project policy", async () => {
    const filePath = await writeConfig([
      "current: local",
      "environments:",
      "  - id: local",
      "    name: Local Docker",
      "    kind: local-docker",
      "    capabilities:",
      "      runtime:",
      "        - docker-single",
      "      managedRoot:",
      "        shared: false",
      "        nodes:",
      "          - local-docker",
      "    vars:",
      "      extRepository.docker: company-cache.example.com/dockerhub",
      "      extRepository.ghcr: company-cache.example.com/ghcr",
      "    policy:",
      "      projects:",
      "        - id: hivewatch",
      "          profiles:",
      "            - normal",
      "            - test",
      "          actions:",
      "            - deploy",
      "            - upgrade",
      ""
    ]);

    await expect(loadEnvironmentConfig(filePath)).resolves.toEqual({
      current: "local",
      environments: [
        {
          id: "local",
          name: "Local Docker",
          kind: "local-docker",
          capabilities: {
            runtime: ["docker-single"],
            managedRoot: {
              shared: false,
              nodes: ["local-docker"]
            }
          },
          vars: {
            "extRepository.docker": "company-cache.example.com/dockerhub",
            "extRepository.ghcr": "company-cache.example.com/ghcr"
          },
          policy: {
            projects: [
              {
                id: "hivewatch",
                profiles: ["normal", "test"],
                actions: ["deploy", "upgrade"]
              }
            ]
          }
        }
      ]
    });
  });

  it("rejects a current environment that is not declared", async () => {
    const filePath = await writeConfig([
      "current: prod",
      "environments:",
      "  - id: local",
      "    name: Local Docker",
      "    kind: local-docker",
      "    capabilities:",
      "      runtime:",
      "        - docker-single",
      "      managedRoot:",
      "        shared: false",
      "        nodes:",
      "          - local-docker",
      "    policy:",
      "      projects:",
      "        - id: hivewatch",
      "          actions:",
      "            - deploy",
      ""
    ]);

    await expect(loadEnvironmentConfig(filePath)).rejects.toThrow("Current environment is not defined: prod");
  });

  it("rejects duplicate project policies within one environment", async () => {
    const filePath = await writeConfig([
      "current: local",
      "environments:",
      "  - id: local",
      "    name: Local Docker",
      "    kind: local-docker",
      "    capabilities:",
      "      runtime:",
      "        - docker-single",
      "      managedRoot:",
      "        shared: false",
      "        nodes:",
      "          - local-docker",
      "    policy:",
      "      projects:",
      "        - id: hivewatch",
      "          actions:",
      "            - deploy",
      "        - id: hivewatch",
      "          actions:",
      "            - deploy",
      ""
    ]);

    await expect(loadEnvironmentConfig(filePath)).rejects.toThrow(
      "Duplicate project policy for environment local: hivewatch"
    );
  });

  it("rejects non-shared managed roots without explicit nodes", async () => {
    const filePath = await writeConfig([
      "current: local",
      "environments:",
      "  - id: local",
      "    name: Local Docker",
      "    kind: local-docker",
      "    capabilities:",
      "      runtime:",
      "        - docker-single",
      "      managedRoot:",
      "        shared: false",
      "    policy:",
      "      projects:",
      "        - id: hivewatch",
      "          actions:",
      "            - deploy",
      ""
    ]);

    await expect(loadEnvironmentConfig(filePath)).rejects.toThrow("Contract validation failed");
  });

  it("allows empty project policy for first-start bootstrap", async () => {
    const filePath = await writeConfig([
      "current: docker",
      "environments:",
      "  - id: docker",
      "    name: Docker host",
      "    kind: docker",
      "    capabilities:",
      "      runtime:",
      "        - docker-single",
      "      managedRoot:",
      "        shared: true",
      "    policy:",
      "      projects: []",
      ""
    ]);

    await expect(loadEnvironmentConfig(filePath)).resolves.toEqual({
      current: "docker",
      environments: [
        {
          id: "docker",
          name: "Docker host",
          kind: "docker",
          capabilities: {
            runtime: ["docker-single"],
            managedRoot: {
              shared: true
            }
          },
          policy: {
            projects: []
          }
        }
      ]
    });
  });

  it("sets project policy explicitly and persists it", async () => {
    const filePath = await writeConfig([
      "current: docker",
      "environments:",
      "  - id: docker",
      "    name: Docker host",
      "    kind: docker",
      "    capabilities:",
      "      runtime:",
      "        - docker-single",
      "      managedRoot:",
      "        shared: true",
      "    policy:",
      "      projects: []",
      ""
    ]);
    const config = await loadEnvironmentConfig(filePath);
    const editor = new EnvironmentPolicyEditor(filePath, config);

    await expect(
      editor.setProjectPolicy({
        environmentId: "docker",
        projectId: "hivewatch",
        profiles: ["normal", "test"],
        actions: ["deploy", "remove"]
      })
    ).resolves.toEqual({
      environmentId: "docker",
      project: {
        id: "hivewatch",
        profiles: ["normal", "test"],
        actions: ["deploy", "remove"]
      }
    });

    await expect(loadEnvironmentConfig(filePath)).resolves.toMatchObject({
      environments: [
        {
          policy: {
            projects: [
              {
                id: "hivewatch",
                profiles: ["normal", "test"],
                actions: ["deploy", "remove"]
              }
            ]
          }
        }
      ]
    });
  });
});

async function writeConfig(lines: string[]): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-env-"));
  const filePath = path.join(dir, "environments.yaml");
  await writeFile(filePath, lines.join("\n"));
  return filePath;
}
