import { access } from "node:fs/promises";
import path from "node:path";
import { loadYamlFile, schemaPaths, validateContract } from "../contracts/schema-loader.js";
import type { ComponentManifest, ProjectRegistry, RootManifest } from "./manifest-types.js";

const ROOT_MANIFEST_FILE = "hiveforge.yaml";

export async function loadProjectRegistry(workspacePath: string): Promise<ProjectRegistry> {
  const rootPath = path.join(workspacePath, ROOT_MANIFEST_FILE);
  const rootManifest = await loadAndValidateManifest<RootManifest>(rootPath);

  const components = [];
  const seenNames = new Set<string>();

  for (const componentRef of rootManifest.components) {
    if (seenNames.has(componentRef.name)) {
      throw new Error(`Duplicate component in root manifest: ${componentRef.name}`);
    }
    seenNames.add(componentRef.name);

    const componentPath = path.join(workspacePath, componentRef.manifest);
    const componentManifest = await loadAndValidateManifest<ComponentManifest>(componentPath);

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

    await assertActionFilesExist(path.dirname(componentPath), componentManifest);

    components.push({
      name: componentRef.name,
      manifestPath: componentRef.manifest,
      manifest: componentManifest
    });
  }

  return {
    project: rootManifest.project,
    components
  };
}

async function loadAndValidateManifest<T>(manifestPath: string): Promise<T> {
  const manifest = await loadYamlFile(manifestPath);
  await validateContract(schemaPaths.manifest, manifest);
  return manifest as T;
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
