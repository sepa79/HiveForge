import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProjectRegistryConfig } from "../../src/config/project-registry-loader.js";
import { ProjectRegistrationService } from "../../src/operation/project-registration-service.js";
import { RepositoryInspectionService } from "../../src/operation/repository-inspection-service.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";

class FixtureGitRunner implements CommandRunner {
  constructor(private readonly fixtureRoot: string) {}

  async run(command: string, args: string[]) {
    if (command !== "git") {
      throw new Error(`Unexpected command: ${command}`);
    }
    if (args[0] === "clone") {
      await copyFixture(this.fixtureRoot, args[3]);
    }
    return { stdout: "", stderr: "" };
  }
}

describe("project registration service", () => {
  it("registers a deployable repository ref in the project registry", async () => {
    const fixture = await writeDeployableFixture();
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-register-workspace-"));
    const registryPath = path.join(await mkdtemp(path.join(os.tmpdir(), "hiveforge-register-registry-")), "projects.yaml");
    await writeFile(registryPath, "projects: []\n");
    const registry = await loadProjectRegistryConfig(registryPath);
    const inspection = new RepositoryInspectionService(workspaceRoot, new FixtureGitRunner(fixture));
    const service = new ProjectRegistrationService(registryPath, registry, inspection);

    await expect(
      service.register({
        repository: "https://github.com/sepa79/HiveWatch.git",
        gitRef: "main"
      })
    ).resolves.toEqual({
      deployable: true,
      project: {
        id: "hivewatch",
        name: "hivewatch",
        source: "github",
        repository: "https://github.com/sepa79/HiveWatch.git",
        approvedRefs: ["main"]
      }
    });
    await expect(loadProjectRegistryConfig(registryPath)).resolves.toEqual({
      projects: [
        {
          id: "hivewatch",
          name: "hivewatch",
          source: "github",
          repository: "https://github.com/sepa79/HiveWatch.git",
          approvedRefs: ["main"]
        }
      ]
    });
  });

  it("registers explicit LAN HTTP Git repositories as http-git", async () => {
    const fixture = await writeDeployableFixture();
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-register-workspace-"));
    const registryPath = path.join(await mkdtemp(path.join(os.tmpdir(), "hiveforge-register-registry-")), "projects.yaml");
    await writeFile(registryPath, "projects: []\n");
    const registry = await loadProjectRegistryConfig(registryPath);
    const inspection = new RepositoryInspectionService(workspaceRoot, new FixtureGitRunner(fixture));
    const service = new ProjectRegistrationService(registryPath, registry, inspection);

    await expect(
      service.register({
        repository: "http://192.168.88.54:8081/git/PocketHive.git",
        gitRef: "pushed-ref"
      })
    ).resolves.toEqual({
      deployable: true,
      project: {
        id: "hivewatch",
        name: "hivewatch",
        source: "http-git",
        repository: "http://192.168.88.54:8081/git/PocketHive.git",
        approvedRefs: ["pushed-ref"]
      }
    });
  });

  it("keeps official registration on the manifest project id and rejects another official repository", async () => {
    const fixture = await writeDeployableFixture();
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-register-workspace-"));
    const registryPath = path.join(await mkdtemp(path.join(os.tmpdir(), "hiveforge-register-registry-")), "projects.yaml");
    await writeFile(
      registryPath,
      [
        "projects:",
        "  - id: hivewatch",
        "    name: hivewatch",
        "    source: github",
        "    repository: https://github.com/sepa79/HiveWatch.git",
        "    approvedRefs:",
        "      - main",
        ""
      ].join("\n")
    );
    const registry = await loadProjectRegistryConfig(registryPath);
    const inspection = new RepositoryInspectionService(workspaceRoot, new FixtureGitRunner(fixture));
    const service = new ProjectRegistrationService(registryPath, registry, inspection);

    await expect(
      service.register({
        repository: "http://192.168.88.54:8081/git/PocketHive.git",
        gitRef: "pushed-ref",
        registrationKind: "official"
      })
    ).rejects.toThrow("Registered project id already uses another repository: hivewatch");
  });

  it("registers development repositories as a separate project variant", async () => {
    const fixture = await writeDeployableFixture();
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-register-workspace-"));
    const registryPath = path.join(await mkdtemp(path.join(os.tmpdir(), "hiveforge-register-registry-")), "projects.yaml");
    await writeFile(
      registryPath,
      [
        "projects:",
        "  - id: hivewatch",
        "    name: hivewatch",
        "    source: github",
        "    repository: https://github.com/sepa79/HiveWatch.git",
        "    approvedRefs:",
        "      - main",
        ""
      ].join("\n")
    );
    const registry = await loadProjectRegistryConfig(registryPath);
    const inspection = new RepositoryInspectionService(workspaceRoot, new FixtureGitRunner(fixture));
    const service = new ProjectRegistrationService(registryPath, registry, inspection);

    await expect(
      service.register({
        repository: "http://192.168.88.54:8081/git/PocketHive.git",
        gitRef: "pushed-ref",
        registrationKind: "development"
      })
    ).resolves.toEqual({
      deployable: true,
      project: {
        id: "hivewatch-development",
        name: "hivewatch development",
        source: "http-git",
        repository: "http://192.168.88.54:8081/git/PocketHive.git",
        approvedRefs: ["pushed-ref"]
      }
    });
    await expect(loadProjectRegistryConfig(registryPath)).resolves.toEqual({
      projects: [
        {
          id: "hivewatch",
          name: "hivewatch",
          source: "github",
          repository: "https://github.com/sepa79/HiveWatch.git",
          approvedRefs: ["main"]
        },
        {
          id: "hivewatch-development",
          name: "hivewatch development",
          source: "http-git",
          repository: "http://192.168.88.54:8081/git/PocketHive.git",
          approvedRefs: ["pushed-ref"]
        }
      ]
    });
  });

  it("unregisters one existing project ref without deleting the project", async () => {
    const fixture = await writeDeployableFixture();
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-register-workspace-"));
    const registryPath = path.join(await mkdtemp(path.join(os.tmpdir(), "hiveforge-register-registry-")), "projects.yaml");
    await writeFile(
      registryPath,
      [
        "projects:",
        "  - id: hivewatch-development",
        "    name: hivewatch development",
        "    source: http-git",
        "    repository: http://192.168.88.54:8081/git/PocketHive.git",
        "    approvedRefs:",
        "      - pockethive-debug-mcp",
        "      - mcp-bundle-validation-evidence-fix",
        ""
      ].join("\n")
    );
    const registry = await loadProjectRegistryConfig(registryPath);
    const inspection = new RepositoryInspectionService(workspaceRoot, new FixtureGitRunner(fixture));
    const service = new ProjectRegistrationService(registryPath, registry, inspection);

    await expect(
      service.unregisterRef({
        projectId: "hivewatch-development",
        gitRef: "pockethive-debug-mcp"
      })
    ).resolves.toEqual({
      unregisteredRef: "pockethive-debug-mcp",
      project: {
        id: "hivewatch-development",
        name: "hivewatch development",
        source: "http-git",
        repository: "http://192.168.88.54:8081/git/PocketHive.git",
        approvedRefs: ["mcp-bundle-validation-evidence-fix"]
      }
    });
    await expect(loadProjectRegistryConfig(registryPath)).resolves.toEqual({
      projects: [
        {
          id: "hivewatch-development",
          name: "hivewatch development",
          source: "http-git",
          repository: "http://192.168.88.54:8081/git/PocketHive.git",
          approvedRefs: ["mcp-bundle-validation-evidence-fix"]
        }
      ]
    });
  });

  it("rejects unregistering the last project ref", async () => {
    const fixture = await writeDeployableFixture();
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-register-workspace-"));
    const registryPath = path.join(await mkdtemp(path.join(os.tmpdir(), "hiveforge-register-registry-")), "projects.yaml");
    await writeFile(
      registryPath,
      [
        "projects:",
        "  - id: hivewatch-development",
        "    name: hivewatch development",
        "    source: http-git",
        "    repository: http://192.168.88.54:8081/git/PocketHive.git",
        "    approvedRefs:",
        "      - mcp-bundle-validation-evidence-fix",
        ""
      ].join("\n")
    );
    const registry = await loadProjectRegistryConfig(registryPath);
    const inspection = new RepositoryInspectionService(workspaceRoot, new FixtureGitRunner(fixture));
    const service = new ProjectRegistrationService(registryPath, registry, inspection);

    await expect(
      service.unregisterRef({
        projectId: "hivewatch-development",
        gitRef: "mcp-bundle-validation-evidence-fix"
      })
    ).rejects.toThrow(
      "Cannot unregister the last ref for hivewatch-development; unregistering a project is a separate explicit operation."
    );
  });
});

async function writeDeployableFixture(): Promise<string> {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "hiveforge-register-fixture-"));
  await mkdir(path.join(fixture, "components/api/deploy"), { recursive: true });
  await writeFile(
    path.join(fixture, "hiveforge.yaml"),
    [
      "kind: project",
      'version: "0.5"',
      "project:",
      "  name: hivewatch",
      "  repository: https://github.com/sepa79/HiveWatch.git",
      "  actions:",
      "    - deploy",
      "components:",
      "  - name: api",
      "    manifest: components/api/hiveforge.yaml",
      ""
    ].join("\n")
  );
  await writeFile(
    path.join(fixture, "components/api/hiveforge.yaml"),
    [
      "kind: component",
      "component:",
      "  name: api",
      "  project: hivewatch",
      "deployment:",
      "  adapter: ansible",
      "  actions:",
      "    deploy:",
      "      playbook: deploy/deploy.yml",
      ""
    ].join("\n")
  );
  await writeFile(path.join(fixture, "components/api/deploy/deploy.yml"), "---\n- hosts: localhost\n");
  return fixture;
}

async function copyFixture(source: string, target: string): Promise<void> {
  await mkdir(path.join(target, "components/api/deploy"), { recursive: true });
  await writeFile(path.join(target, "hiveforge.yaml"), await readFile(path.join(source, "hiveforge.yaml"), "utf8"));
  await writeFile(
    path.join(target, "components/api/hiveforge.yaml"),
    await readFile(path.join(source, "components/api/hiveforge.yaml"), "utf8")
  );
  await writeFile(
    path.join(target, "components/api/deploy/deploy.yml"),
    await readFile(path.join(source, "components/api/deploy/deploy.yml"), "utf8")
  );
}
