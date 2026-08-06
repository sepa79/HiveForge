import { readFile } from "node:fs/promises";
import YAML from "yaml";

describe("Docker Compose install template", () => {
  it("uses one explicit managed root host path for /hf and generated environment config", async () => {
    const raw = await readFile("deploy/docker-compose.hiveforge.yml", "utf8");
    const compose = YAML.parse(raw) as {
      services?: {
        hiveforge?: {
          environment?: Record<string, string>;
          volumes?: Array<{ source?: string; target?: string } | string>;
        };
      };
    };
    const hiveforge = compose.services?.hiveforge;

    expect(hiveforge?.environment?.HIVEFORGE_MANAGED_ROOT_BIND_SOURCE_ROOT).toBe(
      "${HIVEFORGE_MANAGED_ROOT_BIND_SOURCE_ROOT:-/opt/hiveforge}"
    );
    expect(hiveforge?.environment?.HIVEFORGE_ACTION_RUNNER_IMAGE).toBe(
      "${HIVEFORGE_IMAGE:-ghcr.io/sepa79/hiveforge:latest}"
    );
    expect(hiveforge?.volumes).toContainEqual({
      type: "bind",
      source: "${HIVEFORGE_MANAGED_ROOT_BIND_SOURCE_ROOT:-/opt/hiveforge}",
      target: "/hf"
    });
  });
});
