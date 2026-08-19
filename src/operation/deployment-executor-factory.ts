import type { EnvironmentDefinition } from "../config/environment-types.js";
import type { CommandRunner } from "../workspace/command-runner.js";
import type { DeploymentExecutor } from "./deployment-executor.js";
import { DockerDeploymentService } from "./docker-deployment-service.js";
import { PortainerDeploymentService } from "./portainer-deployment-service.js";

export function createDeploymentExecutor(
  environment: EnvironmentDefinition | undefined,
  commandRunner: CommandRunner
): DeploymentExecutor | undefined {
  if (!environment) {
    return undefined;
  }
  if (environment.deployment?.executor === "portainer-stack") {
    return new PortainerDeploymentService(environment);
  }
  return new DockerDeploymentService(commandRunner, environment);
}
