import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import type { ProjectProfile } from "../manifest/manifest-types.js";
import { loadProjectRegistry } from "../manifest/project-registry.js";
import type { CommandRunner } from "../workspace/command-runner.js";

export interface RepositoryInspectionRequest {
  repository: string;
  gitRef: string;
}

export interface RepositoryInspectionResult {
  repository: string;
  gitRef: string;
  deployable: boolean;
  project?: {
    name: string;
    profiles?: ProjectProfile[];
  };
  components: Array<{
    name: string;
    actions: string[];
  }>;
  reason?: string;
}

export class RepositoryInspectionService {
  constructor(
    private readonly workspaceRoot: string,
    private readonly commandRunner: CommandRunner
  ) {}

  async inspect(request: RepositoryInspectionRequest): Promise<RepositoryInspectionResult> {
    assertInspectableRepository(request.repository);

    const workspace = await this.checkout(request.repository, request.gitRef);
    try {
      const registry = await loadProjectRegistry(workspace);
      return {
        repository: request.repository,
        gitRef: request.gitRef,
        deployable: true,
        project: {
          name: registry.project.name,
          profiles: registry.project.profiles
        },
        components: registry.components.map((component) => ({
          name: component.name,
          actions: Object.keys(component.manifest.deployment.actions)
        }))
      };
    } catch (error) {
      return {
        repository: request.repository,
        gitRef: request.gitRef,
        deployable: false,
        components: [],
        reason: error instanceof Error ? error.message : "Repository inspection failed"
      };
    }
  }

  private async checkout(repository: string, gitRef: string): Promise<string> {
    const checkoutParent = path.join(this.workspaceRoot, "repository-inspection");
    await mkdir(checkoutParent, { recursive: true });
    const checkoutPath = await mkdtemp(path.join(checkoutParent, "repo-"));
    await this.commandRunner.run("git", ["clone", "--no-checkout", repository, checkoutPath]);
    await this.commandRunner.run("git", ["checkout", gitRef], { cwd: checkoutPath });
    return checkoutPath;
  }
}

function assertInspectableRepository(repository: string): void {
  if (
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(repository) &&
    !/^file:\/\/\/.+/.test(repository)
  ) {
    throw new Error(`Repository is not inspectable by HiveForge: ${repository}`);
  }
}
