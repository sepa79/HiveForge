import { describe, expect, it } from "vitest";
import { detectContainerBindSource } from "../../src/runtime/container-bind-source.js";
import type { CommandRunner } from "../../src/workspace/command-runner.js";

describe("container bind source detection", () => {
  it("detects the host source for a bind-mounted container path", async () => {
    await expect(
      detectContainerBindSource({
        commandRunner: commandRunner(
          JSON.stringify([
            {
              Type: "bind",
              Source: "/mnt/shared_nfs/hiveforge",
              Destination: "/hf"
            }
          ])
        ),
        containerId: "container-1",
        destination: "/hf"
      })
    ).resolves.toBe("/mnt/shared_nfs/hiveforge");
  });

  it("does not treat Docker volumes as bind-source paths", async () => {
    await expect(
      detectContainerBindSource({
        commandRunner: commandRunner(
          JSON.stringify([
            {
              Type: "volume",
              Source: "/var/lib/docker/volumes/hiveforge/_data",
              Destination: "/hf"
            }
          ])
        ),
        containerId: "container-1",
        destination: "/hf"
      })
    ).resolves.toBeUndefined();
  });

  it("fails explicitly when Docker reports a non-absolute bind source", async () => {
    await expect(
      detectContainerBindSource({
        commandRunner: commandRunner(
          JSON.stringify([
            {
              Type: "bind",
              Source: "relative/hiveforge",
              Destination: "/hf"
            }
          ])
        ),
        containerId: "container-1",
        destination: "/hf"
      })
    ).rejects.toThrow("Docker inspect mount /hf Source is not absolute: relative/hiveforge");
  });
});

function commandRunner(stdout: string): CommandRunner {
  return {
    async run(command: string, args: string[]) {
      expect(command).toBe("docker");
      expect(args).toEqual(["inspect", "container-1", "--format", "{{json .Mounts}}"]);
      return {
        stdout,
        stderr: ""
      };
    }
  };
}
