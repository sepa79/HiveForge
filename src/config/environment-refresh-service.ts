import { saveEnvironmentConfig } from "./environment-loader.js";
import type { EnvironmentConfig, EnvironmentDefinition } from "./environment-types.js";
import { createDefaultEnvironmentConfig } from "../runtime/default-environment.js";
import type { CommandRunner } from "../workspace/command-runner.js";

export interface EnvironmentRefreshOptions {
  docker: CommandRunner;
}

export interface EnvironmentRefreshResult {
  current: EnvironmentDefinition;
  known: EnvironmentDefinition[];
}

export class EnvironmentRefreshService {
  constructor(
    private readonly environmentsPath: string,
    private readonly config: EnvironmentConfig,
    private readonly options: EnvironmentRefreshOptions
  ) {}

  async refreshCurrent(): Promise<EnvironmentRefreshResult> {
    const current = this.config.environments.find((environment) => environment.id === this.config.current);
    if (!current) {
      throw new Error(`Current environment is not defined: ${this.config.current}`);
    }

    const detectedConfig = await createDefaultEnvironmentConfig({ docker: this.options.docker });
    const detected = detectedConfig.environments.find((environment) => environment.id === detectedConfig.current);
    if (!detected) {
      throw new Error(`Detected current environment is not defined: ${detectedConfig.current}`);
    }

    if (detected.id !== current.id) {
      throw new Error(
        `Detected environment id ${detected.id} does not match current environment ${current.id}; refresh requires the same environment id.`
      );
    }

    const refreshed: EnvironmentDefinition = {
      ...detected,
      name: current.name,
      ...(current.description ? { description: current.description } : {}),
      capabilities: {
        ...detected.capabilities,
        managedRoot: current.capabilities.managedRoot
      },
      ...(current.vars ? { vars: current.vars } : {}),
      policy: current.policy
    };

    replaceEnvironment(current, refreshed);
    await saveEnvironmentConfig(this.environmentsPath, this.config);

    return {
      current,
      known: this.config.environments
    };
  }
}

function replaceEnvironment(target: EnvironmentDefinition, source: EnvironmentDefinition): void {
  for (const key of Object.keys(target) as Array<keyof EnvironmentDefinition>) {
    delete target[key];
  }
  Object.assign(target, source);
}
