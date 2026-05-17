import type { CommandRunner } from "../workspace/command-runner.js";
import type { DockerProbe } from "./docker-probe.js";

export class DockerCliProbe implements DockerProbe {
  constructor(private readonly commandRunner: CommandRunner) {}

  async volumeExists(name: string): Promise<boolean> {
    return this.inspect("volume", name);
  }

  async secretExists(name: string): Promise<boolean> {
    return this.inspect("secret", name);
  }

  private async inspect(kind: "volume" | "secret", name: string): Promise<boolean> {
    try {
      await this.commandRunner.run("docker", [kind, "inspect", name]);
      return true;
    } catch (error) {
      if (isMissingDockerResource(error)) {
        return false;
      }
      throw error;
    }
  }
}

function isMissingDockerResource(error: unknown): boolean {
  const output = [
    error instanceof Error ? error.message : "",
    typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string"
      ? error.stderr
      : ""
  ].join("\n");

  return /no such (volume|secret)|not found/i.test(output);
}
