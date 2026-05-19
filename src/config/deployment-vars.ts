export type DeploymentVars = Record<string, string>;

export interface DeploymentVarInputs {
  project?: DeploymentVars;
  environment?: DeploymentVars;
  release?: DeploymentVars;
}

export function resolveDeploymentVars(inputs: DeploymentVarInputs): DeploymentVars {
  return {
    ...(inputs.project ?? {}),
    ...(inputs.environment ?? {}),
    ...(inputs.release ?? {})
  };
}

export function requireDeploymentVars(
  vars: DeploymentVars,
  requiredNames: string[]
): void {
  const missing = requiredNames.filter((name) => !vars[name]);
  if (missing.length > 0) {
    throw new Error(`Missing deployment var(s): ${missing.join(", ")}`);
  }
}
