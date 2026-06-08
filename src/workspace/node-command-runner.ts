import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CommandExecutionError, type CommandResult, type CommandRunner } from "./command-runner.js";

const execFileAsync = promisify(execFile);

export class NodeCommandRunner implements CommandRunner {
  async run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<CommandResult> {
    try {
      const { stdout, stderr } = await execFileAsync(command, args, {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        windowsHide: true
      });

      return { stdout, stderr };
    } catch (error) {
      throw new CommandExecutionError(
        command,
        args,
        {
          cwd: options.cwd,
          exitCode: exitCode(error),
          signal: signal(error),
          stdout: output(error, "stdout"),
          stderr: output(error, "stderr")
        },
        error instanceof Error ? { cause: error } : undefined
      );
    }
  }
}

function exitCode(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "number"
    ? error.code
    : undefined;
}

function signal(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "signal" in error && typeof error.signal === "string"
    ? error.signal
    : undefined;
}

function output(error: unknown, key: "stdout" | "stderr"): string {
  if (!(typeof error === "object" && error !== null && key in error)) {
    return "";
  }
  const value = (error as Record<"stdout" | "stderr", unknown>)[key];
  if (typeof value === "string") {
    return value;
  }
  return Buffer.isBuffer(value) ? value.toString("utf8") : "";
}
