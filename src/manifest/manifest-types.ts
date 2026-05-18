export interface RootManifest {
  kind: "project";
  project: {
    name: string;
    repository: string;
    actions: string[];
    profiles?: ProjectProfile[];
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
export type ProfileCapabilityName = "placement" | "shared-runtime-root";

export interface ProjectProfile {
  id: string;
  runtime: RuntimeCapability;
  serviceSet: string;
  requires?: {
    registry?: boolean;
    ingress?: boolean;
    managedRoots?: string[];
    capabilities?: ProfileCapabilityName[];
  };
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
