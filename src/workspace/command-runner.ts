export interface CommandResult {
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<CommandResult>;
}

export interface CommandFailureDetails extends CommandResult {
  exitCode?: number;
  signal?: string;
  cwd?: string;
}

export class CommandExecutionError extends Error {
  public readonly summary: string;
  public readonly stdout: string;
  public readonly stderr: string;
  public readonly exitCode?: number;
  public readonly signal?: string;
  public readonly command: string;
  public readonly args: string[];
  public readonly cwd?: string;

  constructor(command: string, args: string[], details: CommandFailureDetails, options?: ErrorOptions) {
    const stdout = redactSensitiveText(tailOutput(details.stdout));
    const stderr = redactSensitiveText(tailOutput(details.stderr));
    const summary = commandFailureSummary(command, args, details);
    super(commandFailureMessage(summary, stdout, stderr), options);
    this.name = "CommandExecutionError";
    this.summary = summary;
    this.stdout = stdout;
    this.stderr = stderr;
    this.exitCode = details.exitCode;
    this.signal = details.signal;
    this.command = command;
    this.args = [...args];
    this.cwd = details.cwd;
  }
}

export function isCommandExecutionError(error: unknown): error is CommandExecutionError {
  return error instanceof CommandExecutionError;
}

const MAX_OUTPUT_LINES = 80;
const MAX_OUTPUT_CHARS = 12_000;
const SENSITIVE_NAME = /(?:PASSWORD|PASSWD|TOKEN|SECRET|PRIVATE_KEY|AUTH_TOKEN|ACCESS_KEY|CREDENTIAL)/i;

function commandFailureSummary(command: string, args: string[], details: CommandFailureDetails): string {
  const status = details.exitCode !== undefined ? `exit code ${details.exitCode}` : details.signal ? `signal ${details.signal}` : "unknown exit status";
  const cwd = details.cwd ? `, cwd ${details.cwd}` : "";
  return `Command failed: ${formatCommand(command, args)} (${status}${cwd})`;
}

function commandFailureMessage(summary: string, stdout: string, stderr: string): string {
  const sections = [summary];
  if (stderr.length > 0) {
    sections.push(`stderr:\n${stderr}`);
  }
  if (stdout.length > 0) {
    sections.push(`stdout:\n${stdout}`);
  }
  if (stdout.length === 0 && stderr.length === 0) {
    sections.push("No stdout/stderr captured.");
  }
  return sections.join("\n\n");
}

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(formatArg).join(" ");
}

function formatArg(value: string): string {
  const redacted = SENSITIVE_NAME.test(value) ? "[redacted]" : value;
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(redacted)) {
    return redacted;
  }
  return JSON.stringify(redacted);
}

function tailOutput(output: string): string {
  if (output.length === 0) {
    return "";
  }
  const lines = output.replace(/\r\n/g, "\n").split("\n");
  const tailedLines = lines.slice(-MAX_OUTPUT_LINES).join("\n");
  if (tailedLines.length <= MAX_OUTPUT_CHARS) {
    return tailedLines;
  }
  return tailedLines.slice(tailedLines.length - MAX_OUTPUT_CHARS);
}

function redactSensitiveText(value: string): string {
  return value
    .split("\n")
    .map((line) => {
      if (!SENSITIVE_NAME.test(line)) {
        return line;
      }
      return line.replace(/([A-Z0-9_]*(?:PASSWORD|PASSWD|TOKEN|SECRET|PRIVATE_KEY|AUTH_TOKEN|ACCESS_KEY|CREDENTIAL)[A-Z0-9_]*["']?\s*[:=]\s*)(["']?)[^\s"',}]+/gi, "$1$2[redacted]");
    })
    .join("\n");
}
