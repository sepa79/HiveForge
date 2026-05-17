import type { EnvironmentDefinition } from "./environment-types.js";

export interface EnvironmentActionRequest {
  projectId: string;
  action: string;
  profile?: string;
}

export class EnvironmentPolicyService {
  constructor(private readonly environment: EnvironmentDefinition) {}

  assertActionAllowed(request: EnvironmentActionRequest): void {
    const project = this.environment.policy.projects.find((candidate) => candidate.id === request.projectId);
    if (!project) {
      throw new Error(`Project is not allowed on environment ${this.environment.id}: ${request.projectId}`);
    }

    if (!(project.actions as string[]).includes(request.action)) {
      throw new Error(
        `Action is not allowed on environment ${this.environment.id} for ${request.projectId}: ${request.action}`
      );
    }

    if (project.profiles) {
      if (!request.profile) {
        throw new Error(`Missing required profile for environment ${this.environment.id}: ${request.projectId}`);
      }
      if (!project.profiles.includes(request.profile)) {
        throw new Error(
          `Profile is not allowed on environment ${this.environment.id} for ${request.projectId}: ${request.profile}`
        );
      }
    }
  }
}
