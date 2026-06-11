import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { loadYamlFile, schemaPaths, validateContract } from "../contracts/schema-loader.js";
import type { ComponentManifest, ProjectRegistry, RootManifest } from "./manifest-types.js";

const ROOT_MANIFEST_FILE = "hiveforge.yaml";
export const SUPPORTED_PROJECT_MANIFEST_VERSION = "0.5";
const LEGACY_ACTION_CONTRACT_TOKENS = [
  "HIVEFORGE_PROJECT_DIR",
  "HIVEFORGE_STACK_DIR",
  "HIVEFORGE_ARTIFACTS_DIR",
  "HIVEFORGE_PROJECT_HOST_DIR",
  "HIVEFORGE_STACK_HOST_DIR",
  "HIVEFORGE_ARTIFACTS_HOST_DIR"
] as const;
const INTERNAL_ROOT_PATTERN = /(^|[^A-Za-z0-9_])\/hf(\/|$)/;

export async function loadProjectRegistry(workspacePath: string): Promise<ProjectRegistry> {
  const rootPath = path.join(workspacePath, ROOT_MANIFEST_FILE);
  const rootManifest = await loadAndValidateManifest<RootManifest>(rootPath, `Root manifest missing: ${ROOT_MANIFEST_FILE}`);
  assertUniqueProjectProfiles(rootManifest);

  const components = [];
  const seenNames = new Set<string>();

  for (const componentRef of rootManifest.components) {
    if (seenNames.has(componentRef.name)) {
      throw new Error(`Duplicate component in root manifest: ${componentRef.name}`);
    }
    seenNames.add(componentRef.name);

    const componentPath = path.join(workspacePath, componentRef.manifest);
    const componentManifest = await loadAndValidateManifest<ComponentManifest>(
      componentPath,
      `Component manifest missing for ${componentRef.name}: ${componentRef.manifest}`
    );

    if (componentManifest.component.name !== componentRef.name) {
      throw new Error(
        `Component manifest name mismatch: root lists ${componentRef.name}, manifest declares ${componentManifest.component.name}`
      );
    }

    if (componentManifest.component.project !== rootManifest.project.name) {
      throw new Error(
        `Component ${componentRef.name} belongs to ${componentManifest.component.project}, expected ${rootManifest.project.name}`
      );
    }

    assertComponentActionSubset(rootManifest.project.actions, componentRef.name, componentManifest);
    await assertActionFilesExist(path.dirname(componentPath), componentManifest);

    components.push({
      name: componentRef.name,
      manifestPath: componentRef.manifest,
      manifest: componentManifest
    });
  }

  await assertNoRemovedActionContractUsage(workspacePath, rootManifest, components);

  return {
    project: rootManifest.project,
    artifacts: rootManifest.artifacts,
    components
  };
}

export async function validateProjectManifestPreflight(workspacePath: string): Promise<void> {
  const rootPath = path.join(workspacePath, ROOT_MANIFEST_FILE);
  const rootManifest = await loadAndValidateManifest<RootManifest>(rootPath, `Root manifest missing: ${ROOT_MANIFEST_FILE}`);
  assertUniqueProjectProfiles(rootManifest);
}

function assertUniqueProjectProfiles(rootManifest: RootManifest): void {
  const seen = new Set<string>();
  for (const profile of rootManifest.project.profiles ?? []) {
    if (seen.has(profile.id)) {
      throw new Error(`Duplicate project profile in root manifest: ${profile.id}`);
    }
    seen.add(profile.id);
  }
}

function assertComponentActionSubset(
  projectActions: string[],
  componentName: string,
  manifest: ComponentManifest
): void {
  const allowed = new Set(projectActions);
  const declared = new Set(Object.keys(manifest.deployment.actions));
  const extra = [...declared].filter((action) => !allowed.has(action));

  if (extra.length > 0) {
    throw new Error(`Component ${componentName} declares action(s) outside the project lifecycle vocabulary: ${extra.join(", ")}`);
  }
}

async function loadAndValidateManifest<T>(manifestPath: string, missingMessage: string): Promise<T> {
  let manifest;
  try {
    manifest = await loadYamlFile(manifestPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw new Error(missingMessage);
    }
    throw error;
  }
  assertSupportedRootManifestVersion(manifest);
  await validateContract(schemaPaths.manifest, manifest);
  return manifest as T;
}

function assertSupportedRootManifestVersion(manifest: unknown): void {
  if (!isRecord(manifest) || manifest.kind !== "project") {
    return;
  }
  if (manifest.version !== SUPPORTED_PROJECT_MANIFEST_VERSION) {
    const actual = typeof manifest.version === "string" && manifest.version.length > 0 ? manifest.version : "missing";
    throw new Error(
      `Unsupported HiveForge project manifest version: ${actual}. Expected ${SUPPORTED_PROJECT_MANIFEST_VERSION}.`
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && "code" in error && typeof error.code === "string";
}

async function assertActionFilesExist(componentDir: string, manifest: ComponentManifest): Promise<void> {
  for (const [actionName, action] of Object.entries(manifest.deployment.actions)) {
    const playbookPath = path.join(componentDir, action.playbook);
    try {
      await access(playbookPath);
    } catch {
      throw new Error(`Action file missing for ${manifest.component.name}.${actionName}: ${action.playbook}`);
    }
  }
}

async function assertNoRemovedActionContractUsage(
  workspacePath: string,
  rootManifest: RootManifest,
  components: Array<{ name: string; manifestPath: string; manifest: ComponentManifest }>
): Promise<void> {
  const files = new Set<string>();

  for (const component of components) {
    const componentDir = path.dirname(path.join(workspacePath, component.manifestPath));
    for (const action of Object.values(component.manifest.deployment.actions)) {
      files.add(path.join(componentDir, action.playbook));
    }
  }

  for (const managedPath of rootManifest.artifacts?.managedPaths ?? []) {
    const source = path.join(workspacePath, managedPath.source);
    for (const file of await listFiles(source)) {
      files.add(file);
    }
  }

  for (const file of files) {
    await assertFileDoesNotUseRemovedActionContract(workspacePath, file);
  }
}

async function listFiles(targetPath: string): Promise<string[]> {
  let targetStat;
  try {
    targetStat = await stat(targetPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  if (targetStat.isFile()) {
    return [targetPath];
  }
  if (!targetStat.isDirectory()) {
    return [];
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
      continue;
    }
    if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

async function assertFileDoesNotUseRemovedActionContract(workspacePath: string, filePath: string): Promise<void> {
  const content = await readFile(filePath, "utf8");
  const relativePath = path.relative(workspacePath, filePath).split(path.sep).join("/");

  for (const token of LEGACY_ACTION_CONTRACT_TOKENS) {
    if (content.includes(token)) {
      throw new Error(
        `Removed HiveForge action contract variable ${token} used in ${relativePath}; use version 0.5 runner variables HIVEFORGE_RENDERED_COMPOSE_FILE or HIVEFORGE_BIND_SOURCE_DIR`
      );
    }
  }

  if (INTERNAL_ROOT_PATTERN.test(content)) {
    throw new Error(
      `HiveForge internal path /hf is used in ${relativePath}; version 0.5 deploy artifacts must use HIVEFORGE_BIND_SOURCE_DIR for Docker bind sources`
    );
  }
}
