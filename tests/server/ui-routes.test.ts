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
    const logo = await fetch(`${baseUrl}/assets/hiveforge-logo.svg`);
    const mark = await fetch(`${baseUrl}/assets/hiveforge-mark.svg`);

    expect(styles.status).toBe(200);
    expect(styles.headers.get("content-type")).toContain("text/css");
    expect(script.status).toBe(200);
    expect(script.headers.get("content-type")).toContain("text/javascript");
    expect(favicon.status).toBe(200);
    expect(favicon.headers.get("content-type")).toContain("image/svg+xml");
    expect(logo.status).toBe(200);
    expect(logo.headers.get("content-type")).toContain("image/svg+xml");
    expect(mark.status).toBe(200);
    expect(mark.headers.get("content-type")).toContain("image/svg+xml");
  });

  it("embeds the HiveForge version in the UI script", async () => {
    const baseUrl = await startServer();

    const script = await fetch(`${baseUrl}/ui/app.js`);

    expect(script.status).toBe(200);
    await expect(script.text()).resolves.toContain('"version":"0.1.0-test"');
  });

  it("keeps the sticky token bar above scrollable content", async () => {
    const baseUrl = await startServer();

    const styles = await fetch(`${baseUrl}/ui/styles.css`);

    expect(styles.status).toBe(200);
    await expect(styles.text()).resolves.toContain("z-index: 30");
  });

  it("keeps lifecycle actions and journal views separate", async () => {
    const baseUrl = await startServer();

    const script = await fetch(`${baseUrl}/ui/app.js`);
    const body = await script.text();

    expect(script.status).toBe(200);
    expect(body).toContain("current run");
    expect(body).toContain("durable audit events");
    expect(body).not.toContain("Operation history");
    expect(body).not.toContain("Operation logs");
  });

  it("uses a readable topbar brand and reserves the full logo for the home view", async () => {
    const baseUrl = await startServer();

    const script = await fetch(`${baseUrl}/ui/app.js`);
    const body = await script.text();

    expect(script.status).toBe(200);
    expect(body).toContain('class="brandMark"');
    expect(body).toContain('class="brandWordmark"');
    expect(body).toContain('class="homeBrandLogo"');
    expect(body).toContain('navItem("home", "H", "Home")');
    expect(body).toContain("https://github.com/sepa79/HiveForge");
    expect(body).toContain("validates manifests and requirements");
  });

  it("uses human environment metadata in page headers instead of raw id or kind fields", async () => {
    const baseUrl = await startServer();

    const script = await fetch(`${baseUrl}/ui/app.js`);
    const body = await script.text();

    expect(script.status).toBe(200);
    expect(body).toContain(
      'state.environment ? state.environment.description || state.environment.name : "Connect with the REST bearer token."'
    );
    expect(body).toContain("Environment / ${escapeHtml(current.name)}");
    expect(body).not.toContain("state.environment.kind");
    expect(body).not.toContain("state.environment?.id");
    expect(body).not.toContain("pageMeta");
  });

  it("exposes an Overview button for refreshing environment node inventory", async () => {
    const baseUrl = await startServer();

    const script = await fetch(`${baseUrl}/ui/app.js`);
    const body = await script.text();

    expect(script.status).toBe(200);
    expect(body).toContain("refreshEnvironmentButton");
    expect(body).toContain("Refresh nodes");
    expect(body).toContain('api("/environments/refresh", { method: "POST" })');
  });

  it("uses inspected component action subsets for the lifecycle action selector", async () => {
    const baseUrl = await startServer();

    const script = await fetch(`${baseUrl}/ui/app.js`);
    const body = await script.text();

    expect(script.status).toBe(200);
    expect(body).toContain("inspectedComponents: []");
    expect(body).toContain("function availableActionsForSelectedComponent");
    expect(body).toContain("const inspectedComponent = state.inspectedComponents.find");
    expect(body).toContain("state.inspectedComponents = result.components");
    expect(body).toContain("state.selectedComponent = result.components[0]?.name");
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
