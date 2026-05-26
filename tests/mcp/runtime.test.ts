import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createHiveForgeMcpRuntime } from "../../src/mcp/runtime.js";
import type { HiveForgeApiClient } from "../../src/mcp/api-client.js";

describe("HiveForge MCP runtime", () => {
  it("registers the documented tool names", async () => {
    const source = await readFile(new URL("../../src/mcp/server.ts", import.meta.url), "utf8");
    const toolNames = [...source.matchAll(/server\.registerTool\(\s*\n\s*"([^"]+)"/g)].map((match) => match[1]);

    expect(toolNames).toEqual([
      "check_health",
      "get_hiveforge_info",
      "list_projects",
      "list_environments",
      "list_deployments",
      "inspect_repository",
      "register_project",
      "set_environment_project_policy",
      "list_project_runtime_env",
      "set_project_runtime_env",
      "unset_project_runtime_env",
      "inspect_project",
      "validate_requirements",
      "start_action",
      "deploy_release",
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

  it("returns HiveForge info through the runtime", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async getInfo() {
        return { hiveforge: { name: "hiveforge", version: "0.1.0-test" } };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.getHiveForgeInfo();

    expect(result.structuredContent).toEqual({ hiveforge: { name: "hiveforge", version: "0.1.0-test" } });
  });

  it("returns connected endpoint health through the runtime", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async getHealth() {
        return { status: "ok", hiveforge: { name: "hiveforge", version: "0.4.2" } };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.checkHealth();

    expect(result.structuredContent).toEqual({
      status: "ok",
      hiveforge: { name: "hiveforge", version: "0.4.2" }
    });
  });

  it("returns release deployment prepare results through the runtime", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async deployRelease() {
        return { plan: { projectId: "pockethive", images: [] } };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.deployRelease({
      projectId: "pockethive",
      component: "stack",
      action: "deploy",
      project: { id: "pockethive" },
      releaseVars: { "release.imageTag": "dev-1" },
      artifact: {
        images: [{ name: "orchestrator", image: "registry/pockethive/orchestrator:dev-1", application: true }]
      }
    });

    expect(result.structuredContent).toEqual({ plan: { projectId: "pockethive", images: [] } });
  });

  it("sets environment project policy through the runtime", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async setEnvironmentProjectPolicy(input: unknown) {
        return { policy: input };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.setEnvironmentProjectPolicy({
      environmentId: "docker",
      projectId: "hivewatch",
      profiles: ["normal"],
      actions: ["deploy"]
    });

    expect(result.structuredContent).toEqual({
      policy: {
        environmentId: "docker",
        projectId: "hivewatch",
        profiles: ["normal"],
        actions: ["deploy"]
      }
    });
  });

  it("sets project runtime env through the runtime", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async setProjectRuntimeEnv(input: unknown) {
        return { entry: input };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.setProjectRuntimeEnv({
      projectId: "hivewatch",
      profile: "test",
      values: { IMAGE_TAG: "latest" }
    });

    expect(result.structuredContent).toEqual({
      entry: {
        projectId: "hivewatch",
        profile: "test",
        values: { IMAGE_TAG: "latest" }
      }
    });
  });
});
