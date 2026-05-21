import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpServer } from "../../src/server/http-server.js";
import { createRestRoutes } from "../../src/server/rest-api.js";
import type { Journal } from "../../src/journal/journal.js";
import type { ProjectRegistry } from "../../src/manifest/manifest-types.js";

const servers: ReturnType<typeof createHttpServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
  servers.length = 0;
});

describe("REST API", () => {
  it("returns HiveForge info", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/info`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      hiveforge: {
        name: "hiveforge",
        version: "0.1.0-test"
      }
    });
  });

  it("lists registered projects", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/projects`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      projects: [
        {
          id: "hivewatch",
          name: "HiveWatch",
          source: "github",
          repository: "https://github.com/sepa79/HiveWatch.git",
          approvedRefs: ["main"]
        }
      ]
    });
  });

  it("runs deploy through orchestrator", async () => {
    const calls: unknown[] = [];
    const baseUrl = await startServer({ calls });

    const response = await fetch(`${baseUrl}/projects/hivewatch/actions/api/deploy`, {
      method: "POST",
      body: JSON.stringify({ gitRef: "main" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      operationId: "action-op",
      stdout: "changed=1",
      stderr: ""
    });
    expect(calls).toEqual([
      { projectId: "hivewatch", gitRef: "main", component: "api", action: "deploy", environmentId: "local" }
    ]);
  });

  it("passes profile from action requests to the orchestrator", async () => {
    const calls: unknown[] = [];
    const baseUrl = await startServer({ calls });

    const response = await fetch(`${baseUrl}/projects/hivewatch/actions/api/deploy`, {
      method: "POST",
      body: JSON.stringify({ gitRef: "main", profile: "test" })
    });

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      {
        projectId: "hivewatch",
        gitRef: "main",
        component: "api",
        action: "deploy",
        environmentId: "local",
        profile: "test"
      }
    ]);
  });

  it("rejects action requests outside environment policy", async () => {
    const calls: unknown[] = [];
    const baseUrl = await startServer({ calls });

    const response = await fetch(`${baseUrl}/projects/hivewatch/actions/api/deploy`, {
      method: "POST",
      body: JSON.stringify({ gitRef: "main", profile: "prod" })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Profile is not allowed on environment local for hivewatch: prod"
    });
    expect(calls).toEqual([]);
  });

  it("lists deployment inventory", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/deployments`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deployments: [
        {
          environment: "local",
          project: "hivewatch",
          component: "api",
          status: "deployed"
        }
      ]
    });
  });

  it("starts async lifecycle operations and exposes operation logs", async () => {
    const calls: unknown[] = [];
    const baseUrl = await startServer({ calls });

    const response = await fetch(`${baseUrl}/operations/projects/hivewatch/actions/api/deploy`, {
      method: "POST",
      body: JSON.stringify({ gitRef: "main", profile: "test" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      operationId: "uiop-1",
      status: "running",
      projectId: "hivewatch",
      component: "api",
      action: "deploy"
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const operation = await fetch(`${baseUrl}/operations/uiop-1`);

    expect(operation.status).toBe(200);
    await expect(operation.json()).resolves.toMatchObject({
      operationId: "uiop-1",
      status: "succeeded",
      result: {
        actionOperationId: "action-op"
      },
      logs: expect.arrayContaining([
        expect.objectContaining({ level: "info", message: "Started deploy for hivewatch/api" }),
        expect.objectContaining({ level: "stdout", message: "changed=1" })
      ])
    });
  });

  it("lists configured environments", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/environments`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      current: {
        id: "local",
        name: "Local Docker",
        kind: "local-docker",
        capabilities: {
          runtime: ["docker-single"],
          managedRoot: {
            shared: false,
            nodes: ["local-docker"]
          }
        },
        policy: {
          projects: [{ id: "hivewatch", profiles: ["normal", "test"], actions: ["deploy", "upgrade"] }]
        }
      },
      known: [
        {
          id: "local",
          name: "Local Docker",
          kind: "local-docker",
          capabilities: {
            runtime: ["docker-single"],
            managedRoot: {
              shared: false,
              nodes: ["local-docker"]
            }
          },
          policy: {
            projects: [{ id: "hivewatch", profiles: ["normal", "test"], actions: ["deploy", "upgrade"] }]
          }
        }
      ]
    });
  });

  it("inspects candidate repositories through the configured repository inspector", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/repositories/inspect`, {
      method: "POST",
      body: JSON.stringify({ repository: "https://github.com/sepa79/HiveWatch.git", gitRef: "main" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      repository: "https://github.com/sepa79/HiveWatch.git",
      gitRef: "main",
      deployable: true,
      components: []
    });
  });

  it("registers deployable repositories through the configured registrar", async () => {
    const calls: unknown[] = [];
    const baseUrl = await startServer({ calls });

    const response = await fetch(`${baseUrl}/projects/register`, {
      method: "POST",
      body: JSON.stringify({ repository: "https://github.com/sepa79/HiveWatch.git", gitRef: "main" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deployable: true,
      project: {
        id: "hivewatch",
        name: "hivewatch",
        source: "github",
        repository: "https://github.com/sepa79/HiveWatch.git",
        approvedRefs: ["main"]
      }
    });
    expect(calls).toContainEqual({
      register: {
        repository: "https://github.com/sepa79/HiveWatch.git",
        gitRef: "main"
      }
    });
  });

  it("returns 400 for unsupported lifecycle actions", async () => {
    const calls: unknown[] = [];
    const baseUrl = await startServer({ calls });

    const response = await fetch(`${baseUrl}/projects/hivewatch/actions/api/restart`, {
      method: "POST",
      body: JSON.stringify({ gitRef: "main" })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Unsupported lifecycle action: restart" });
    expect(calls).toEqual([]);
  });

  it("requires bearer auth when configured", async () => {
    const baseUrl = await startServer({ authToken: "secret" });

    const rejected = await fetch(`${baseUrl}/projects`);
    expect(rejected.status).toBe(401);

    const accepted = await fetch(`${baseUrl}/projects`, {
      headers: {
        authorization: "Bearer secret"
      }
    });
    expect(accepted.status).toBe(200);
  });

  it("returns 400 for missing gitRef", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/projects/hivewatch/inspect`, {
      method: "POST",
      body: JSON.stringify({})
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing required field: gitRef" });
  });

  it("returns journal events", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/journal`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      events: [
        {
          eventId: "evt-1",
          operationId: "op-1",
          operationType: "inspect_project",
          project: "hivewatch",
          repository: "https://github.com/sepa79/HiveWatch.git",
          gitRef: "main",
          status: "succeeded",
          startedAt: "2026-05-17T10:00:00.000Z",
          endedAt: "2026-05-17T10:00:01.000Z",
          reason: "Loaded 1 managed component"
        }
      ]
    });
  });
});

async function startServer(options: { calls?: unknown[]; authToken?: string } = {}): Promise<string> {
  const server = createHttpServer(
    createRestRoutes({
      appInfo: {
        name: "hiveforge",
        version: "0.1.0-test"
      },
      projectRegistry: {
        projects: [
          {
            id: "hivewatch",
            name: "HiveWatch",
            source: "github",
            repository: "https://github.com/sepa79/HiveWatch.git",
            approvedRefs: ["main"]
          }
        ]
      },
      journal: journal(),
      inspection: {
        async inspect() {
          return {
            operationId: "inspect-op",
            projectId: "hivewatch",
            repository: "https://github.com/sepa79/HiveWatch.git",
            gitRef: "main",
            workspacePath: "/workspace",
            registry: registry()
          };
        }
      } as never,
      validation: {
        async validate() {
          return {
            operationId: "validate-op",
            report: {
              ok: true,
              issues: []
            }
          };
        }
      } as never,
      deploy: {
        async deploy(request: unknown) {
          options.calls?.push(request);
          return {
            inspection: {},
            validation: {},
            action: {
              operationId: "action-op",
              stdout: "changed=1",
              stderr: ""
            }
          };
        }
      } as never,
      currentEnvironmentId: "local",
      environmentPolicy: {
        assertActionAllowed(request: { profile?: string }) {
          if (request.profile === "prod") {
            throw new Error("Profile is not allowed on environment local for hivewatch: prod");
          }
        }
      } as never,
      deploymentInventory: {
        async list() {
          return {
            deployments: [
              {
                environment: "local",
                project: "hivewatch",
                component: "api",
                status: "deployed"
              }
            ]
          };
        }
      } as never,
      operations: operationService(options.calls),
      repositoryInspection: {
        async inspect(request: { repository: string; gitRef: string }) {
          return {
            ...request,
            deployable: true,
            components: []
          };
        }
      },
      projectRegistration: {
        async register(request: { repository: string; gitRef: string }) {
          options.calls?.push({ register: request });
          return {
            deployable: true,
            project: {
              id: "hivewatch",
              name: "hivewatch",
              source: "github",
              repository: request.repository,
              approvedRefs: [request.gitRef]
            }
          };
        }
      },
      environments: {
        current: {
          id: "local",
          name: "Local Docker",
          kind: "local-docker",
          capabilities: {
            runtime: ["docker-single"],
            managedRoot: {
              shared: false,
              nodes: ["local-docker"]
            }
          },
          policy: {
            projects: [{ id: "hivewatch", profiles: ["normal", "test"], actions: ["deploy", "upgrade"] }]
          }
        },
        known: [
          {
            id: "local",
            name: "Local Docker",
            kind: "local-docker",
            capabilities: {
              runtime: ["docker-single"],
              managedRoot: {
                shared: false,
                nodes: ["local-docker"]
              }
            },
            policy: {
              projects: [{ id: "hivewatch", profiles: ["normal", "test"], actions: ["deploy", "upgrade"] }]
            }
          }
        ]
      }
    }),
    { authToken: options.authToken }
  );

  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function operationService(calls?: unknown[]) {
  const operations = new Map<string, unknown>();
  return {
    list() {
      return { operations: [...operations.values()] };
    },
    get(operationId: string) {
      return operations.get(operationId) ?? null;
    },
    startLifecycleAction(request: unknown) {
      calls?.push(request);
      const operation = {
        operationId: "uiop-1",
        status: "running",
        kind: "lifecycle_action",
        projectId: "hivewatch",
        gitRef: "main",
        component: "api",
        action: "deploy",
        startedAt: "2026-05-17T10:00:00.000Z",
        logs: [{ at: "2026-05-17T10:00:00.000Z", level: "info", message: "Started deploy for hivewatch/api" }]
      };
      operations.set("uiop-1", operation);
      queueMicrotask(() => {
        operations.set("uiop-1", {
          ...operation,
          status: "succeeded",
          endedAt: "2026-05-17T10:00:01.000Z",
          result: { actionOperationId: "action-op" },
          logs: [
            ...operation.logs,
            { at: "2026-05-17T10:00:01.000Z", level: "stdout", message: "changed=1" }
          ]
        });
      });
      return operation;
    }
  } as never;
}

function journal(): Journal {
  return {
    async append() {},
    async readAll() {
      return [
        {
          eventId: "evt-1",
          operationId: "op-1",
          operationType: "inspect_project",
          project: "hivewatch",
          repository: "https://github.com/sepa79/HiveWatch.git",
          gitRef: "main",
          status: "succeeded",
          startedAt: "2026-05-17T10:00:00.000Z",
          endedAt: "2026-05-17T10:00:01.000Z",
          reason: "Loaded 1 managed component"
        }
      ];
    }
  };
}

function registry(): ProjectRegistry {
  return {
    project: {
      name: "hivewatch",
      repository: "https://github.com/sepa79/HiveWatch.git",
      actions: ["deploy"]
    },
    components: [
      {
        name: "api",
        manifestPath: "components/api/hiveforge.yaml",
        manifest: {
          kind: "component",
          component: {
            name: "api",
            project: "hivewatch"
          },
          deployment: {
            adapter: "ansible",
            actions: {
              deploy: {
                playbook: "ansible/deploy.yml"
              }
            }
          }
        }
      }
    ]
  };
}
