import {
  saveProjectRegistryConfig,
  upsertRegisteredProject
} from "../config/project-registry-loader.js";
import type { ProjectRegistryConfig, RegisteredProject } from "../config/project-registry-types.js";
import { sourceForRepository } from "../config/repository-source.js";
import type { RepositoryInspectionService } from "./repository-inspection-service.js";

export interface ProjectRegistrationRequest {
  repository: string;
  gitRef: string;
  registrationKind?: ProjectRegistrationKind;
}

export interface ProjectRegistrationResult {
  project: RegisteredProject;
  deployable: true;
}

export type ProjectRegistrationKind = "official" | "development";

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

    const registrationKind = request.registrationKind ?? "official";
    const project: RegisteredProject = {
      id: registeredProjectId(inspection.project.name, registrationKind),
      name: registeredProjectName(inspection.project.name, registrationKind),
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

function registeredProjectId(projectName: string, registrationKind: ProjectRegistrationKind): string {
  if (registrationKind === "official") {
    return projectName;
  }
  return `${projectName}-development`;
}

function registeredProjectName(projectName: string, registrationKind: ProjectRegistrationKind): string {
  if (registrationKind === "official") {
    return projectName;
  }
  return `${projectName} development`;
}
