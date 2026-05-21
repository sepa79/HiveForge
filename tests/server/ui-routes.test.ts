import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpServer } from "../../src/server/http-server.js";
import { createUiRoutes, uiPublicPaths } from "../../src/server/ui-routes.js";

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

describe("UI routes", () => {
  it("serves the operator console without bearer auth", async () => {
    const baseUrl = await startServer();

    const response = await fetch(`${baseUrl}/`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    await expect(response.text()).resolves.toContain("HiveForge");
  });

  it("serves UI assets without bearer auth", async () => {
    const baseUrl = await startServer();

    const styles = await fetch(`${baseUrl}/ui/styles.css`);
    const script = await fetch(`${baseUrl}/ui/app.js`);
    const favicon = await fetch(`${baseUrl}/favicon.svg`);

    expect(styles.status).toBe(200);
    expect(styles.headers.get("content-type")).toContain("text/css");
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("text/javascript");
    expect(favicon.status).toBe(200);
    expect(favicon.headers.get("content-type")).toContain("image/svg+xml");
  });

  it("embeds the HiveForge version in the UI script", async () => {
    const baseUrl = await startServer();

    const script = await fetch(`${baseUrl}/ui/app.js`);

    expect(script.status).toBe(200);
    await expect(script.text()).resolves.toContain('"version":"0.1.0-test"');
  });
});

async function startServer(): Promise<string> {
  const server = createHttpServer(createUiRoutes({ name: "hiveforge", version: "0.1.0-test" }), {
    authToken: "secret",
    publicPaths: uiPublicPaths
  });
  servers.push(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
