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
  it("lists allowlisted projects", async () => {
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
          allowedRefs: ["main"]
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

  it("lists configured environments", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/environments`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      current: {
        id: "local",
        name: "Local Docker",
        kind: "local-docker",
        capabilities: ["docker", "compose"],
        policy: {
          projects: [{ id: "hivewatch", profiles: ["normal", "test"], actions: ["deploy", "upgrade"] }]
        }
      },
      known: [
        {
          id: "local",
          name: "Local Docker",
          kind: "local-docker",
          capabilities: ["docker", "compose"],
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
      allowlist: {
        projects: [
          {
            id: "hivewatch",
            name: "HiveWatch",
            source: "github",
            repository: "https://github.com/sepa79/HiveWatch.git",
            allowedRefs: ["main"]
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
      repositoryInspection: {
        async inspect(request: { repository: string; gitRef: string }) {
          return {
            ...request,
            deployable: true,
            components: []
          };
        }
      },
      environments: {
        current: {
          id: "local",
          name: "Local Docker",
          kind: "local-docker",
          capabilities: ["docker", "compose"],
          policy: {
            projects: [{ id: "hivewatch", profiles: ["normal", "test"], actions: ["deploy", "upgrade"] }]
          }
        },
        known: [
          {
            id: "local",
            name: "Local Docker",
            kind: "local-docker",
            capabilities: ["docker", "compose"],
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
      repository: "https://github.com/sepa79/HiveWatch.git"
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
