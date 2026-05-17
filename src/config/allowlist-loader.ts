import { loadYamlFile, schemaPaths, validateContract } from "../contracts/schema-loader.js";
import type { AllowlistProject, RepositoryAllowlist } from "./allowlist-types.js";

export async function loadAllowlist(filePath: string): Promise<RepositoryAllowlist> {
  const allowlist = await loadYamlFile(filePath);
  await validateContract(schemaPaths.allowlist, allowlist);
  assertUniqueProjects(allowlist as RepositoryAllowlist);
  return allowlist as RepositoryAllowlist;
}

export function selectAllowedProject(
  allowlist: RepositoryAllowlist,
  projectId: string,
  gitRef: string
): AllowlistProject {
  const project = allowlist.projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    throw new Error(`Project is not allowlisted: ${projectId}`);
  }

  if (!project.allowedRefs.includes(gitRef)) {
    throw new Error(`Git ref is not allowlisted for ${projectId}: ${gitRef}`);
  }

  return project;
}

function assertUniqueProjects(allowlist: RepositoryAllowlist): void {
  const seenIds = new Set<string>();
  const seenRepositories = new Set<string>();

  for (const project of allowlist.projects) {
    if (seenIds.has(project.id)) {
      throw new Error(`Duplicate allowlist project id: ${project.id}`);
    }
    seenIds.add(project.id);

    if (seenRepositories.has(project.repository)) {
      throw new Error(`Duplicate allowlist repository: ${project.repository}`);
    }
    seenRepositories.add(project.repository);
  }
}
