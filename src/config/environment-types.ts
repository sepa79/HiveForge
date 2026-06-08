import type { RuntimeCapability } from "../manifest/manifest-types.js";

export interface EnvironmentConfig {
  current: string;
  environments: EnvironmentDefinition[];
}

export interface EnvironmentDefinition {
  id: string;
  name: string;
  kind: "local-docker" | "docker" | "swarm";
  capabilities: EnvironmentCapabilities;
  nodes?: EnvironmentNode[];
  vars?: Record<string, string>;
  policy: EnvironmentPolicy;
}

export interface EnvironmentNode {
  id: string;
  hostname: string;
  role: "manager" | "worker";
  availability: "active" | "pause" | "drain";
  status: string;
  labels: Record<string, string>;
}

export interface EnvironmentCapabilities {
  runtime: RuntimeCapability[];
  managedRoot: ManagedRootCapability;
  placement?: boolean;
}

export interface ManagedRootCapability {
  shared: boolean;
  nodes?: string[];
}

export interface EnvironmentPolicy {
  projects: EnvironmentProjectPolicy[];
}

export interface EnvironmentProjectPolicy {
  id: string;
  profiles?: string[];
  actions: Array<"deploy" | "remove" | "purge" | "update" | "upgrade">;
}
