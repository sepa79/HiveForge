import { describe, expect, it } from "vitest";
import { HiveForgeApiClient, HiveForgeApiClientError } from "../../src/mcp/api-client.js";

describe("HiveForge MCP API client", () => {
  it("sends the configured bearer token to REST", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HiveForgeApiClient({
      baseUrl: "http://127.0.0.1:3000",
      authToken: "secret",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return jsonResponse(200, { projects: [] });
      }
    });

    await expect(client.listProjects()).resolves.toEqual({ projects: [] });
    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3000/projects",
        init: {
          method: "GET",
          headers: {
            authorization: "Bearer secret"
          }
        }
      }
    ]);
  });

  it("reads HiveForge info from REST transport", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HiveForgeApiClient({
      baseUrl: "http://127.0.0.1:3000",
      authToken: "secret",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return jsonResponse(200, { hiveforge: { name: "hiveforge", version: "0.1.0-test" } });
      }
    });

    await expect(client.getInfo()).resolves.toEqual({ hiveforge: { name: "hiveforge", version: "0.1.0-test" } });
    expect(calls[0]).toEqual({
      url: "http://127.0.0.1:3000/info",
      init: {
        method: "GET",
        headers: {
          authorization: "Bearer secret"
        }
      }
    });
  });

  it("reads public health from REST transport", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HiveForgeApiClient({
      baseUrl: "http://127.0.0.1:3000",
      authToken: "secret",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return jsonResponse(200, { status: "ok", hiveforge: { name: "hiveforge", version: "0.4.2" } });
      }
    });

    await expect(client.getHealth()).resolves.toEqual({
      status: "ok",
      hiveforge: { name: "hiveforge", version: "0.4.2" }
    });
    expect(calls[0]).toEqual({
      url: "http://127.0.0.1:3000/health",
      init: {
        method: "GET",
        headers: {
          authorization: "Bearer secret"
        }
      }
    });
  });

  it("maps REST errors without hiding the original message", async () => {
    const client = new HiveForgeApiClient({
      baseUrl: "http://127.0.0.1:3000",
      authToken: "wrong",
      fetchImpl: async () => jsonResponse(401, { error: "Unauthorized" })
    });

    await expect(client.listProjects()).rejects.toMatchObject({
      name: "HiveForgeApiClientError",
      status: 401,
      code: "API_REQUEST_FAILED",
      message: "Unauthorized"
    });
    await expect(client.listProjects()).rejects.toBeInstanceOf(HiveForgeApiClientError);
  });

  it("starts lifecycle actions through the async operation endpoint", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HiveForgeApiClient({
      baseUrl: "http://127.0.0.1:3000/",
      authToken: "secret",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return jsonResponse(200, { operationId: "uiop-1", status: "running" });
      }
    });

    await client.startAction({
      projectId: "hivewatch-local",
      gitRef: "main",
      component: "api",
      action: "deploy",
      profile: "test"
    });

    expect(calls[0]).toMatchObject({
      url: "http://127.0.0.1:3000/operations/projects/hivewatch-local/actions/api/deploy",
      init: {
        method: "POST",
        body: JSON.stringify({ gitRef: "main", profile: "test" })
      }
    });
  });

  it("sets environment project policy through REST transport", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HiveForgeApiClient({
      baseUrl: "http://127.0.0.1:3000/",
      authToken: "secret",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return jsonResponse(200, {
          environmentId: "docker",
          project: { id: "hivewatch", profiles: ["normal"], actions: ["deploy"] }
        });
      }
    });

    await client.setEnvironmentProjectPolicy({
      environmentId: "docker",
      projectId: "hivewatch",
      profiles: ["normal"],
      actions: ["deploy"]
    });

    expect(calls[0]).toMatchObject({
      url: "http://127.0.0.1:3000/environments/docker/policy/projects/hivewatch",
      init: {
        method: "PUT",
        body: JSON.stringify({ actions: ["deploy"], profiles: ["normal"] })
      }
    });
  });

  it("manages project runtime env through REST transport", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HiveForgeApiClient({
      baseUrl: "http://127.0.0.1:3000/",
      authToken: "secret",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return jsonResponse(200, { projectId: "hivewatch", entries: [] });
      }
    });

    await client.listProjectRuntimeEnv({ projectId: "hivewatch" });
    await client.setProjectRuntimeEnv({
      projectId: "hivewatch",
      profile: "test",
      values: { IMAGE_TAG: "latest" }
    });
    await client.unsetProjectRuntimeEnv({
      projectId: "hivewatch",
      profile: "test",
      keys: ["IMAGE_TAG"]
    });

    expect(calls.map((call) => ({ url: call.url, method: call.init.method, body: call.init.body }))).toEqual([
      {
        url: "http://127.0.0.1:3000/projects/hivewatch/runtime-env",
        method: "GET",
        body: undefined
      },
      {
        url: "http://127.0.0.1:3000/projects/hivewatch/runtime-env",
        method: "PUT",
        body: JSON.stringify({ profile: "test", values: { IMAGE_TAG: "latest" } })
      },
      {
        url: "http://127.0.0.1:3000/projects/hivewatch/runtime-env/unset",
        method: "POST",
        body: JSON.stringify({ profile: "test", keys: ["IMAGE_TAG"] })
      }
    ]);
  });

  it("prepares release deployments through the internal release endpoint", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HiveForgeApiClient({
      baseUrl: "http://127.0.0.1:3000/",
      authToken: "secret",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return jsonResponse(200, { plan: { projectId: "pockethive" } });
      }
    });

    await client.deployRelease({
      projectId: "pockethive",
      component: "stack",
      action: "deploy",
      profile: "swarm-reduced",
      project: {
        id: "pockethive",
        vars: {
          "imageRepository.project": "ghcr.io/sepa79/pockethive"
        },
        profiles: []
      },
      vars: {
        "imageRepository.project": "192.168.88.54:5000/pockethive"
      },
      releaseVars: {
        "release.imageTag": "dev-20260521-1415-gabc1234"
      },
      images: [
        {
          name: "orchestrator",
          image: "{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}",
          application: true
        }
      ]
    });

    expect(calls[0]).toMatchObject({
      url: "http://127.0.0.1:3000/operations/projects/pockethive/releases/stack/deploy",
      init: {
        method: "POST",
        body: JSON.stringify({
          profile: "swarm-reduced",
          project: {
            id: "pockethive",
            vars: {
              "imageRepository.project": "ghcr.io/sepa79/pockethive"
            },
            profiles: []
          },
          vars: {
            "imageRepository.project": "192.168.88.54:5000/pockethive"
          },
          releaseVars: {
            "release.imageTag": "dev-20260521-1415-gabc1234"
          },
          images: [
            {
              name: "orchestrator",
              image: "{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}",
              application: true
            }
          ]
        })
      }
    });
  });

  it("can prepare release deployments from an artifact template", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HiveForgeApiClient({
      baseUrl: "http://127.0.0.1:3000/",
      authToken: "secret",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return jsonResponse(200, { plan: { env: {} } });
      }
    });

    await client.deployRelease({
      projectId: "pockethive",
      component: "stack",
      action: "deploy",
      project: { id: "pockethive" },
      releaseVars: { "release.imageTag": "dev-1" },
      vars: { "imageRepository.project": "registry.lan:5000/pockethive" },
      artifact: {
        env: {
          DOCKER_REGISTRY: "{{ imageRepository.project }}/",
          POCKETHIVE_VERSION: "{{ release.imageTag }}"
        },
        images: [
          {
            name: "orchestrator",
            image: "{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}",
            application: true
          }
        ]
      }
    });

    expect(calls[0]?.init.body).toBe(
      JSON.stringify({
        project: { id: "pockethive" },
        vars: { "imageRepository.project": "registry.lan:5000/pockethive" },
        releaseVars: { "release.imageTag": "dev-1" },
        artifact: {
          env: {
            DOCKER_REGISTRY: "{{ imageRepository.project }}/",
            POCKETHIVE_VERSION: "{{ release.imageTag }}"
          },
          images: [
            {
              name: "orchestrator",
              image: "{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}",
              application: true
            }
          ]
        }
      })
    );
  });

  it("can prepare checkout-backed release deployments", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new HiveForgeApiClient({
      baseUrl: "http://127.0.0.1:3000/",
      authToken: "secret",
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return jsonResponse(200, { plan: { env: {} } });
      }
    });

    await client.deployRelease({
      projectId: "pockethive",
      gitRef: "v1.2.3",
      component: "stack",
      action: "deploy",
      profile: "swarm-reduced",
      releaseVars: { "release.imageTag": "dev-1" },
      vars: { "imageRepository.project": "registry.lan:5000/pockethive" },
      requiredFiles: ["artifacts/pockethive-runtime/compose/docker-compose.yml"],
      artifact: {
        images: [
          {
            name: "orchestrator",
            image: "{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}",
            application: true
          }
        ]
      }
    });

    expect(calls[0]?.init.body).toBe(
      JSON.stringify({
        gitRef: "v1.2.3",
        profile: "swarm-reduced",
        vars: { "imageRepository.project": "registry.lan:5000/pockethive" },
        releaseVars: { "release.imageTag": "dev-1" },
        artifact: {
          images: [
            {
              name: "orchestrator",
              image: "{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}",
              application: true
            }
          ]
        },
        requiredFiles: ["artifacts/pockethive-runtime/compose/docker-compose.yml"]
      })
    );
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}
