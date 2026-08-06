import type { EnvironmentDefinition } from "./environment-types.js";
import type { ProfileCapabilityName, ProjectProfile } from "../manifest/manifest-types.js";

export type ProfileEligibilityIssueCode =
  | "runtime-missing"
  | "managed-root-missing"
  | "managed-root-shared-missing"
  | "managed-root-placement-missing"
  | "managed-root-node-missing"
  | "capability-missing"
  | "placement-node-inventory-missing"
  | "placement-node-labels-missing";

export interface ProfileEligibilityIssue {
  code: ProfileEligibilityIssueCode;
  message: string;
  requirement: string;
}

export interface ProfileEligibilityResult {
  eligible: boolean;
  issues: ProfileEligibilityIssue[];
}

export class ProfileEligibilityError extends Error {
  constructor(
    public readonly environmentId: string,
    public readonly profileId: string,
    public readonly result: ProfileEligibilityResult
  ) {
    super(formatProfileEligibilityFailure(environmentId, profileId, result));
    this.name = "ProfileEligibilityError";
  }
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

  issues.push(...evaluateManagedRootRequirement(environment, profile));

  for (const capability of requiredCapabilities(profile)) {
    if (!hasNamedCapability(environment, capability)) {
      issues.push({
        code: "capability-missing",
        message: `Environment ${environment.id} does not provide required capability ${capability}`,
        requirement: `capabilities.${capability}`
      });
    }
  }

  if (hasNamedCapability(environment, "placement")) {
    issues.push(...evaluatePlacementRequirement(environment, profile));
  }

  return {
    eligible: issues.length === 0,
    issues
  };
}

function requiredCapabilities(profile: ProjectProfile): ProfileCapabilityName[] {
  const capabilities = new Set(profile.requires?.capabilities ?? []);
  if (profile.requires?.placement) {
    capabilities.add("placement");
  }
  return [...capabilities];
}

function evaluatePlacementRequirement(
  environment: EnvironmentDefinition,
  profile: ProjectProfile
): ProfileEligibilityIssue[] {
  const nodeLabels = profile.requires?.placement?.nodeLabels;
  if (!nodeLabels) {
    return [];
  }

  const activeNodes = environment.nodes?.filter(
    (node) => node.availability === "active" && node.status.toLowerCase() === "ready"
  );
  if (!activeNodes?.length) {
    return [
      {
        code: "placement-node-inventory-missing",
        message: `Environment ${environment.id} has no active ready node inventory for placement validation`,
        requirement: "placement.nodeLabels"
      }
    ];
  }

  const requiredLabels = Object.entries(nodeLabels);
  const matchingNode = activeNodes.find((node) => requiredLabels.every(([key, value]) => node.labels[key] === value));
  if (matchingNode) {
    return [];
  }

  return [
    {
      code: "placement-node-labels-missing",
      message: `Environment ${environment.id} has no active ready node with required placement labels: ${formatNodeLabels(requiredLabels)}`,
      requirement: "placement.nodeLabels"
    }
  ];
}

export function assertProfileEligible(environment: EnvironmentDefinition, profile: ProjectProfile): void {
  const result = evaluateProfileEligibility(environment, profile);
  if (!result.eligible) {
    throw new ProfileEligibilityError(environment.id, profile.id, result);
  }
}

export function assertProjectProfileEligible(
  environment: EnvironmentDefinition | undefined,
  profiles: ProjectProfile[] | undefined,
  profileId: string | undefined
): void {
  if (!environment || !profiles?.length) {
    return;
  }
  if (!profileId) {
    throw new Error("Missing required profile for profile eligibility validation");
  }

  const profile = profiles.find((candidate) => candidate.id === profileId);
  if (!profile) {
    throw new Error(`Project manifest does not declare profile: ${profileId}`);
  }

  assertProfileEligible(environment, profile);
}

function evaluateManagedRootRequirement(
  environment: EnvironmentDefinition,
  profile: ProjectProfile
): ProfileEligibilityIssue[] {
  const requirement = profile.requires?.managedRoot;
  if (!requirement?.required) {
    return [];
  }

  const managedRoot = environment.capabilities.managedRoot;
  if (!managedRoot) {
    return [
      {
        code: "managed-root-missing",
        message: `Environment ${environment.id} does not provide required HiveForge managed root`,
        requirement: "managedRoot"
      }
    ];
  }

  if (requirement.shared === true && managedRoot.shared !== true) {
    return [
      {
        code: "managed-root-shared-missing",
        message: `Environment ${environment.id} does not provide required shared HiveForge managed root`,
        requirement: "managedRoot.shared"
      }
    ];
  }

  if (requirement.shared === false) {
    if (!requirement.node) {
      return [
        {
          code: "managed-root-placement-missing",
          message: `Profile ${profile.id} requires a non-shared HiveForge managed root but does not declare a node`,
          requirement: "managedRoot.node"
        }
      ];
    }

    if (managedRoot.shared === true) {
      return [];
    }

    if (!managedRoot.nodes?.includes(requirement.node)) {
      return [
        {
          code: "managed-root-node-missing",
          message: `Environment ${environment.id} does not provide HiveForge managed root on node ${requirement.node}`,
          requirement: `managedRoot.nodes.${requirement.node}`
        }
      ];
    }
  }

  return [];
}

function hasNamedCapability(environment: EnvironmentDefinition, capability: ProfileCapabilityName): boolean {
  if (capability === "placement") {
    return environment.capabilities.placement === true;
  }
  const exhaustive: never = capability;
  throw new Error(`Unsupported profile capability: ${exhaustive}`);
}

function formatNodeLabels(labels: Array<[string, string]>): string {
  return labels.map(([key, value]) => `${key}=${value}`).join(", ");
}

function formatProfileEligibilityFailure(
  environmentId: string,
  profileId: string,
  result: ProfileEligibilityResult
): string {
  const details = result.issues.map((issue) => `${issue.requirement}: ${issue.message}`).join("; ");
  return `Profile ${profileId} is not eligible for environment ${environmentId}: ${details}`;
}
