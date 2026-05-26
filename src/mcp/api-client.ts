export class HiveForgeApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "HiveForgeApiClientError";
  }
}

export interface HiveForgeApiClientOptions {
  baseUrl: string;
  authToken: string;
  fetchImpl?: typeof fetch;
}

export interface ReleaseDeployApiInput {
  projectId: string;
  gitRef?: string;
  component: string;
  action: string;
  profile?: string;
  project?: {
    id: string;
    vars?: Record<string, string>;
    profiles?: unknown[];
  };
  vars?: Record<string, string>;
  releaseVars: Record<string, string>;
  images?: Array<{
    name: string;
    image: string;
    application: boolean;
  }>;
  artifact?: {
    env?: Record<string, string>;
    images: Array<{
      name: string;
      image: string;
      application: boolean;
    }>;
  };
  requiredFiles?: string[];
}

export class HiveForgeApiClient {
  private readonly baseUrl: string;
  private readonly authToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ baseUrl, authToken, fetchImpl = fetch }: HiveForgeApiClientOptions) {
    if (baseUrl.length === 0) {
      throw new Error("Missing required config: HIVEFORGE_BASE_URL");
    }
    if (authToken.length === 0) {
      throw new Error("Missing required config: HIVEFORGE_AUTH_TOKEN");
    }
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.authToken = authToken;
    this.fetchImpl = fetchImpl;
  }

  listProjects(): Promise<unknown> {
    return this.request({ method: "GET", path: "/projects" });
  }

  getInfo(): Promise<unknown> {
    return this.request({ method: "GET", path: "/info" });
  }

  getHealth(): Promise<unknown> {
    return this.request({ method: "GET", path: "/health" });
  }

  listEnvironments(): Promise<unknown> {
    return this.request({ method: "GET", path: "/environments" });
  }

  listDeployments(): Promise<unknown> {
    return this.request({ method: "GET", path: "/deployments" });
  }

  listOperations(): Promise<unknown> {
    return this.request({ method: "GET", path: "/operations" });
  }

  getOperation(operationId: string): Promise<unknown> {
    return this.request({ method: "GET", path: `/operations/${encodeURIComponent(operationId)}` });
  }

  readJournal(): Promise<unknown> {
    return this.request({ method: "GET", path: "/journal" });
  }

  inspectRepository(input: { repository: string; gitRef: string }): Promise<unknown> {
    return this.request({ method: "POST", path: "/repositories/inspect", body: input });
  }

  registerProject(input: { repository: string; gitRef: string }): Promise<unknown> {
    return this.request({ method: "POST", path: "/projects/register", body: input });
  }

  setEnvironmentProjectPolicy(input: {
    environmentId: string;
    projectId: string;
    actions: string[];
    profiles?: string[];
  }): Promise<unknown> {
    return this.request({
      method: "PUT",
      path: `/environments/${encodeURIComponent(input.environmentId)}/policy/projects/${encodeURIComponent(
        input.projectId
      )}`,
      body: {
        actions: input.actions,
        ...(input.profiles ? { profiles: input.profiles } : {})
      }
    });
  }

  inspectProject(input: { projectId: string; gitRef: string }): Promise<unknown> {
    return this.request({
      method: "POST",
      path: `/projects/${encodeURIComponent(input.projectId)}/inspect`,
      body: { gitRef: input.gitRef }
    });
  }

  validateRequirements(input: { projectId: string; gitRef: string; profile?: string }): Promise<unknown> {
    return this.request({
      method: "POST",
      path: `/projects/${encodeURIComponent(input.projectId)}/validate`,
      body: {
        gitRef: input.gitRef,
        ...(input.profile ? { profile: input.profile } : {})
      }
    });
  }

  startAction(input: {
    projectId: string;
    gitRef: string;
    component: string;
    action: string;
    profile?: string;
  }): Promise<unknown> {
    return this.request({
      method: "POST",
      path: `/operations/projects/${encodeURIComponent(input.projectId)}/actions/${encodeURIComponent(
        input.component
      )}/${encodeURIComponent(input.action)}`,
      body: {
        gitRef: input.gitRef,
        ...(input.profile ? { profile: input.profile } : {})
      }
    });
  }

  deployRelease(input: ReleaseDeployApiInput): Promise<unknown> {
    return this.request({
      method: "POST",
      path: `/operations/projects/${encodeURIComponent(input.projectId)}/releases/${encodeURIComponent(
        input.component
      )}/${encodeURIComponent(input.action)}`,
      body: {
        ...(input.gitRef ? { gitRef: input.gitRef } : {}),
        ...(input.profile ? { profile: input.profile } : {}),
        ...(input.project ? { project: input.project } : {}),
        ...(input.vars ? { vars: input.vars } : {}),
        releaseVars: input.releaseVars,
        ...(input.images ? { images: input.images } : {}),
        ...(input.artifact ? { artifact: input.artifact } : {}),
        ...(input.requiredFiles ? { requiredFiles: input.requiredFiles } : {})
      }
    });
  }

  private async request({ method, path, body }: { method: string; path: string; body?: unknown }): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          authorization: `Bearer ${this.authToken}`,
          ...(body ? { "content-type": "application/json" } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
    } catch (error) {
      throw new HiveForgeApiClientError(
        0,
        "API_TRANSPORT_FAILED",
        error instanceof Error ? error.message : String(error),
        { method, url, cause: serializeErrorCause(error instanceof Error ? error.cause : undefined) },
        error instanceof Error ? { cause: error } : undefined
      );
    }

    const payload = await readResponsePayload(response);
    if (!response.ok) {
      throw new HiveForgeApiClientError(
        response.status,
        "API_REQUEST_FAILED",
        responsePayloadMessage(payload, response.status),
        { method, url, payload }
      );
    }

    return payload;
  }
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function responsePayloadMessage(payload: unknown, status: number): string {
  if (isObject(payload) && typeof payload.error === "string") {
    return payload.error;
  }
  return `Request failed with status ${status}`;
}

function serializeErrorCause(cause: unknown): unknown {
  if (!cause) {
    return null;
  }
  if (!(cause instanceof Error)) {
    return { value: String(cause) };
  }
  return {
    name: cause.name,
    message: cause.message,
    ...("code" in cause ? { code: cause.code } : {})
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
