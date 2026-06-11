export interface RootManifest {
  kind: "project";
  version: "0.5";
  project: {
    name: string;
    repository: string;
    actions: string[];
    profiles?: ProjectProfile[];
    vars?: Record<string, string>;
  };
  components: Array<{
    name: string;
    manifest: string;
  }>;
  artifacts?: {
    managedPaths?: ManagedPathDeclaration[];
  };
}

export type RuntimeCapability = "docker-single" | "docker-swarm";
export type ProfileCapabilityName = "placement";

export interface ProjectProfile {
  id: string;
  runtime: RuntimeCapability;
  serviceSet: string;
  requires?: {
    managedRoot?: ManagedRootRequirement;
    capabilities?: ProfileCapabilityName[];
  };
}

export interface ManagedRootRequirement {
  required: true;
  shared: boolean;
  node?: string;
}

export interface ManagedPathDeclaration {
  name: string;
  source: string;
  target: string;
  mode: "replace";
}

export interface ComponentManifest {
  kind: "component";
  component: {
    name: string;
    project: string;
  };
  deployment: {
    adapter: "ansible";
    actions: Record<string, { playbook: string }>;
  };
  requirements?: {
    volumes?: string[];
    secrets?: string[];
    environment?: string[];
  };
}

export interface ProjectRegistry {
  project: RootManifest["project"];
  artifacts?: RootManifest["artifacts"];
  components: Array<{
    name: string;
    manifestPath: string;
    manifest: ComponentManifest;
  }>;
}
