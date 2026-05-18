import { writeFile } from "node:fs/promises";
import YAML from "yaml";
import { loadYamlFile, schemaPaths, validateContract } from "../contracts/schema-loader.js";
import type { ProjectRegistryConfig, RegisteredProject } from "./project-registry-types.js";

export async function loadProjectRegistryConfig(filePath: string): Promise<ProjectRegistryConfig> {
  const registry = await loadYamlFile(filePath);
  await validateContract(schemaPaths.projectRegistry, registry);
  assertUniqueProjects(registry as ProjectRegistryConfig);
  return registry as ProjectRegistryConfig;
}

export async function saveProjectRegistryConfig(filePath: string, registry: ProjectRegistryConfig): Promise<void> {
  await validateContract(schemaPaths.projectRegistry, registry);
  assertUniqueProjects(registry);
  await writeFile(filePath, YAML.stringify(registry), "utf8");
}

export function selectRegisteredProject(
  registry: ProjectRegistryConfig,
  projectId: string,
  gitRef: string
): RegisteredProject {
  const project = registry.projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new Error(`Project is not registered: ${projectId}`);
  }

  if (!project.approvedRefs.includes(gitRef)) {
    throw new Error(`Git ref is not approved for ${projectId}: ${gitRef}`);
  }

  return project;
}

export function upsertRegisteredProject(
  registry: ProjectRegistryConfig,
  project: RegisteredProject
): ProjectRegistryConfig {
  const existing = registry.projects.find((candidate) => candidate.id === project.id);
  if (!existing) {
    return { projects: [...registry.projects, project] };
  }

  if (existing.repository !== project.repository) {
    throw new Error(`Registered project id already uses another repository: ${project.id}`);
  }

  return {
    projects: registry.projects.map((candidate) =>
      candidate.id === project.id
        ? {
            ...candidate,
            name: project.name,
            source: project.source,
            approvedRefs: [...new Set([...candidate.approvedRefs, ...project.approvedRefs])]
          }
        : candidate
    )
  };
}

function assertUniqueProjects(registry: ProjectRegistryConfig): void {
  const seenIds = new Set<string>();
  const seenRepositories = new Set<string>();

  for (const project of registry.projects) {
    if (seenIds.has(project.id)) {
      throw new Error(`Duplicate registered project id: ${project.id}`);
    }
    seenIds.add(project.id);

    if (seenRepositories.has(project.repository)) {
      throw new Error(`Duplicate registered project repository: ${project.repository}`);
    }
    seenRepositories.add(project.repository);
  }
}
