import { mkdtemp } from "node:fs/promises";
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

  constructor(private readonly failure?: Error) {}

  async run(action: ResolvedAction) {
    this.actions.push(action);
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
        componentDir: "/workspace/components/api",
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
    const service = serviceWith(journalDir, new FakeActionRunner(new Error("ansible exited 2")));

    await expect(service.run(request("api", "deploy"))).rejects.toThrow("ansible exited 2");
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
        reason: "ansible exited 2"
      }
    ]);
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

function registry(): ProjectRegistry {
  return {
    project: {
      name: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git"
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
