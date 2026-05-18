import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { ManagedPathDeclaration, ProjectRegistry } from "../manifest/manifest-types.js";

export interface ManagedFilesResult {
  projectDir: string;
  stackDir: string;
  artifactsDir: string;
  prepared: Array<{
    name: string;
    source: string;
    target: string;
  }>;
}

export class ManagedFilesService {
  constructor(private readonly dataRoot: string) {}

  async prepare(request: { projectId: string; workspacePath: string; registry: ProjectRegistry }): Promise<ManagedFilesResult> {
    const projectDir = path.join(this.dataRoot, "deployed", request.projectId);
    const stackDir = path.join(projectDir, "stacks");
    const artifactsDir = path.join(projectDir, "artifacts");
    const managedPaths = request.registry.artifacts?.managedPaths ?? [];
    assertManagedPathTargets(managedPaths);

    await mkdir(stackDir, { recursive: true });
    await mkdir(artifactsDir, { recursive: true });

    const prepared = [];
    for (const managedPath of managedPaths) {
      if (managedPath.mode !== "replace") {
        throw new Error(`Unsupported managed path mode for ${managedPath.name}: ${managedPath.mode}`);
      }
      const source = safeJoin(request.workspacePath, managedPath.source, "managed path source");
      const target = safeJoin(projectDir, managedPath.target, "managed path target");
      await assertSourceExists(source, managedPath);
      await rm(target, { recursive: true, force: true });
      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target, { recursive: true, errorOnExist: false, force: true });
      prepared.push({
        name: managedPath.name,
        source,
        target
      });
    }

    return { projectDir, stackDir, artifactsDir, prepared };
  }
}

export function managedFilesEnvironment(result: ManagedFilesResult): NodeJS.ProcessEnv {
  return {
    HIVEFORGE_PROJECT_DIR: result.projectDir,
    HIVEFORGE_STACK_DIR: result.stackDir,
    HIVEFORGE_ARTIFACTS_DIR: result.artifactsDir
  };
}

function assertManagedPathTargets(managedPaths: ManagedPathDeclaration[]): void {
  const targets = managedPaths.map((managedPath) => normalizeRelativePath(managedPath.target));
  const seen = new Set<string>();
  for (const target of targets) {
    if (seen.has(target)) {
      throw new Error(`Duplicate managed path target: ${target}`);
    }
    seen.add(target);
  }

  for (const target of targets) {
    for (const candidate of targets) {
      if (target !== candidate && candidate.startsWith(`${target}/`)) {
        throw new Error(`Nested managed path target collision: ${target} contains ${candidate}`);
      }
    }
  }
}

async function assertSourceExists(source: string, managedPath: ManagedPathDeclaration): Promise<void> {
  try {
    await stat(source);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`Managed path source missing for ${managedPath.name}: ${managedPath.source}`);
    }
    throw error;
  }
}

function safeJoin(root: string, relativePath: string, label: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Invalid ${label}: ${relativePath}`);
  }
  return resolvedPath;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}
