import path from "node:path";
import type { ProjectRegistry } from "../manifest/manifest-types.js";

export interface ResolvedAction {
  component: string;
  action: string;
  adapter: "ansible";
  workspacePath: string;
  componentDir: string;
  componentRelativeDir: string;
  playbook: string;
}

export function resolveDeclaredAction(
  registry: ProjectRegistry,
  workspacePath: string,
  componentName: string,
  actionName: string
): ResolvedAction {
  const component = registry.components.find((candidate) => candidate.name === componentName);
  if (!component) {
    throw new Error(`Component is not managed by HiveForge: ${componentName}`);
  }

  const action = component.manifest.deployment.actions[actionName];
  if (!action) {
    throw new Error(`Action is not declared for ${componentName}: ${actionName}`);
  }

  const componentDir = path.dirname(path.join(workspacePath, component.manifestPath));

  return {
    component: componentName,
    action: actionName,
    adapter: component.manifest.deployment.adapter,
    workspacePath,
    componentDir,
    componentRelativeDir: relativeChildPath(workspacePath, componentDir, "component manifest directory"),
    playbook: action.playbook
  };
}

function relativeChildPath(root: string, child: string, label: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedChild = path.resolve(child);
  if (resolvedChild !== resolvedRoot && !resolvedChild.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Resolved ${label} is outside workspace: ${child}`);
  }
  return path.relative(resolvedRoot, resolvedChild);
}
