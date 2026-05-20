export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<CommandResult>;
}
