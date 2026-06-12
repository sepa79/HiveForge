import path from "node:path";
import type { CommandResult, CommandRunner } from "../workspace/command-runner.js";
import type { ResolvedAction } from "./action-resolver.js";

export interface ActionRunner {
  run(action: ResolvedAction, context?: ActionRunContext): Promise<CommandResult>;
}

export interface ActionRunContext {
  environment?: NodeJS.ProcessEnv;
  actionRootSource?: string;
  workspaceSource?: string;
}

export interface AnsibleRunnerOptions {
  runnerImage?: string;
  currentContainerId?: () => string | undefined;
}

export class AnsibleRunner implements ActionRunner {
  constructor(
    private readonly commandRunner: CommandRunner,
    private readonly options: AnsibleRunnerOptions = {}
  ) {}

  async run(action: ResolvedAction, context: ActionRunContext = {}): Promise<CommandResult> {
    if (action.adapter !== "ansible") {
      throw new Error(`Unsupported action adapter: ${action.adapter}`);
    }

    const environment = context.environment ?? {};
    if (context.actionRootSource || context.workspaceSource) {
      return this.runIsolated(action, context, environment);
    }

    return this.commandRunner.run("ansible-playbook", [action.playbook], {
      cwd: action.componentDir,
      env: environment
    });
  }

  private async runIsolated(
    action: ResolvedAction,
    context: ActionRunContext,
    environment: NodeJS.ProcessEnv
  ): Promise<CommandResult> {
    if (!context.actionRootSource) {
      throw new Error("Ansible action root isolation requires actionRootSource.");
    }
    if (!context.workspaceSource) {
      throw new Error("Ansible action root isolation requires workspaceSource.");
    }

    const image = await this.resolveRunnerImage();
    const args = [
      "run",
      "--rm",
      "-v",
      `${context.actionRootSource}:${ACTION_ROOT_PATH}`,
      "-v",
      `${context.workspaceSource}:${WORKSPACE_PATH}:ro`,
      "-w",
      path.posix.join(WORKSPACE_PATH, toPosixRelativePath(action.componentRelativeDir))
    ];

    for (const [name, value] of Object.entries(containerEnvironment(environment))) {
      args.push("-e", `${name}=${value}`);
    }

    args.push(image, "ansible-playbook", action.playbook);
    return this.commandRunner.run("docker", args);
  }

  private async resolveRunnerImage(): Promise<string> {
    const configured = this.options.runnerImage?.trim();
    if (configured) {
      return configured;
    }

    const containerId = this.options.currentContainerId?.() ?? process.env.HOSTNAME;
    if (!containerId) {
      throw new Error(
        "Ansible action root isolation requires HIVEFORGE_ACTION_RUNNER_IMAGE when the current HiveForge container image cannot be detected."
      );
    }

    const result = await this.commandRunner.run("docker", ["inspect", containerId, "--format", "{{.Config.Image}}"]);
    const image = result.stdout.trim();
    if (!image) {
      throw new Error("Ansible action root isolation could not determine the current HiveForge container image.");
    }
    return image;
  }
}

export const ACTION_ROOT_PATH = "/hf";
export const WORKSPACE_PATH = "/workspace";

const INHERITED_ACTION_ENV = ["HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"] as const;

function containerEnvironment(environment: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const name of INHERITED_ACTION_ENV) {
    const value = process.env[name];
    if (value !== undefined) {
      result[name] = value;
    }
  }
  for (const [name, value] of Object.entries(environment)) {
    if (value !== undefined) {
      result[name] = value;
    }
  }
  return result;
}

function toPosixRelativePath(relativePath: string): string {
  if (relativePath.length === 0) {
    return ".";
  }
  return relativePath.split(path.sep).join(path.posix.sep);
}
