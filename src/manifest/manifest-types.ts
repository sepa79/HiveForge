export interface RootManifest {
  kind: "project";
  project: {
    name: string;
    repository: string;
    actions: string[];
    profiles?: string[];
  };
  components: Array<{
    name: string;
    manifest: string;
  }>;
  artifacts?: {
    managedPaths?: ManagedPathDeclaration[];
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
