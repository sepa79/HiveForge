import { access } from "node:fs/promises";
import path from "node:path";
import { loadYamlFile, schemaPaths, validateContract } from "../contracts/schema-loader.js";
import type { ComponentManifest, ProjectRegistry, RootManifest } from "./manifest-types.js";

const ROOT_MANIFEST_FILE = "hiveforge.yaml";

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

    assertComponentActionSet(rootManifest.project.actions, componentRef.name, componentManifest);
    await assertActionFilesExist(path.dirname(componentPath), componentManifest);

    components.push({
      name: componentRef.name,
      manifestPath: componentRef.manifest,
      manifest: componentManifest
    });
  }

  return {
    project: rootManifest.project,
    artifacts: rootManifest.artifacts,
    components
  };
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

function assertComponentActionSet(
  projectActions: string[],
  componentName: string,
  manifest: ComponentManifest
): void {
  const expected = new Set(projectActions);
  const declared = new Set(Object.keys(manifest.deployment.actions));
  const missing = projectActions.filter((action) => !declared.has(action));
  const extra = [...declared].filter((action) => !expected.has(action));

  if (missing.length > 0) {
    throw new Error(`Component ${componentName} is missing project action(s): ${missing.join(", ")}`);
  }

  if (extra.length > 0) {
    throw new Error(`Component ${componentName} declares action(s) outside the project contract: ${extra.join(", ")}`);
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
  await validateContract(schemaPaths.manifest, manifest);
  return manifest as T;
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
