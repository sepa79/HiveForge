import type { CommandResult, CommandRunner } from "../workspace/command-runner.js";
import type { ResolvedAction } from "./action-resolver.js";

export interface ActionRunner {
  run(action: ResolvedAction, environment?: NodeJS.ProcessEnv): Promise<CommandResult>;
}

export class AnsibleRunner implements ActionRunner {
  constructor(private readonly commandRunner: CommandRunner) {}

  async run(action: ResolvedAction, environment: NodeJS.ProcessEnv = {}): Promise<CommandResult> {
    if (action.adapter !== "ansible") {
      throw new Error(`Unsupported action adapter: ${action.adapter}`);
    }

    return this.commandRunner.run("ansible-playbook", [action.playbook], {
      cwd: action.componentDir,
      env: environment
    });
  }
}
