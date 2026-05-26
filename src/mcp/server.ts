#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getHiveForgeInfo } from "../app-info.js";
import { HiveForgeApiClient } from "./api-client.js";
import { createHiveForgeMcpRuntime } from "./runtime.js";

const lifecycleAction = z.enum(["deploy", "remove", "purge", "update", "upgrade"]);
const releaseVarsSchema = z.record(z.string().min(1), z.string());
const releaseImageSchema = z.object({
  name: z.string().min(1),
  image: z.string().min(1),
  application: z.boolean()
});
const releaseArtifactSchema = z.object({
  env: releaseVarsSchema.optional(),
  images: z.array(releaseImageSchema).min(1)
});
const releaseProfileSchema = z.object({
  id: z.string().min(1),
  runtime: z.enum(["docker-single", "docker-swarm"]),
  serviceSet: z.string().min(1),
  requires: z
    .object({
      managedRoot: z
        .object({
          required: z.literal(true),
          shared: z.boolean(),
          node: z.string().min(1).optional()
        })
        .optional(),
      capabilities: z.array(z.enum(["placement"])).optional()
    })
    .optional()
});
const appInfo = getHiveForgeInfo();

export function createHiveForgeMcpServer(options: { baseUrl: string; authToken: string }): McpServer {
  const server = new McpServer({
    name: appInfo.name,
    version: appInfo.version
  });
  const runtime = createHiveForgeMcpRuntime(
    new HiveForgeApiClient({
      baseUrl: options.baseUrl,
      authToken: options.authToken
    })
  );

  server.registerTool(
    "check_health",
    {
      title: "Check HiveForge health",
      description: "Check the connected HiveForge REST endpoint process health.",
      inputSchema: {}
    },
    runtime.checkHealth
  );

  server.registerTool(
    "get_hiveforge_info",
    {
      title: "Get HiveForge info",
      description: "Read HiveForge name and version for the connected target.",
      inputSchema: {}
    },
    runtime.getHiveForgeInfo
  );

  server.registerTool(
    "list_projects",
    {
      title: "List HiveForge projects",
      description: "List registered project IDs, names, repositories, and approved refs.",
      inputSchema: {}
    },
    runtime.listProjects
  );

  server.registerTool(
    "list_environments",
    {
      title: "List HiveForge environments",
      description: "List current and known environment metadata, capabilities, and policy.",
      inputSchema: {}
    },
    runtime.listEnvironments
  );

  server.registerTool(
    "list_deployments",
    {
      title: "List deployment inventory",
      description: "List deployment inventory for the current environment.",
      inputSchema: {}
    },
    runtime.listDeployments
  );

  server.registerTool(
    "inspect_repository",
    {
      title: "Inspect a candidate repository",
      description: "Read-only inspection of a repository/ref for HiveForge deployability.",
      inputSchema: {
        repository: z.string().min(1),
        gitRef: z.string().min(1)
      }
    },
    runtime.inspectRepository
  );

  server.registerTool(
    "register_project",
    {
      title: "Register a deployable project",
      description: "Inspect a repository/ref and register it when it is deployable by HiveForge.",
      inputSchema: {
        repository: z.string().min(1),
        gitRef: z.string().min(1)
      }
    },
    runtime.registerProject
  );

  server.registerTool(
    "set_environment_project_policy",
    {
      title: "Set environment project policy",
      description: "Allow one registered project on one HiveForge environment with explicit actions and profiles.",
      inputSchema: {
        environmentId: z.string().min(1),
        projectId: z.string().min(1),
        actions: z.array(lifecycleAction).min(1),
        profiles: z.array(z.string().min(1)).optional()
      }
    },
    runtime.setEnvironmentProjectPolicy
  );

  server.registerTool(
    "inspect_project",
    {
      title: "Inspect a registered project",
      description: "Checkout a registered project ref and load root/component manifests.",
      inputSchema: {
        projectId: z.string().min(1),
        gitRef: z.string().min(1)
      }
    },
    runtime.inspectProject
  );

  server.registerTool(
    "validate_requirements",
    {
      title: "Validate project requirements",
      description: "Checkout, inspect, and validate declared runtime requirements.",
      inputSchema: {
        projectId: z.string().min(1),
        gitRef: z.string().min(1),
        profile: z.string().min(1).optional()
      }
    },
    runtime.validateRequirements
  );

  server.registerTool(
    "start_action",
    {
      title: "Start a lifecycle action",
      description: "Start a lifecycle action asynchronously and return an operation id for log polling.",
      inputSchema: {
        projectId: z.string().min(1),
        gitRef: z.string().min(1),
        component: z.string().min(1),
        action: lifecycleAction,
        profile: z.string().min(1).optional()
      }
    },
    runtime.startAction
  );

  server.registerTool(
    "deploy_release",
    {
      title: "Prepare a release deployment",
      description:
        "Validate and prepare a release/image-tag deployment plan. This does not build, push, or execute deployment actions.",
      inputSchema: {
        projectId: z.string().min(1),
        gitRef: z.string().min(1).optional(),
        component: z.string().min(1),
        action: lifecycleAction,
        profile: z.string().min(1).optional(),
        project: z.object({
          id: z.string().min(1),
          vars: releaseVarsSchema.optional(),
          profiles: z.array(releaseProfileSchema).optional()
        }).optional(),
        vars: releaseVarsSchema.optional(),
        releaseVars: releaseVarsSchema,
        images: z.array(releaseImageSchema).min(1).optional(),
        artifact: releaseArtifactSchema.optional(),
        requiredFiles: z.array(z.string().min(1)).optional()
      }
    },
    runtime.deployRelease
  );

  server.registerTool(
    "get_operation",
    {
      title: "Get operation status and logs",
      description: "Read one operation status and process-local logs.",
      inputSchema: {
        operationId: z.string().min(1)
      }
    },
    runtime.getOperation
  );

  server.registerTool(
    "list_operations",
    {
      title: "List process-local operations",
      description: "List lifecycle operations retained by the current HiveForge process.",
      inputSchema: {}
    },
    runtime.listOperations
  );

  server.registerTool(
    "read_journal",
    {
      title: "Read HiveForge journal",
      description: "Read durable append-only operation journal events.",
      inputSchema: {}
    },
    runtime.readJournal
  );

  return server;
}

if (isExecutedAsEntrypoint(import.meta.url, process.argv[1])) {
  const baseUrl = requiredEnv("HIVEFORGE_BASE_URL");
  const authToken = requiredEnv("HIVEFORGE_AUTH_TOKEN");
  const server = createHiveForgeMcpServer({ baseUrl, authToken });
  await server.connect(new StdioServerTransport());
}

function isExecutedAsEntrypoint(moduleUrl: string, argv1: string | undefined): boolean {
  if (!argv1) {
    return false;
  }
  return moduleUrl === pathToFileURL(argv1).href;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
