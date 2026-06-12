import path from "node:path";
import type { CommandRunner } from "../workspace/command-runner.js";

interface DockerMountInspect {
  Type?: string;
  Source?: string;
  Destination?: string;
}

export async function detectContainerBindSource(input: {
  commandRunner: CommandRunner;
  containerId: string;
  destination: string;
}): Promise<string | undefined> {
  const result = await input.commandRunner.run("docker", [
    "inspect",
    input.containerId,
    "--format",
    "{{json .Mounts}}"
  ]);
  const mounts = parseMounts(result.stdout);
  const mount = mounts.find((candidate) => candidate.Destination === input.destination);
  if (!mount) {
    return undefined;
  }
  if (mount.Type && mount.Type !== "bind") {
    return undefined;
  }
  if (!mount.Source) {
    throw new Error(`Docker inspect mount ${input.destination} is missing Source.`);
  }
  if (!path.isAbsolute(mount.Source)) {
    throw new Error(`Docker inspect mount ${input.destination} Source is not absolute: ${mount.Source}`);
  }
  return mount.Source;
}

function parseMounts(value: string): DockerMountInspect[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Docker inspect mounts response is not an array.");
  }
  return parsed as DockerMountInspect[];
}
