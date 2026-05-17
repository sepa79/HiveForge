import path from "node:path";
import type { ProjectRegistry } from "../manifest/manifest-types.js";

export interface ResolvedAction {
  component: string;
  action: string;
  adapter: "ansible";
  componentDir: string;
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

  return {
    component: componentName,
    action: actionName,
    adapter: component.manifest.deployment.adapter,
    componentDir: path.dirname(path.join(workspacePath, component.manifestPath)),
    playbook: action.playbook
  };
}
