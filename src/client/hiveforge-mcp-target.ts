#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHiveForgeMcpServer } from "../mcp/server.js";
import { resolveActiveHiveForgeTarget } from "./known-hiveforges.js";

export async function main(): Promise<void> {
  const { target, authToken } = await resolveActiveHiveForgeTarget({
    configPath: process.env.HIVEFORGE_KNOWN_TARGETS_PATH,
    statePath: process.env.HIVEFORGE_ACTIVE_TARGET_PATH
  });
  const server = createHiveForgeMcpServer({
    baseUrl: target.baseUrl,
    authToken
  });
  await server.connect(new StdioServerTransport());
}

if (isExecutedAsEntrypoint(import.meta.url, process.argv[1])) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Command failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

function isExecutedAsEntrypoint(moduleUrl: string, argv1: string | undefined): boolean {
  return Boolean(argv1) && moduleUrl === pathToFileURL(argv1).href;
}
