import { saveEnvironmentConfig } from "./environment-loader.js";
import type { EnvironmentConfig, EnvironmentProjectPolicy } from "./environment-types.js";

export interface SetEnvironmentProjectPolicyRequest {
  environmentId: string;
  projectId: string;
  actions: EnvironmentProjectPolicy["actions"];
  profiles?: string[];
}

export interface SetEnvironmentProjectPolicyResult {
  environmentId: string;
  project: EnvironmentProjectPolicy;
}

export class EnvironmentPolicyEditor {
  constructor(
    private readonly environmentsPath: string,
    private readonly config: EnvironmentConfig
  ) {}

  async setProjectPolicy(request: SetEnvironmentProjectPolicyRequest): Promise<SetEnvironmentProjectPolicyResult> {
    if (request.actions.length === 0) {
      throw new Error("Project policy must allow at least one action");
    }

    const environment = this.config.environments.find((candidate) => candidate.id === request.environmentId);
    if (!environment) {
      throw new Error(`Environment is not defined: ${request.environmentId}`);
    }

    const project: EnvironmentProjectPolicy = {
      id: request.projectId,
      ...(request.profiles ? { profiles: request.profiles } : {}),
      actions: request.actions
    };

    const existingIndex = environment.policy.projects.findIndex((candidate) => candidate.id === request.projectId);
    if (existingIndex === -1) {
      environment.policy.projects.push(project);
    } else {
      environment.policy.projects[existingIndex] = project;
    }

    await saveEnvironmentConfig(this.environmentsPath, this.config);
    return {
      environmentId: environment.id,
      project
    };
  }
}
