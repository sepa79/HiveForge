import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CommandResult, CommandRunner } from "./command-runner.js";

const execFileAsync = promisify(execFile);

export class NodeCommandRunner implements CommandRunner {
  async run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<CommandResult> {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      windowsHide: true
    });

    return { stdout, stderr };
  }
}
