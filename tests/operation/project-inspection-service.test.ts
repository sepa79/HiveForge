import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ProjectRegistryConfig } from "../../src/config/project-registry-types.js";
import type { Clock } from "../../src/operation/clock.js";
import type { IdGenerator } from "../../src/operation/id-generator.js";
import { ProjectInspectionService } from "../../src/operation/project-inspection-service.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";
import { WorkspaceManager } from "../../src/workspace/workspace-manager.js";
import { JsonlJournal } from "../../src/journal/jsonl-journal.js";

class SequenceIds implements IdGenerator {
  private next = 1;

  nextId(prefix: string): string {
    return `${prefix}-${this.next++}`;
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-05-17T10:00:00.000Z");
  }
}

class FixtureCheckoutRunner implements CommandRunner {
  constructor(private readonly fixtureRoot: string) {}

  async run(command: string, args: string[], options: { cwd?: string } = {}) {
    if (command !== "git") {
      throw new Error(`Unexpected command: ${command}`);
    }

    if (args[0] === "clone") {
      const checkoutPath = args[3];
      await copyHiveForgeFixture(this.fixtureRoot, checkoutPath);
      return { stdout: "", stderr: "" };
    }

    if (args[0] === "checkout" && options.cwd) {
      return { stdout: "", stderr: "" };
    }

    throw new Error(`Unexpected git invocation: ${args.join(" ")}`);
  }
}

describe("project inspection service", () => {
  it("checks out, loads the registry, and records a success event", async () => {
    const fixture = await createHiveWatchFixture(true);
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-workspace-"));
    const journalDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const service = buildService(fixture, workspaceRoot, journalDir);

    const result = await service.inspect({ projectId: "hivewatch", gitRef: "main" });

    expect(result.operationId).toBe("op-1");
    expect(result.registry.components.map((component) => component.name)).toEqual(["api"]);
    await expect(new JsonlJournal(journalDir).readAll()).resolves.toEqual([
      {
        eventId: "evt-2",
        operationId: "op-1",
        operationType: "inspect_project",
        project: "hivewatch",
        repository: "https://github.com/sepa79/HiveWatch.git",
        gitRef: "main",
        status: "succeeded",
        startedAt: "2026-05-17T10:00:00.000Z",
        endedAt: "2026-05-17T10:00:00.000Z",
        reason: "Loaded 1 managed component"
      }
    ]);
  });

  it("records an explicit failure event when registry loading fails", async () => {
    const fixture = await createHiveWatchFixture(false);
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-workspace-"));
    const journalDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const service = buildService(fixture, workspaceRoot, journalDir);

    await expect(service.inspect({ projectId: "hivewatch", gitRef: "main" })).rejects.toThrow(
      "Action file missing for api.deploy: ansible/deploy.yml"
    );
    const events = await new JsonlJournal(journalDir).readAll();
    expect(events).toMatchObject([
      {
        eventId: "evt-2",
        operationId: "op-1",
        operationType: "inspect_project",
        project: "hivewatch",
        repository: "https://github.com/sepa79/HiveWatch.git",
        gitRef: "main",
        status: "failed",
        reason: "Action file missing for api.deploy: ansible/deploy.yml"
      }
    ]);
  });

  it("records an explicit failure event when checkout is rejected before git runs", async () => {
    const fixture = await createHiveWatchFixture(true);
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hiveforge-workspace-"));
    const journalDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const service = buildService(fixture, workspaceRoot, journalDir);

    await expect(service.inspect({ projectId: "pockethive", gitRef: "main" })).rejects.toThrow(
      "Project is not registered: pockethive"
    );
    await expect(new JsonlJournal(journalDir).readAll()).resolves.toEqual([
      {
        eventId: "evt-2",
        operationId: "op-1",
        operationType: "inspect_project",
        project: "pockethive",
        gitRef: "main",
        status: "failed",
        startedAt: "2026-05-17T10:00:00.000Z",
        endedAt: "2026-05-17T10:00:00.000Z",
        reason: "Project is not registered: pockethive"
      }
    ]);
  });
});

function buildService(fixtureRoot: string, workspaceRoot: string, journalDir: string): ProjectInspectionService {
  const projectRegistry: ProjectRegistryConfig = {
    projects: [
      {
        id: "hivewatch",
        name: "HiveWatch",
        source: "github",
        repository: "https://github.com/sepa79/HiveWatch.git",
        approvedRefs: ["main"]
      }
    ]
  };

  return new ProjectInspectionService(
    new WorkspaceManager(workspaceRoot, projectRegistry, new FixtureCheckoutRunner(fixtureRoot)),
    new JsonlJournal(journalDir),
    new SequenceIds(),
    new FixedClock()
  );
}

async function createHiveWatchFixture(includePlaybook: boolean): Promise<string> {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "hivewatch-fixture-"));
  await mkdir(path.join(fixture, "components/api/ansible"), { recursive: true });
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
      "    - remove",
      "    - update",
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
      "      playbook: ansible/deploy.yml",
      "    remove:",
      "      playbook: ansible/remove.yml",
      "    update:",
      "      playbook: ansible/update.yml",
      ""
    ].join("\n")
  );

  if (includePlaybook) {
    for (const action of ["deploy", "remove", "update"]) {
      await writeFile(path.join(fixture, `components/api/ansible/${action}.yml`), "---\n- hosts: localhost\n");
    }
  }

  return fixture;
}

async function copyHiveForgeFixture(source: string, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  await mkdir(target, { recursive: true });
  await mkdir(path.join(target, "components/api/ansible"), { recursive: true });
  await writeFile(path.join(target, "hiveforge.yaml"), await readText(path.join(source, "hiveforge.yaml")));
  await writeFile(
    path.join(target, "components/api/hiveforge.yaml"),
    await readText(path.join(source, "components/api/hiveforge.yaml"))
  );

  for (const action of ["deploy", "remove", "update"]) {
    try {
      await writeFile(
        path.join(target, `components/api/ansible/${action}.yml`),
        await readText(path.join(source, `components/api/ansible/${action}.yml`))
      );
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
  }
}

async function readText(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}
