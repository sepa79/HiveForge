import type { DeploymentVars } from "../config/deployment-vars.js";
import { renderDeploymentTemplate, type ReleaseImageTemplate } from "./release-deploy-contract.js";

export interface ReleaseArtifactTemplate {
  images: ReleaseImageTemplate[];
  env?: Record<string, string>;
}

export interface ResolvedReleaseArtifact {
  images: ReleaseImageTemplate[];
  env: Record<string, string>;
}

export function resolveReleaseArtifactTemplate(
  artifact: ReleaseArtifactTemplate,
  vars: DeploymentVars
): ResolvedReleaseArtifact {
  if (!Array.isArray(artifact.images) || artifact.images.length === 0) {
    throw new Error("Release artifact requires at least one image template");
  }

  return {
    images: artifact.images.map((image) => ({ ...image })),
    env: renderEnvTemplates(artifact.env ?? {}, vars)
  };
}

function renderEnvTemplates(env: Record<string, string>, vars: DeploymentVars): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([name, value]) => {
      if (name.length === 0) {
        throw new Error("Release artifact env contains an empty name");
      }
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Release artifact env ${name} must be a non-empty template`);
      }
      return [name, renderDeploymentTemplate(value, vars)];
    })
  );
}
