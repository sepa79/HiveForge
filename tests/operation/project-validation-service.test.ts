import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonlJournal } from "../../src/journal/jsonl-journal.js";
import type { ProjectRegistry } from "../../src/manifest/manifest-types.js";
import type { Clock } from "../../src/operation/clock.js";
import type { IdGenerator } from "../../src/operation/id-generator.js";
import { ProjectValidationService } from "../../src/operation/project-validation-service.js";
import type { DockerProbe } from "../../src/validation/docker-probe.js";
import { RequirementValidator } from "../../src/validation/requirement-validator.js";

class SequenceIds implements IdGenerator {
  private next = 1;

  nextId(prefix: string): string {
    return `${prefix}-${this.next++}`;
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-05-17T10:00:00.000Z");
  }
}

class FakeDockerProbe implements DockerProbe {
  constructor(
    private readonly volumes: Set<string>,
    private readonly secrets: Set<string>
  ) {}

  async volumeExists(name: string): Promise<boolean> {
    return this.volumes.has(name);
  }

  async secretExists(name: string): Promise<boolean> {
    return this.secrets.has(name);
  }
}

describe("project validation service", () => {
  it("journals successful validation", async () => {
    const journalDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const service = serviceWith(
      journalDir,
      new FakeDockerProbe(new Set(["hivewatch-api-data"]), new Set(["hivewatch-api-token"])),
      { HIVEWATCH_API_PORT: "3000" }
    );

    const result = await service.validate(request());

    expect(result.report.ok).toBe(true);
    await expect(new JsonlJournal(journalDir).readAll()).resolves.toEqual([
      {
        eventId: "evt-2",
        operationId: "op-1",
        operationType: "validate_requirements",
        project: "hivewatch",
        repository: "https://github.com/sepa79/HiveWatch.git",
        gitRef: "main",
        status: "succeeded",
        startedAt: "2026-05-17T10:00:00.000Z",
        endedAt: "2026-05-17T10:00:00.000Z",
        reason: "All declared requirements are available"
      }
    ]);
  });

  it("journals explicit validation failure", async () => {
    const journalDir = await mkdtemp(path.join(os.tmpdir(), "hiveforge-journal-"));
    const service = serviceWith(journalDir, new FakeDockerProbe(new Set(), new Set()), {});

    await expect(service.validate(request())).rejects.toThrow("Missing Docker volume for api: hivewatch-api-data");
    const events = await new JsonlJournal(journalDir).readAll();
    expect(events).toMatchObject([
      {
        eventId: "evt-2",
        operationId: "op-1",
        operationType: "validate_requirements",
        project: "hivewatch",
        repository: "https://github.com/sepa79/HiveWatch.git",
        gitRef: "main",
        status: "failed",
        reason: [
          "Missing Docker volume for api: hivewatch-api-data",
          "Missing Docker secret for api: hivewatch-api-token",
          "Missing environment variable for api: HIVEWATCH_API_PORT"
        ].join("; ")
      }
    ]);
  });
});

function serviceWith(journalDir: string, probe: DockerProbe, environment: NodeJS.ProcessEnv): ProjectValidationService {
  return new ProjectValidationService(
    new RequirementValidator(probe, environment),
    new JsonlJournal(journalDir),
    new SequenceIds(),
    new FixedClock()
  );
}

function request() {
  return {
    projectId: "hivewatch",
    repository: "https://github.com/sepa79/HiveWatch.git",
    gitRef: "main",
    registry: registry()
  };
}

function registry(): ProjectRegistry {
  return {
    project: {
      name: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git"
    },
    components: [
      {
        name: "api",
        manifestPath: "components/api/hiveforge.yaml",
        manifest: {
          kind: "component",
          component: {
            name: "api",
            project: "hivewatch"
          },
          deployment: {
            adapter: "ansible",
            actions: {
              deploy: {
                playbook: "ansible/deploy.yml"
              }
            }
          },
          requirements: {
            volumes: ["hivewatch-api-data"],
            secrets: ["hivewatch-api-token"],
            environment: ["HIVEWATCH_API_PORT"]
          }
        }
      }
    ]
  };
}
