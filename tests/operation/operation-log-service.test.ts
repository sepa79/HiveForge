import { describe, expect, it } from "vitest";
import type { DeployOrchestrator, DeployRequest } from "../../src/operation/deploy-orchestrator.js";
import type { Clock } from "../../src/operation/clock.js";
import type { IdGenerator } from "../../src/operation/id-generator.js";
import { OperationLogService } from "../../src/operation/operation-log-service.js";
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

describe("operation log service", () => {
  it("records failed command stdout and stderr as operation logs", async () => {
    const failure = new CommandExecutionError("ansible-playbook", ["deploy/hiveforge/deploy.yml"], {
      cwd: "/workspace/HiveMind",
      exitCode: 2,
      stdout: "PLAY RECAP\nlocalhost failed=1",
      stderr: "fatal: missing required variable"
    });
    const deploy = {
      async deploy(_request: DeployRequest) {
        throw failure;
      }
    } as unknown as DeployOrchestrator;
    const service = new OperationLogService(deploy, new SequenceIds(), new FixedClock());

    service.startLifecycleAction({
      projectId: "hivemind",
      gitRef: "main",
      component: "service",
      action: "deploy",
      profile: "swarm"
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.get("uiop-1")).toMatchObject({
      status: "failed",
      error: "Command failed: ansible-playbook deploy/hiveforge/deploy.yml (exit code 2, cwd /workspace/HiveMind)",
      logs: expect.arrayContaining([
        expect.objectContaining({ level: "stdout", message: expect.stringContaining("PLAY RECAP") }),
        expect.objectContaining({ level: "stderr", message: "fatal: missing required variable" }),
        expect.objectContaining({
          level: "error",
          message: "Command failed: ansible-playbook deploy/hiveforge/deploy.yml (exit code 2, cwd /workspace/HiveMind)"
        })
      ])
    });
  });
});
