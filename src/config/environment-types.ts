import type { RuntimeCapability } from "../manifest/manifest-types.js";

export interface EnvironmentConfig {
  current: string;
  environments: EnvironmentDefinition[];
}

export interface EnvironmentDefinition {
  id: string;
  name: string;
  description?: string;
  kind: "local-docker" | "docker" | "swarm";
  capabilities: EnvironmentCapabilities;
  deployment?: EnvironmentDeployment;
  nodes?: EnvironmentNode[];
  vars?: Record<string, string>;
  policy: EnvironmentPolicy;
}

export interface EnvironmentDeployment {
  executor: "docker-direct" | "portainer-stack";
  portainer?: PortainerDeploymentConfig;
}

export interface PortainerDeploymentConfig {
  baseUrl: string;
  endpointId: number;
  apiKey: string;
  tlsInsecureSkipVerify?: boolean;
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
  bindSources?: BindSourceCapability;
  placement?: boolean;
}

export interface ManagedRootCapability {
  shared: boolean;
  nodes?: string[];
  bindSourceRoot?: string;
}

export interface BindSourceCapability {
  allowed: string[];
}

export interface EnvironmentPolicy {
  projects: EnvironmentProjectPolicy[];
}

export interface EnvironmentProjectPolicy {
  id: string;
  profiles?: string[];
  actions: Array<"deploy" | "remove" | "purge" | "update" | "upgrade">;
}
