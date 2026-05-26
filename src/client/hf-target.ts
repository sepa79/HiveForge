#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  defaultActiveTargetPath,
  defaultKnownHiveForgesPath,
  findKnownHiveForgeTarget,
  loadKnownHiveForges,
  readActiveTargetId,
  writeActiveTargetId
} from "./known-hiveforges.js";

interface TargetCliOptions {
  configPath: string;
  statePath: string;
  args: string[];
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseOptions(argv);
  const [command, targetId] = options.args;

  if (!command) {
    throw new Error("Missing command: list, use, or current");
  }

  if (command === "list") {
    await listTargets(options);
    return;
  }

  if (command === "use") {
    if (!targetId) {
      throw new Error("Missing target id for use");
    }
    await useTarget(options, targetId);
    return;
  }

  if (command === "current") {
    await showCurrent(options);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

async function listTargets(options: TargetCliOptions): Promise<void> {
  const config = await loadKnownHiveForges(options.configPath);
  const activeTargetId = await readActiveTargetId(options.statePath).catch(() => null);
  for (const target of config.knownHiveForges) {
    const active = target.id === activeTargetId ? "*" : " ";
    process.stdout.write(`${active} ${target.id}\t${target.name}\t${target.baseUrl}\t${target.authTokenEnv}\n`);
  }
}

async function useTarget(options: TargetCliOptions, targetId: string): Promise<void> {
  const config = await loadKnownHiveForges(options.configPath);
  const target = findKnownHiveForgeTarget(config, targetId);
  await writeActiveTargetId(target.id, options.statePath);
  process.stdout.write(`Active HiveForge target: ${target.id} (${target.name})\n`);
}

async function showCurrent(options: TargetCliOptions): Promise<void> {
  const config = await loadKnownHiveForges(options.configPath);
  const targetId = await readActiveTargetId(options.statePath);
  const target = findKnownHiveForgeTarget(config, targetId);
  process.stdout.write(`${target.id}\t${target.name}\t${target.baseUrl}\t${target.authTokenEnv}\n`);
}

function parseOptions(argv: string[]): TargetCliOptions {
  let configPath = process.env.HIVEFORGE_KNOWN_TARGETS_PATH ?? defaultKnownHiveForgesPath();
  let statePath = process.env.HIVEFORGE_ACTIVE_TARGET_PATH ?? defaultActiveTargetPath();
  const args = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") {
      configPath = requiredValue(argv[++index], "--config");
      continue;
    }
    if (arg === "--state") {
      statePath = requiredValue(argv[++index], "--state");
      continue;
    }
    args.push(arg);
  }

  return { configPath, statePath, args };
}

function requiredValue(value: string | undefined, flag: string): string {
  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
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
