import {
  saveProjectRegistryConfig,
  upsertRegisteredProject
} from "../config/project-registry-loader.js";
import type { ProjectRegistryConfig, RegisteredProject } from "../config/project-registry-types.js";
import type { RepositoryInspectionService } from "./repository-inspection-service.js";

export interface ProjectRegistrationRequest {
  repository: string;
  gitRef: string;
}

export interface ProjectRegistrationResult {
  project: RegisteredProject;
  deployable: true;
}

export class ProjectRegistrationService {
  constructor(
    private readonly registryPath: string,
    private readonly registry: ProjectRegistryConfig,
    private readonly repositoryInspection: RepositoryInspectionService
  ) {}

  async register(request: ProjectRegistrationRequest): Promise<ProjectRegistrationResult> {
    const inspection = await this.repositoryInspection.inspect(request);
    if (!inspection.deployable || !inspection.project) {
      throw new Error(inspection.reason ?? "Repository is not deployable by HiveForge");
    }

    const project: RegisteredProject = {
      id: inspection.project.name,
      name: inspection.project.name,
      source: sourceForRepository(request.repository),
      repository: request.repository,
      approvedRefs: [request.gitRef]
    };
    const updated = upsertRegisteredProject(this.registry, project);
    await saveProjectRegistryConfig(this.registryPath, updated);
    this.registry.projects = updated.projects;

    return {
      project: updated.projects.find((candidate) => candidate.id === project.id) ?? project,
      deployable: true
    };
  }
}

function sourceForRepository(repository: string): RegisteredProject["source"] {
  if (repository.startsWith("file:///")) {
    return "local-git";
  }
  if (/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(repository)) {
    return "github";
  }
  throw new Error(`Repository source is not supported for registration: ${repository}`);
}
