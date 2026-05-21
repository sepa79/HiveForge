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
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });
}
