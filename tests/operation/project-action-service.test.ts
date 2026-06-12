import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ActionRunner } from "../../src/action/ansible-runner.js";
import type { ResolvedAction } from "../../src/action/action-resolver.js";
import { JsonlJournal } from "../../src/journal/jsonl-journal.js";
import type { ProjectRegistry } from "../../src/manifest/manifest-types.js";
import type { Clock } from "../../src/operation/clock.js";
import type { IdGenerator } from "../../src/operation/id-generator.js";
import { ProjectActionService } from "../../src/operation/project-action-service.js";
import { CommandExecutionError } from "../../src/workspace/command-runner.js";

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

class FakeActionRunner implements ActionRunner {
  public readonly actions: ResolvedAction[] = [];
  public readonly contexts: unknown[] = [];

  constructor(private readonly failure?: Error) {}

  async run(action: ResolvedAction, context = {}) {
    this.actions.push(action);
    this.contexts.push(context);
    if (this.failure) {
      throw this.failure;
    }
    return { stdout: "changed=1", stderr: "" };
  }
}

describe("project action service", () => {
  it("runs a declared action and journals success", async () => {
    const journalDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const runner = new FakeActionRunner();
    const service = serviceWith(journalDir, runner);

    const result = await service.run(request("api", "deploy"));

    expect(result).toEqual({ operationId: "op-1", stdout: "changed=1", stderr: "" });
    expect(runner.actions).toEqual([
      {
        component: "api",
        action: "deploy",
        adapter: "ansible",
        workspacePath: "/workspace",
        componentDir: "/workspace/components/api",
        componentRelativeDir: "components/api",
        playbook: "ansible/deploy.yml"
      }
    ]);
    await expect(new JsonlJournal(journalDir).readAll()).resolves.toEqual([
      {
        eventId: "evt-2",
        operationId: "op-1",
        operationType: "run_action",
        project: "hivewatch",
        repository: "https://github.com/sepa79/HiveWatch.git",
        gitRef: "main",
        component: "api",
        action: "deploy",
        adapter: "ansible",
        status: "succeeded",
        startedAt: "2026-05-17T10:00:00.000Z",
        endedAt: "2026-05-17T10:00:00.000Z",
        reason: "Action completed successfully"
      }
    ]);
  });

  it("journals and rejects undeclared actions before running Ansible", async () => {
    const journalDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const runner = new FakeActionRunner();
    const service = serviceWith(journalDir, runner);

    await expect(service.run(request("api", "restart"))).rejects.toThrow("Action is not declared for api: restart");
    expect(runner.actions).toEqual([]);
    const events = await new JsonlJournal(journalDir).readAll();
    expect(events).toMatchObject([
      {
        eventId: "evt-2",
        operationId: "op-1",
        operationType: "run_action",
        project: "hivewatch",
        component: "api",
        action: "restart",
        adapter: "ansible",
        status: "failed",
        reason: "Action is not declared for api: restart"
      }
    ]);
  });

  it("journals runner failure", async () => {
    const journalDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const service = serviceWith(
      journalDir,
      new FakeActionRunner(
        new CommandExecutionError("ansible-playbook", ["ansible/deploy.yml"], {
          cwd: "/workspace/components/api",
          exitCode: 2,
          stdout: "play recap",
          stderr: "fatal task"
        })
      )
    );

    await expect(service.run(request("api", "deploy"))).rejects.toThrow("fatal task");
    const events = await new JsonlJournal(journalDir).readAll();
    expect(events).toMatchObject([
      {
        eventId: "evt-2",
        operationId: "op-1",
        operationType: "run_action",
        project: "hivewatch",
        component: "api",
        action: "deploy",
        adapter: "ansible",
        status: "failed",
        reason: "Command failed: ansible-playbook ansible/deploy.yml (exit code 2, cwd /workspace/components/api)"
      }
    ]);
  });

  it("passes bind-source environment and managed action mounts to the action runner", async () => {
    const journalDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const runner = new FakeActionRunner();
    const service = serviceWith(journalDir, runner);

    await service.run({
      ...request("api", "deploy"),
      profile: "test",
      environment: {
        HIVEFORGE_BIND_SOURCE_DIR: "/srv/hiveforge/data/deployed/hivewatch"
      },
      managedFiles: managedFiles("/data/deployed/hivewatch", "/srv/hiveforge/data/deployed/hivewatch")
    });

    expect(runner.contexts).toEqual([
      {
        environment: {
          HIVEFORGE_BIND_SOURCE_DIR: "/srv/hiveforge/data/deployed/hivewatch",
          HIVEFORGE_PROFILE: "test"
        },
        actionRootSource: "/srv/hiveforge/data/deployed/hivewatch",
        workspaceSource: "/srv/hiveforge/workspace/hivewatch"
      }
    ]);
  });

  it("runs the after-run hook before journaling success", async () => {
    const journalDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const runner = new FakeActionRunner();
    const service = serviceWith(journalDir, runner);
    const calls: unknown[] = [];

    const result = await service.run({
      ...request("api", "deploy"),
      environment: {},
      async afterRun(context) {
        calls.push(context);
        return { deploymentId: "deployment-1" };
      }
    });

    expect(result).toEqual({ operationId: "op-1", deploymentId: "deployment-1", stdout: "changed=1", stderr: "" });
    expect(calls).toEqual([
      {
        operationId: "op-1",
        environment: {},
        endedAt: "2026-05-17T10:00:00.000Z"
      }
    ]);
  });

  it("records rendered compose artifact evidence when the action writes it", async () => {
    const journalDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const stackDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-stack-"));
    const renderedComposeFile = path.join(stackDir, "compose.yml");
    await mkdir(stackDir, { recursive: true });
    await writeFile(renderedComposeFile, "services:\n  api:\n    image: hivewatch:test\n", "utf8");
    const runner = new FakeActionRunner();
    const service = serviceWith(journalDir, runner);

    await service.run({
      ...request("api", "deploy"),
      managedFiles: managedFiles(path.dirname(stackDir), undefined, renderedComposeFile)
    });

    const events = await new JsonlJournal(journalDir).readAll();
    expect(events[0].artifacts).toEqual([
      {
        name: "compose",
        path: renderedComposeFile,
        mediaType: "application/yaml",
        sha256: "d23ae86842d20c99a6827d688b859a2c9d4c449dd6ac9940c223fc30307d5627",
        bytes: 43,
        recordedAt: "2026-05-17T10:00:00.000Z"
      }
    ]);
  });

  it("records rendered compose artifact evidence when the action fails after writing it", async () => {
    const journalDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const stackDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-stack-"));
    const renderedComposeFile = path.join(stackDir, "compose.yml");
    await writeFile(renderedComposeFile, "services:\n  api:\n    image: hivewatch:test\n", "utf8");
    const service = serviceWith(
      journalDir,
      new FakeActionRunner(
        new CommandExecutionError("ansible-playbook", ["ansible/deploy.yml"], {
          cwd: "/workspace/components/api",
          exitCode: 2,
          stdout: "compose rendered",
          stderr: "bind source path does not exist"
        })
      )
    );

    await expect(
      service.run({
        ...request("api", "deploy"),
        managedFiles: managedFiles(path.dirname(stackDir), undefined, renderedComposeFile)
      })
    ).rejects.toThrow("bind source path does not exist");

    const events = await new JsonlJournal(journalDir).readAll();
    expect(events[0]).toMatchObject({
      status: "failed",
      artifacts: [
        {
          name: "compose",
          path: renderedComposeFile,
          mediaType: "application/yaml",
          sha256: "d23ae86842d20c99a6827d688b859a2c9d4c449dd6ac9940c223fc30307d5627",
          bytes: 43,
          recordedAt: "2026-05-17T10:00:00.000Z"
        }
      ]
    });
  });
});

function serviceWith(journalDir: string, runner: ActionRunner): ProjectActionService {
  return new ProjectActionService(runner, new JsonlJournal(journalDir), new SequenceIds(), new FixedClock());
}

function request(component: string, action: string) {
  return {
    projectId: "hivewatch",
    repository: "https://github.com/sepa79/HiveWatch.git",
    gitRef: "main",
    workspacePath: "/workspace",
    registry: registry(),
    component,
    action
  };
}

function managedFiles(projectDir: string, bindSourceDir?: string, renderedComposeFile = path.join(projectDir, "stacks", "compose.yml")) {
  return {
    projectDir,
    stackDir: path.join(projectDir, "stacks"),
    artifactsDir: path.join(projectDir, "artifacts"),
    renderedComposeFile,
    actionRoot: "/hf",
    actionRenderedComposeFile: "/hf/stacks/compose.yml",
    actionRootSource: bindSourceDir ?? projectDir,
    workspaceSource: bindSourceDir ? "/srv/hiveforge/workspace/hivewatch" : "/workspace",
    ...(bindSourceDir ? { bindSourceDir } : {}),
    prepared: []
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
