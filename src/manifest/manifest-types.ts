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
  components: Array<{
    name: string;
    manifestPath: string;
    manifest: ComponentManifest;
  }>;
}
