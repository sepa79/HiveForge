import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { selectRegisteredProject } from "../config/project-registry-loader.js";
import type { ProjectRegistryConfig } from "../config/project-registry-types.js";
import type { CommandRunner } from "./command-runner.js";

export interface CheckoutRequest {
  projectId: string;
  gitRef: string;
}

export interface CheckoutResult {
  projectId: string;
  repository: string;
  gitRef: string;
  workspacePath: string;
}

export class WorkspaceManager {
  constructor(
    private readonly workspaceRoot: string,
    private readonly projectRegistry: ProjectRegistryConfig,
    private readonly commandRunner: CommandRunner
  ) {}

  async checkout(request: CheckoutRequest): Promise<CheckoutResult> {
    const project = selectRegisteredProject(this.projectRegistry, request.projectId, request.gitRef);
    const checkoutParent = path.join(this.workspaceRoot, project.id);

    await mkdir(checkoutParent, { recursive: true });
    const checkoutPath = await mkdtemp(path.join(checkoutParent, `${encodeRefForPath(request.gitRef)}-`));
    await this.commandRunner.run("git", ["clone", "--no-checkout", project.repository, checkoutPath]);
    await this.commandRunner.run("git", ["checkout", request.gitRef], { cwd: checkoutPath });

    return {
      projectId: project.id,
      repository: project.repository,
      gitRef: request.gitRef,
      workspacePath: checkoutPath
    };
  }
}

function encodeRefForPath(gitRef: string): string {
  return Buffer.from(gitRef, "utf8").toString("base64url");
}
