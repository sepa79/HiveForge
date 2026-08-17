import { describe, expect, it } from "vitest";
import { CommandExecutionError } from "../../src/workspace/command-runner.js";
import { NodeCommandRunner } from "../../src/workspace/node-command-runner.js";

describe("Node command runner", () => {
  it("throws command diagnostics with exit code and captured output", async () => {
    const runner = new NodeCommandRunner();

    await expect(
      runner.run("/bin/sh", [
        "-c",
        "printf 'stdout detail\\n'; printf 'stderr detail\\n' >&2; exit 7"
      ])
    ).rejects.toMatchObject({
      name: "CommandExecutionError",
      exitCode: 7,
      stdout: expect.stringContaining("stdout detail"),
      stderr: expect.stringContaining("stderr detail"),
      summary: expect.stringContaining("exit code 7")
    });
  });

  it("redacts obvious secret values from failed command diagnostics", async () => {
    const runner = new NodeCommandRunner();
    let caught: unknown;

    try {
      await runner.run("/bin/sh", ["-c", "printf 'HIVEMIND_OPENSEARCH_PASSWORD=super-secret\\n' >&2; exit 1"]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CommandExecutionError);
    const error = caught as CommandExecutionError;
    expect(error.stderr).toContain("HIVEMIND_OPENSEARCH_PASSWORD=[redacted]");
    expect(error.message).not.toContain("super-secret");
    expect(error.summary).not.toContain("super-secret");
  });
});
