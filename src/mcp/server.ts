#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HiveForgeApiClient } from "./api-client.js";
import { createHiveForgeMcpRuntime } from "./runtime.js";

const lifecycleAction = z.enum(["deploy", "remove", "purge", "update", "upgrade"]);
const packageJson = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export function createHiveForgeMcpServer(options: { baseUrl: string; authToken: string }): McpServer {
  const server = new McpServer({
    name: "hiveforge",
    version: packageJson.version
  });
  const runtime = createHiveForgeMcpRuntime(
    new HiveForgeApiClient({
      baseUrl: options.baseUrl,
      authToken: options.authToken
    })
  );

  server.registerTool(
    "list_projects",
    {
      title: "List HiveForge projects",
      description: "List allowlisted project IDs, names, repositories, and allowed refs.",
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
    "inspect_project",
    {
      title: "Inspect an allowlisted project",
      description: "Checkout an allowlisted project ref and load root/component manifests.",
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const baseUrl = requiredEnv("HIVEFORGE_BASE_URL");
  const authToken = requiredEnv("HIVEFORGE_AUTH_TOKEN");
  const server = createHiveForgeMcpServer({ baseUrl, authToken });
  await server.connect(new StdioServerTransport());
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
