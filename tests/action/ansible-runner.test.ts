import { describe, expect, it } from "vitest";
import { AnsibleRunner } from "../../src/action/ansible-runner.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";

class RecordingRunner implements CommandRunner {
  public readonly calls: Array<{ command: string; args: string[]; cwd?: string }> = [];

  async run(command: string, args: string[], options: { cwd?: string } = {}) {
    this.calls.push({ command, args, cwd: options.cwd });
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
        componentDir: "/workspace/components/api",
        playbook: "ansible/deploy.yml"
      })
    ).resolves.toEqual({ stdout: "ok", stderr: "" });

    expect(commandRunner.calls).toEqual([
      {
        command: "ansible-playbook",
        args: ["ansible/deploy.yml"],
        cwd: "/workspace/components/api"
      }
    ]);
  });
});
