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
  policy: EnvironmentPolicy;
}

export interface EnvironmentCapabilities {
  runtime: RuntimeCapability[];
  registry: boolean;
  ingress: boolean;
  managedRoots: string[];
  placement?: boolean;
  sharedRuntimeRoot?: boolean;
}

export interface EnvironmentPolicy {
  projects: EnvironmentProjectPolicy[];
}

export interface EnvironmentProjectPolicy {
  id: string;
  profiles?: string[];
  actions: Array<"deploy" | "remove" | "purge" | "update" | "upgrade">;
}
