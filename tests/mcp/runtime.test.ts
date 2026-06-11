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
      "refresh_environment",
      "list_environment_nodes",
      "list_deployments",
      "diagnose_hiveforge_runtime",
      "check_deployment_runtime_status",
      "diagnose_deployment",
      "get_deployment_compose",
      "inspect_repository",
      "register_project",
      "set_environment_project_policy",
      "list_project_runtime_env",
      "set_project_runtime_env",
      "unset_project_runtime_env",
      "inspect_project",
      "explain_deploy_prerequisites",
      "validate_requirements",
      "start_action",
      "prepare_release_deploy",
      "get_operation",
      "list_operations",
      "read_journal"
    ]);
  });

  it("requires deploymentId for deployment diagnostics in the MCP tool schema", async () => {
    const source = await readFile(new URL("../../src/mcp/server.ts", import.meta.url), "utf8");
    const toolBlock = source.slice(source.indexOf('"diagnose_deployment"'), source.indexOf('"get_deployment_compose"'));

    expect(toolBlock).toContain("deploymentId: z.string().min(1)");
    expect(toolBlock).not.toContain("deploymentId: z.string().min(1).optional()");
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

  it("refreshes the current environment through the runtime", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async refreshEnvironment() {
        return { current: { id: "swarm", name: "Docker Swarm" }, known: [] };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.refreshEnvironment();

    expect(result.structuredContent).toEqual({ current: { id: "swarm", name: "Docker Swarm" }, known: [] });
  });

  it("returns HiveForge runtime diagnostics through the runtime", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async diagnoseHiveForgeRuntime() {
        return {
          managedRoot: {
            controlPlanePath: "/hf/data",
            bindSourceRoot: "/mnt/shared_nfs/hiveforge",
            visibilityStatus: "configured"
          }
        };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.diagnoseHiveForgeRuntime();

    expect(result.structuredContent).toEqual({
      managedRoot: {
        controlPlanePath: "/hf/data",
        bindSourceRoot: "/mnt/shared_nfs/hiveforge",
        visibilityStatus: "configured"
      }
    });
  });

  it("checks deployment runtime status through the runtime", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async checkDeploymentRuntimeStatus(input: unknown) {
        return { summary: "running", input };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.checkDeploymentRuntimeStatus({ deploymentId: "deployment-1" });

    expect(result.structuredContent).toEqual({
      summary: "running",
      input: { deploymentId: "deployment-1" }
    });
  });

  it("diagnoses deployments through the runtime", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async diagnoseDeployment(input: unknown) {
        return { state: { status: "present" }, input };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.diagnoseDeployment({ deploymentId: "deployment-1" });

    expect(result.structuredContent).toEqual({
      state: { status: "present" },
      input: { deploymentId: "deployment-1" }
    });
  });

  it("gets deployment compose through the runtime", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async getDeploymentCompose(input: unknown) {
        return { status: "present", input };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.getDeploymentCompose({ operationId: "op-1" });

    expect(result.structuredContent).toEqual({
      status: "present",
      input: { operationId: "op-1" }
    });
  });

  it("lists current environment nodes with labels through the runtime", async () => {
    const nodes = [
      {
        id: "node-1",
        hostname: "docker-swarm-mgr-1",
        role: "manager",
        availability: "active",
        status: "ready",
        labels: {
          "pockethive.postgres": "true"
        }
      }
    ];
    const runtime = createHiveForgeMcpRuntime({
      async listEnvironments() {
        return {
          current: {
            id: "swarm",
            name: "Docker Swarm",
            nodes
          },
          known: []
        };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.listEnvironmentNodes();

    expect(result.structuredContent).toEqual({
      environmentId: "swarm",
      environmentName: "Docker Swarm",
      nodes
    });
    expect(result.content[0].text).toContain("pockethive.postgres");
  });

  it("returns release deployment prepare results through the runtime", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async prepareReleaseDeploy() {
        return { plan: { projectId: "pockethive", images: [] } };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.prepareReleaseDeploy({
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

  it("returns deploy prerequisites through the runtime", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async explainDeployPrerequisites(input: unknown) {
        return { ready: false, input };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.explainDeployPrerequisites({
      projectId: "pockethive",
      gitRef: "v1.2.3",
      component: "stack",
      action: "deploy",
      profile: "swarm-reduced"
    });

    expect(result.structuredContent).toEqual({
      ready: false,
      input: {
        projectId: "pockethive",
        gitRef: "v1.2.3",
        component: "stack",
        action: "deploy",
        profile: "swarm-reduced"
      }
    });
  });

  it("starts lifecycle actions with an explicit deployment name through the runtime", async () => {
    const runtime = createHiveForgeMcpRuntime({
      async startAction(input: unknown) {
        return { operationId: "uiop-1", input };
      }
    } as unknown as HiveForgeApiClient);

    const result = await runtime.startAction({
      projectId: "hivewatch",
      gitRef: "main",
      component: "service",
      action: "deploy",
      profile: "docker-swarm",
      deploymentName: "hivewatch-canary"
    });

    expect(result.structuredContent).toEqual({
      operationId: "uiop-1",
      input: {
        projectId: "hivewatch",
        gitRef: "main",
        component: "service",
        action: "deploy",
        profile: "docker-swarm",
        deploymentName: "hivewatch-canary"
      }
    });
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
