export interface AllowlistProject {
  id: string;
  name: string;
  source: "github" | "local-git";
  repository: string;
  allowedRefs: string[];
}

export interface RepositoryAllowlist {
  projects: AllowlistProject[];
}
