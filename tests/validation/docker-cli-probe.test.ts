import { describe, expect, it } from "vitest";
import { DockerCliProbe } from "../../src/validation/docker-cli-probe.js";
import type { CommandResult, CommandRunner } from "../../src/workspace/command-runner.js";

class FailingRunner implements CommandRunner {
  constructor(private readonly error: Error) {}

  async run(): Promise<CommandResult> {
    throw this.error;
  }
}

describe("Docker CLI probe", () => {
  it("returns false only for missing Docker resources", async () => {
    const probe = new DockerCliProbe(new FailingRunner(new Error("Error: No such volume: hivewatch-data")));

    await expect(probe.volumeExists("hivewatch-data")).resolves.toBe(false);
  });

  it("propagates Docker CLI failures that are not missing resources", async () => {
    const probe = new DockerCliProbe(new FailingRunner(new Error("Cannot connect to the Docker daemon")));

    await expect(probe.volumeExists("hivewatch-data")).rejects.toThrow("Cannot connect to the Docker daemon");
  });
});
