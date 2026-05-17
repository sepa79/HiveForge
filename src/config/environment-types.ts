export interface EnvironmentConfig {
  current: string;
  environments: EnvironmentDefinition[];
}

export interface EnvironmentDefinition {
  id: string;
  name: string;
  kind: "local-docker" | "docker" | "swarm";
  capabilities: Array<"docker" | "compose" | "swarm" | "volumes" | "secrets" | "registry">;
  policy: EnvironmentPolicy;
}

export interface EnvironmentPolicy {
  projects: EnvironmentProjectPolicy[];
}

export interface EnvironmentProjectPolicy {
  id: string;
  profiles?: string[];
  actions: Array<"deploy" | "remove" | "purge" | "update" | "upgrade">;
}
