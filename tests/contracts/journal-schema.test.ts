import { describe, expect, it } from "vitest";
import { ContractValidationError, schemaPaths, validateContract } from "../../src/contracts/schema-loader.js";

describe("journal event schema", () => {
  it("accepts operation events that identify target ref and outcome", async () => {
    const event = {
      eventId: "evt-1",
      operationId: "op-1",
      operationType: "run_action",
      project: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      gitRef: "main",
      component: "api",
      action: "deploy",
      adapter: "ansible",
      status: "failed",
      startedAt: "2026-05-17T10:00:00.000Z",
      endedAt: "2026-05-17T10:00:03.000Z",
      reason: "Missing required Docker secret: hivewatch-api-token"
    };

    await expect(validateContract(schemaPaths.journalEvent, event)).resolves.toBeUndefined();
  });

  it("rejects secret-shaped extra fields", async () => {
    const event = {
      eventId: "evt-1",
      operationId: "op-1",
      operationType: "run_action",
      project: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      gitRef: "main",
      component: "api",
      action: "deploy",
      adapter: "ansible",
      status: "failed",
      startedAt: "2026-05-17T10:00:00.000Z",
      endedAt: "2026-05-17T10:00:03.000Z",
      reason: "Missing required Docker secret: hivewatch-api-token",
      secretValue: "do-not-store-this"
    };

    await expect(validateContract(schemaPaths.journalEvent, event)).rejects.toBeInstanceOf(ContractValidationError);
  });

  it("accepts project inspection events without component action fields", async () => {
    const event = {
      eventId: "evt-1",
      operationId: "op-1",
      operationType: "inspect_project",
      project: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      gitRef: "main",
      status: "succeeded",
      startedAt: "2026-05-17T10:00:00.000Z",
      endedAt: "2026-05-17T10:00:03.000Z",
      reason: "Loaded 1 managed component"
    };

    await expect(validateContract(schemaPaths.journalEvent, event)).resolves.toBeUndefined();
  });

  it("accepts failed pre-checkout events without repository", async () => {
    const event = {
      eventId: "evt-1",
      operationId: "op-1",
      operationType: "inspect_project",
      project: "pockethive",
      gitRef: "main",
      status: "failed",
      startedAt: "2026-05-17T10:00:00.000Z",
      endedAt: "2026-05-17T10:00:03.000Z",
      reason: "Project is not registered: pockethive"
    };

    await expect(validateContract(schemaPaths.journalEvent, event)).resolves.toBeUndefined();
  });

  it("accepts local git repository events for local Docker smoke tests", async () => {
    const event = {
      eventId: "evt-1",
      operationId: "op-1",
      operationType: "inspect_project",
      project: "hivewatch-local",
      repository: "file:///home/sepa/HiveForge/tmp/hivewatch-fixture.git",
      gitRef: "main",
      status: "succeeded",
      startedAt: "2026-05-17T10:00:00.000Z",
      endedAt: "2026-05-17T10:00:03.000Z",
      reason: "Loaded 1 managed component"
    };

    await expect(validateContract(schemaPaths.journalEvent, event)).resolves.toBeUndefined();
  });

  it("accepts internal HTTP git repository events", async () => {
    const event = {
      eventId: "evt-1",
      operationId: "op-1",
      operationType: "inspect_project",
      project: "pockethive-development",
      repository: "http://192.168.88.54:8081/git/PocketHive.git",
      gitRef: "pockethive-debug-mcp",
      status: "succeeded",
      startedAt: "2026-05-17T10:00:00.000Z",
      endedAt: "2026-05-17T10:00:03.000Z",
      reason: "Loaded 1 managed component"
    };

    await expect(validateContract(schemaPaths.journalEvent, event)).resolves.toBeUndefined();
  });

  it("rejects arbitrary HTTP repository events", async () => {
    const event = {
      eventId: "evt-1",
      operationId: "op-1",
      operationType: "inspect_project",
      project: "pockethive-development",
      repository: "http://example.com/PocketHive.git",
      gitRef: "pockethive-debug-mcp",
      status: "succeeded",
      startedAt: "2026-05-17T10:00:00.000Z",
      endedAt: "2026-05-17T10:00:03.000Z",
      reason: "Loaded 1 managed component"
    };

    await expect(validateContract(schemaPaths.journalEvent, event)).rejects.toBeInstanceOf(ContractValidationError);
  });
});
