import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RepositoryInspectionService } from "../../src/operation/repository-inspection-service.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";

class FixtureGitRunner implements CommandRunner {
  async run(command: string, args: string[]) {
    if (command !== "git") {
      throw new Error(`Unexpected command: ${command}`);
    }
    if (args[0] === "clone") {
      await writeDeployableProject(args[3]);
    }
    return { stdout: "", stderr: "" };
  }
}

describe("repository inspection service", () => {
  it("reports deployable repositories without requiring project registration", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-repo-inspect-"));
    const service = new RepositoryInspectionService(workspaceRoot, new FixtureGitRunner());

    await expect(
      service.inspect({
        repository: "https://github.com/sepa79/HiveWatch.git",
        gitRef: "main"
      })
    ).resolves.toEqual({
      repository: "https://github.com/sepa79/HiveWatch.git",
      gitRef: "main",
      deployable: true,
      project: {
        name: "hivewatch",
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
          name: "service",
          actions: ["deploy", "remove", "update"]
        }
      ]
    });
  });

  it("accepts explicit LAN HTTP Git repositories", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-repo-inspect-"));
    const service = new RepositoryInspectionService(workspaceRoot, new FixtureGitRunner());

    await expect(
      service.inspect({
        repository: "http://192.168.88.54:8081/git/PocketHive.git",
        gitRef: "pushed-ref"
      })
    ).resolves.toMatchObject({
      repository: "http://192.168.88.54:8081/git/PocketHive.git",
      gitRef: "pushed-ref",
      deployable: true
    });
  });

  it("keeps file repositories inspectable", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-repo-inspect-"));
    const service = new RepositoryInspectionService(workspaceRoot, new FixtureGitRunner());

    await expect(
      service.inspect({
        repository: "file:///home/sepa/HiveForge/tmp/hivewatch-fixture.git",
        gitRef: "main"
      })
    ).resolves.toMatchObject({
      repository: "file:///home/sepa/HiveForge/tmp/hivewatch-fixture.git",
      gitRef: "main",
      deployable: true
    });
  });

  it("rejects unsupported repository URLs before git runs", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-repo-inspect-"));
    const service = new RepositoryInspectionService(workspaceRoot, new FixtureGitRunner());

    await expect(
      service.inspect({
        repository: "ssh://git@example.test/repo.git",
        gitRef: "main"
      })
    ).rejects.toThrow("Repository is not inspectable by HiveForge: ssh://git@example.test/repo.git");
  });

  it("rejects malformed and non-git arbitrary HTTP URLs before git runs", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-repo-inspect-"));
    const service = new RepositoryInspectionService(workspaceRoot, new FixtureGitRunner());

    await expect(
      service.inspect({
        repository: "http://192.168.88.54:8081/git/PocketHive",
        gitRef: "main"
      })
    ).rejects.toThrow("Repository is not inspectable by HiveForge: http://192.168.88.54:8081/git/PocketHive");

    await expect(
      service.inspect({
        repository: "http://example.com/PocketHive.git",
        gitRef: "main"
      })
    ).rejects.toThrow("Repository is not inspectable by HiveForge: http://example.com/PocketHive.git");
  });
});

async function writeDeployableProject(workspace: string): Promise<void> {
  await mkdir(path.join(workspace, "deploy"), { recursive: true });
  await writeFile(
    path.join(workspace, "hiveforge.yaml"),
    [
      "kind: project",
      'version: "0.5"',
      "project:",
      "  name: hivewatch",
      "  repository: https://github.com/sepa79/HiveWatch.git",
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
      "  actions:",
      "    - deploy",
      "    - remove",
      "    - update",
      "components:",
      "  - name: service",
      "    manifest: service.hiveforge.yaml",
      ""
    ].join("\n")
  );
  await writeFile(
    path.join(workspace, "service.hiveforge.yaml"),
    [
      "kind: component",
      "component:",
      "  name: service",
      "  project: hivewatch",
      "deployment:",
      "  adapter: ansible",
      "  actions:",
      "    deploy:",
      "      playbook: deploy/deploy.yml",
      "    remove:",
      "      playbook: deploy/remove.yml",
      "    update:",
      "      playbook: deploy/update.yml",
      ""
    ].join("\n")
  );
  for (const action of ["deploy", "remove", "update"]) {
    await writeFile(path.join(workspace, `deploy/${action}.yml`), "---\n- hosts: localhost\n");
  }
}
