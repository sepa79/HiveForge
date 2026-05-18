import type { EnvironmentDefinition } from "./environment-types.js";
import type { ProfileCapabilityName, ProjectProfile } from "../manifest/manifest-types.js";

export type ProfileEligibilityIssueCode =
  | "runtime-missing"
  | "registry-missing"
  | "ingress-missing"
  | "managed-root-missing"
  | "capability-missing";

export interface ProfileEligibilityIssue {
  code: ProfileEligibilityIssueCode;
  message: string;
  requirement: string;
}

export interface ProfileEligibilityResult {
  eligible: boolean;
  issues: ProfileEligibilityIssue[];
}

export function evaluateProfileEligibility(
  environment: EnvironmentDefinition,
  profile: ProjectProfile
): ProfileEligibilityResult {
  const issues: ProfileEligibilityIssue[] = [];

  if (!environment.capabilities.runtime.includes(profile.runtime)) {
    issues.push({
      code: "runtime-missing",
      message: `Environment ${environment.id} does not provide required runtime ${profile.runtime}`,
      requirement: `runtime.${profile.runtime}`
    });
  }

  if (profile.requires?.registry === true && !environment.capabilities.registry) {
    issues.push({
      code: "registry-missing",
      message: `Environment ${environment.id} does not provide required registry access`,
      requirement: "registry"
    });
  }

  if (profile.requires?.ingress === true && !environment.capabilities.ingress) {
    issues.push({
      code: "ingress-missing",
      message: `Environment ${environment.id} does not provide required ingress`,
      requirement: "ingress"
    });
  }

  for (const managedRoot of profile.requires?.managedRoots ?? []) {
    if (!environment.capabilities.managedRoots.includes(managedRoot)) {
      issues.push({
        code: "managed-root-missing",
        message: `Environment ${environment.id} does not provide required managed root ${managedRoot}`,
        requirement: `managedRoots.${managedRoot}`
      });
    }
  }

  for (const capability of profile.requires?.capabilities ?? []) {
    if (!hasNamedCapability(environment, capability)) {
      issues.push({
        code: "capability-missing",
        message: `Environment ${environment.id} does not provide required capability ${capability}`,
        requirement: `capabilities.${capability}`
      });
    }
  }

  return {
    eligible: issues.length === 0,
    issues
  };
}

function hasNamedCapability(environment: EnvironmentDefinition, capability: ProfileCapabilityName): boolean {
  if (capability === "placement") {
    return environment.capabilities.placement === true;
  }
  if (capability === "shared-runtime-root") {
    return environment.capabilities.sharedRuntimeRoot === true;
  }
  const exhaustive: never = capability;
  throw new Error(`Unsupported profile capability: ${exhaustive}`);
}
