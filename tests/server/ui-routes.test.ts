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

  it("serves copyable UI view paths without making REST paths public", async () => {
    const baseUrl = await startServer();

    const deployments = await fetch(`${baseUrl}/ui/deployments`);
    const activity = await fetch(`${baseUrl}/ui/activity`);
    const restDeployments = await fetch(`${baseUrl}/deployments`);

    expect(deployments.status).toBe(200);
    expect(deployments.headers.get("content-type")).toContain("text/html");
    expect(activity.status).toBe(200);
    expect(activity.headers.get("content-type")).toContain("text/html");
    expect(restDeployments.status).toBe(401);
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

  it("combines operations and journal events into one activity view", async () => {
    const baseUrl = await startServer();

    const script = await fetch(`${baseUrl}/ui/app.js`);
    const body = await script.text();

    expect(script.status).toBe(200);
    expect(body).toContain("current run");
    expect(body).toContain('navItem("activity", "T", "Activity")');
    expect(body).toContain("function renderActivity()");
    expect(body).toContain("operations + durable audit");
    expect(body).toContain("function journalForOperation");
    expect(body).toContain("operation.result?.actionOperationId");
    expect(body).toContain("Debug metadata");
    expect(body).toContain("ACTIVITY_PAGE_SIZE = 25");
    expect(body).toContain("function renderActivityPagination");
    expect(body).toContain('data-activity-page="next"');
    expect(body).toContain("function selectActivityPage");
    expect(body).not.toContain("slice(0, 80)");
    expect(body).not.toContain('navItem("operations"');
    expect(body).not.toContain('navItem("journal"');
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

  it("keeps UI view state in copyable browser paths", async () => {
    const baseUrl = await startServer();

    const script = await fetch(`${baseUrl}/ui/app.js`);
    const body = await script.text();

    expect(script.status).toBe(200);
    expect(body).toContain('deployments: "/ui/deployments"');
    expect(body).toContain("function initialViewFromPath");
    expect(body).toContain("function updateBrowserPath");
    expect(body).toContain('window.history.pushState');
    expect(body).toContain('window.addEventListener("popstate"');
    expect(body).toContain("else localStorage.removeItem(TOKEN_KEY);\n  refreshUi();");
    expect(body).toContain("render();\nrefreshUi();");
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

  it("exposes a topbar button for HiveForge self-update", async () => {
    const baseUrl = await startServer();

    const script = await fetch(`${baseUrl}/ui/app.js`);
    const body = await script.text();

    expect(script.status).toBe(200);
    expect(body).toContain("updateHiveForgeButton");
    expect(body).toContain("Update HF");
    expect(body).toContain('api("/hiveforge/update", { method: "POST" })');
    expect(body).toContain("No published HiveForge release found");
    expect(body).toContain("HiveForge update started");
  });

  it("uses runtime-first deployment status with active filtering and diagnostics drilldown", async () => {
    const baseUrl = await startServer();

    const [script, styles] = await Promise.all([
      fetch(`${baseUrl}/ui/app.js`),
      fetch(`${baseUrl}/ui/styles.css`)
    ]);
    const body = await script.text();
    const css = await styles.text();

    expect(script.status).toBe(200);
    expect(styles.status).toBe(200);
    expect(body).toContain('api("/deployments/runtime-status"');
    expect(body).toContain('api("/deployments/diagnostics"');
    expect(body).toContain("function deploymentPrimaryStatus");
    expect(body).toContain('data-deployment-filter');
    expect(body).toContain('deploymentFilter: "active"');
    expect(body).toContain("Runtime deployments");
    expect(body).toContain("Recorded state");
    expect(body).toContain("Recorded compose");
    expect(body).toContain("runtime status from Docker labels");
    expect(body).toContain("No deployment matches the current filter.");
    expect(body).toContain("all replicas");
    expect(body).toContain('class="muted mono runtimeImage"');
    expect(body).toContain("preserveScroll");
    expect(body).toContain("window.scrollTo");
    expect(body).not.toContain("|| state.deployments.find((deployment) => deployment.deploymentId === state.selectedDeploymentId)");
    expect(css).toContain("grid-template-columns: minmax(320px, 0.85fr) minmax(0, 1.15fr)");
    expect(css).toContain(".runtimeImage { overflow-wrap: anywhere");
    expect(css).toContain("@media (max-width: 1100px)");
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

  it("uses registered refs and inspected components instead of free-text lifecycle inputs", async () => {
    const baseUrl = await startServer();

    const [script, styles] = await Promise.all([
      fetch(`${baseUrl}/ui/app.js`),
      fetch(`${baseUrl}/ui/styles.css`)
    ]);
    const body = await script.text();
    const css = await styles.text();

    expect(script.status).toBe(200);
    expect(styles.status).toBe(200);
    expect(body).toContain('id="refSelect"');
    expect(body).toContain("selectedProjectRefs()");
    expect(body).toContain('id="componentSelect"');
    expect(body).toContain("components.map((component)");
    expect(body).not.toContain('id="refInput"');
    expect(body).not.toContain('id="componentInput"');
    expect(css).toContain(".actionRow");
    expect(css).toContain("repeat(auto-fit, minmax(180px, 1fr))");
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
