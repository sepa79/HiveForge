import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createHiveForgeMcpRuntime } from "../../src/mcp/runtime.js";
import type { HiveForgeApiClient } from "../../src/mcp/api-client.js";

describe("HiveForge MCP runtime", () => {
  it("registers the documented tool names", async () => {
    const source = await readFile(new URL("../../src/mcp/server.ts", import.meta.url), "utf8");
    const toolNames = [...source.matchAll(/server\.registerTool\(\s*\n\s*"([^"]+)"/g)].map((match) => match[1]);

    expect(toolNames).toEqual([
      "list_projects",
      "list_environments",
      "list_deployments",
      "inspect_repository",
      "register_project",
      "inspect_project",
      "validate_requirements",
      "start_action",
      "get_operation",
      "list_operations",
      "read_journal"
    ]);
  });

  it("resolves package metadata from the built server location", async () => {
    const builtServerUrl = new URL("../../dist/src/mcp/server.js", import.meta.url);
    const packageJson = await readFile(new URL("../../../package.json", builtServerUrl), "utf8");

    expect(packageJson).toContain('"name": "hiveforge"');
  });

  it("returns structured JSON content from API responses", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async listProjects() {
        return { projects: [{ id: "hivewatch-local" }] };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.listProjects();

    expect("isError" in result).toBe(false);
    expect(result.structuredContent).toEqual({ projects: [{ id: "hivewatch-local" }] });
    expect(result.content[0].text).toContain("hivewatch-local");
  });
});
