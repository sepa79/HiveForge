export interface RegisteredProject {
  id: string;
  name: string;
  source: "github" | "local-git" | "http-git";
  repository: string;
  approvedRefs: string[];
}

export interface ProjectRegistryConfig {
  projects: RegisteredProject[];
}
