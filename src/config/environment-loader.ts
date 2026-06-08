import { writeFile } from "node:fs/promises";
import YAML from "yaml";
import { loadYamlFile, schemaPaths, validateContract } from "../contracts/schema-loader.js";
import type { EnvironmentConfig } from "./environment-types.js";

export async function loadEnvironmentConfig(filePath: string): Promise<EnvironmentConfig> {
  const config = await loadYamlFile(filePath);
  await validateContract(schemaPaths.environments, config);
  assertEnvironmentConfig(config as EnvironmentConfig);
  return config as EnvironmentConfig;
}

export async function saveEnvironmentConfig(filePath: string, config: EnvironmentConfig): Promise<void> {
  await validateContract(schemaPaths.environments, config);
  assertEnvironmentConfig(config);
  await writeFile(filePath, YAML.stringify(config), "utf8");
}

function assertEnvironmentConfig(config: EnvironmentConfig): void {
  const seen = new Set<string>();
  for (const environment of config.environments) {
    if (seen.has(environment.id)) {
      throw new Error(`Duplicate environment id: ${environment.id}`);
    }
    seen.add(environment.id);

    const nodeIds = new Set<string>();
    const nodeHostnames = new Set<string>();
    for (const node of environment.nodes ?? []) {
      if (nodeIds.has(node.id)) {
        throw new Error(`Duplicate node id for environment ${environment.id}: ${node.id}`);
      }
      nodeIds.add(node.id);

      if (nodeHostnames.has(node.hostname)) {
        throw new Error(`Duplicate node hostname for environment ${environment.id}: ${node.hostname}`);
      }
      nodeHostnames.add(node.hostname);
    }

    const projectIds = new Set<string>();
    for (const project of environment.policy.projects) {
      if (projectIds.has(project.id)) {
        throw new Error(`Duplicate project policy for environment ${environment.id}: ${project.id}`);
      }
      projectIds.add(project.id);
    }
  }

  if (!seen.has(config.current)) {
    throw new Error(`Current environment is not defined: ${config.current}`);
  }
}
