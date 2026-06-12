import { describe, expect, it } from "vitest";
import { AnsibleRunner } from "../../src/action/ansible-runner.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";

class RecordingRunner implements CommandRunner {
  public readonly calls: Array<{ command: string; args: string[]; cwd?: string; env?: NodeJS.ProcessEnv }> = [];

  async run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
    this.calls.push({ command, args, cwd: options.cwd, env: options.env });
    return { stdout: "ok", stderr: "" };
  }
}

describe("Ansible runner", () => {
  it("runs the declared playbook in the component directory", async () => {
    const commandRunner = new RecordingRunner();
    const runner = new AnsibleRunner(commandRunner);

    await expect(
      runner.run({
        component: "api",
        action: "deploy",
        adapter: "ansible",
        workspacePath: "/workspace",
        componentDir: "/workspace/components/api",
        componentRelativeDir: "components/api",
        playbook: "ansible/deploy.yml"
      })
    ).resolves.toEqual({ stdout: "ok", stderr: "" });

    expect(commandRunner.calls).toEqual([
      {
        command: "ansible-playbook",
        args: ["ansible/deploy.yml"],
        cwd: "/workspace/components/api",
        env: {}
      }
    ]);
  });

  it("runs declared playbooks in a helper container with project root mounted at /hf", async () => {
    const commandRunner = new RecordingRunner();
    const runner = new AnsibleRunner(commandRunner, { runnerImage: "ghcr.io/sepa79/hiveforge:v0.5.2" });

    await runner.run(
      {
        component: "stack",
        action: "deploy",
        adapter: "ansible",
        workspacePath: "/hf/workspace/pockethive",
        componentDir: "/hf/workspace/pockethive/deploy/hiveforge/components/stack",
        componentRelativeDir: "deploy/hiveforge/components/stack",
        playbook: "ansible/deploy.yml"
      },
      {
        actionRootSource: "/opt/hiveforge/data/deployed/pockethive",
        workspaceSource: "/opt/hiveforge/workspace/pockethive",
        environment: {
          HIVEFORGE_BIND_SOURCE_DIR: "/opt/hiveforge/data/deployed/pockethive",
          HIVEFORGE_PROFILE: "swarm-reduced"
        }
      }
    );

    expect(commandRunner.calls).toEqual([
      {
        command: "docker",
        args: [
          "run",
          "--rm",
          "-v",
          "/opt/hiveforge/data/deployed/pockethive:/hf",
          "-v",
          "/opt/hiveforge/workspace/pockethive:/workspace:ro",
          "-w",
          "/workspace/deploy/hiveforge/components/stack",
          "-e",
          "HIVEFORGE_BIND_SOURCE_DIR=/opt/hiveforge/data/deployed/pockethive",
          "-e",
          "HIVEFORGE_PROFILE=swarm-reduced",
          "ghcr.io/sepa79/hiveforge:v0.5.2",
          "ansible-playbook",
          "ansible/deploy.yml"
        ],
        cwd: undefined,
        env: undefined
      }
    ]);
  });

  it("requires an explicit or detected image for isolated action execution", async () => {
    const runner = new AnsibleRunner(new RecordingRunner(), { currentContainerId: () => undefined });

    await expect(
      runner.run(
        {
          component: "stack",
          action: "deploy",
          adapter: "ansible",
          workspacePath: "/hf/workspace/pockethive",
          componentDir: "/hf/workspace/pockethive/deploy/hiveforge/components/stack",
          componentRelativeDir: "deploy/hiveforge/components/stack",
          playbook: "ansible/deploy.yml"
        },
        {
          actionRootSource: "/opt/hiveforge/data/deployed/pockethive",
          workspaceSource: "/opt/hiveforge/workspace/pockethive"
        }
      )
    ).rejects.toThrow("HIVEFORGE_ACTION_RUNNER_IMAGE");
  });
});
