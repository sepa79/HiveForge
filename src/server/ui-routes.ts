import { readFileSync } from "node:fs";
import path from "node:path";
import { writeText } from "./json-http.js";
import type { HiveForgeInfo } from "../app-info.js";
import type { HttpRoute } from "./http-types.js";

export const uiPublicPaths = [
  /^\/$/,
  /^\/ui(?:\/(?:home|overview|deployments|actions|activity))?$/,
  /^\/favicon\.svg$/,
  /^\/assets\/hiveforge-logo\.svg$/,
  /^\/assets\/hiveforge-mark\.svg$/,
  /^\/ui\/app\.js$/,
  /^\/ui\/styles\.css$/
];

const logoSvg = readAsset("hiveforge-logo.svg");
const markSvg = readAsset("hiveforge-mark.svg");

function readAsset(fileName: string): string {
  return readFileSync(path.join(process.cwd(), "assets", fileName), "utf8");
}

export function createUiRoutes(appInfo: HiveForgeInfo = { name: "hiveforge", version: "0.0.0-dev" }): HttpRoute[] {
  return [
    {
      method: "GET",
      pattern: /^\/$/,
      async handle({ response }) {
        writeText(response, 200, "text/html; charset=utf-8", renderIndexHtml());
      }
    },
    {
      method: "GET",
      pattern: /^\/ui(?:\/(?:home|overview|deployments|actions|activity))?$/,
      async handle({ response }) {
        writeText(response, 200, "text/html; charset=utf-8", renderIndexHtml());
      }
    },
    {
      method: "GET",
      pattern: /^\/favicon\.svg$/,
      async handle({ response }) {
        writeText(response, 200, "image/svg+xml; charset=utf-8", markSvg);
      }
    },
    {
      method: "GET",
      pattern: /^\/assets\/hiveforge-logo\.svg$/,
      async handle({ response }) {
        writeText(response, 200, "image/svg+xml; charset=utf-8", logoSvg);
      }
    },
    {
      method: "GET",
      pattern: /^\/assets\/hiveforge-mark\.svg$/,
      async handle({ response }) {
        writeText(response, 200, "image/svg+xml; charset=utf-8", markSvg);
      }
    },
    {
      method: "GET",
      pattern: /^\/ui\/styles\.css$/,
      async handle({ response }) {
        writeText(response, 200, "text/css; charset=utf-8", renderStyles());
      }
    },
    {
      method: "GET",
      pattern: /^\/ui\/app\.js$/,
      async handle({ response }) {
        writeText(response, 200, "text/javascript; charset=utf-8", renderAppScript(appInfo));
      }
    }
  ];
}

function renderIndexHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HiveForge</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/ui/styles.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/ui/app.js"></script>
</body>
</html>`;
}

function renderStyles(): string {
  return `:root {
  color-scheme: dark;
  --bg: #05070b;
  --text: rgba(255, 255, 255, 0.94);
  --muted: rgba(255, 255, 255, 0.65);
  --muted2: rgba(255, 255, 255, 0.52);
  --panel: rgba(255, 255, 255, 0.04);
  --panel2: rgba(255, 255, 255, 0.03);
  --panel3: rgba(255, 255, 255, 0.07);
  --border: rgba(255, 255, 255, 0.12);
  --border2: rgba(255, 255, 255, 0.08);
  --accent: rgba(51, 225, 255, 0.75);
  --accent-strong: #33e1ff;
  --ok: #56d391;
  --warn: #ffc857;
  --danger: #ff7575;
  --shadow: rgba(0, 0, 0, 0.32);
}

* { box-sizing: border-box; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.22) transparent; }
body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.45;
}
button, input, select { font: inherit; }
button { cursor: pointer; }
[hidden] { display: none !important; }

.appShell {
  height: 100vh;
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: 52px 1fr;
}
.topBar {
  grid-column: 1 / span 2;
  border-bottom: 1px solid var(--border2);
  background: rgba(8, 10, 14, 0.78);
  backdrop-filter: blur(6px);
  position: relative;
  z-index: 300;
}
.topBarInner { height: 52px; display: flex; align-items: center; gap: 10px; padding: 0 10px; }
.logoLink { display: inline-flex; align-items: center; height: 44px; gap: 10px; color: inherit; text-decoration: none; }
.brandMark { width: 28px; height: 28px; flex: 0 0 auto; }
.brandWordmark { font-size: 22px; font-weight: 900; line-height: 1; letter-spacing: 0; white-space: nowrap; position: relative; top: -1px; }
.brandWordHive { color: #ffc107; }
.brandWordForge { color: rgba(255, 255, 255, 0.95); }
.breadcrumb { color: var(--muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.topBarRight { margin-left: auto; display: flex; align-items: center; gap: 8px; }

.sideNav {
  grid-row: 2;
  border-right: 1px solid var(--border2);
  background: rgba(8, 10, 14, 0.88);
  backdrop-filter: blur(6px);
  padding: 8px 0;
}
.navHeader { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; padding: 0 10px 6px; min-height: 40px; display: flex; align-items: center; }
.navItem {
  display: flex; align-items: center; gap: 10px; height: 40px; margin: 0 8px 6px; padding: 0 12px;
  width: calc(100% - 16px);
  border-radius: 12px; color: #0ff; border: 1px solid rgba(51, 225, 255, 0.35);
  background: radial-gradient(120% 120% at 10% 10%, rgba(51, 225, 255, 0.25), rgba(51, 225, 255, 0.06) 40%, rgba(255, 255, 255, 0.05) 70%, rgba(0, 0, 0, 0) 100%);
  box-shadow: 0 0 20px rgba(51, 225, 255, 0.15) inset, 0 0 16px rgba(51, 225, 255, 0.18);
  text-decoration: none;
  text-align: left;
}
.navItem:hover {
  box-shadow: 0 0 26px rgba(51, 225, 255, 0.22) inset, 0 0 20px rgba(51, 225, 255, 0.28);
  background: radial-gradient(120% 120% at 10% 10%, rgba(51, 225, 255, 0.35), rgba(51, 225, 255, 0.1) 50%, rgba(255, 255, 255, 0.07) 75%, rgba(0, 0, 0, 0) 100%);
}
.navItemActive { background: #33e1ff !important; color: #111 !important; font-weight: 800; border-color: transparent !important; box-shadow: none; }
.navIcon { width: 18px; text-align: center; font-weight: 900; }
.navLabel { color: inherit; font-size: 12px; font-weight: 700; letter-spacing: 0.1px; }

.appContent { grid-row: 2; min-width: 0; min-height: 0; overflow: auto; }
.toolsBar {
  min-height: 48px; border-bottom: 1px solid var(--border2); background: rgba(8, 10, 14, 0.96);
  display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px 14px; position: sticky; top: 0; z-index: 30;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.24);
}
.toolsBar .fieldInput { width: min(720px, 70vw); }
.page { width: min(1240px, calc(100vw - 276px)); margin: 0 auto; padding: 18px 0 32px; }
.pageHeader { display: flex; gap: 16px; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
.pageHome .pageHeader { justify-content: center; text-align: center; }
.pageHome .pageHeader .mono { display: none; }
.homeHero { width: min(980px, 100%); margin: 0 auto 14px; }
.homeHeroPanel {
  border: 1px solid var(--border); border-radius: 12px; background: var(--panel); box-shadow: 0 16px 40px var(--shadow);
  display: flex; flex-direction: column; align-items: center; text-align: center; padding: 34px 28px 30px;
}
.homeBrandLogo { display: block; width: min(680px, 100%); max-height: 220px; margin: 0 auto; object-fit: contain; object-position: center; }
.homeCopy { margin: 14px auto 0; color: var(--muted); text-align: center; max-width: 980px; font-size: 15px; line-height: 1.6; }
.homeActions { display: flex; justify-content: center; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
.h1 { margin: 0; font-size: 28px; line-height: 1.1; letter-spacing: 0; }
.h2 { margin: 0; font-size: 15px; font-weight: 900; letter-spacing: 0; }
.muted { color: var(--muted); }
.muted2 { color: var(--muted2); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

.grid { display: grid; gap: 12px; }
.summaryGrid { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 12px; }
.mainGrid { grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr); align-items: start; }
.card {
  border: 1px solid var(--border); background: var(--panel); border-radius: 12px; box-shadow: 0 16px 40px var(--shadow);
}
.cardHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border-bottom: 1px solid var(--border2); }
.cardBody { padding: 12px; }
.metric { padding: 12px; min-height: 84px; }
.metricLabel { color: var(--muted); font-size: 12px; }
.metricValue { font-size: 24px; font-weight: 900; margin-top: 6px; line-height: 1; }

.tableWrap { overflow: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--panel2); }
.table { width: 100%; border-collapse: collapse; min-width: 760px; }
.table th, .table td { padding: 10px 12px; border-bottom: 1px solid var(--border2); text-align: left; vertical-align: top; }
.table th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.7px; background: rgba(255, 255, 255, 0.025); }
.table tr:last-child td { border-bottom: 0; }

.pill {
  display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--panel3); color: var(--text); font-size: 12px; font-weight: 800;
}
.pill[data-kind="ok"] { border-color: rgba(86, 211, 145, 0.35); color: var(--ok); }
.pill[data-kind="warn"] { border-color: rgba(255, 200, 87, 0.38); color: var(--warn); }
.pill[data-kind="alert"] { border-color: rgba(255, 117, 117, 0.4); color: var(--danger); }

.button, .select, .fieldInput {
  min-height: 34px; border-radius: 10px; border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.055); color: var(--text);
}
.button {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 11px;
  min-width: 90px; font-weight: 800; text-decoration: none; white-space: nowrap;
}
.button:hover { border-color: rgba(51, 225, 255, 0.45); }
.button:disabled { opacity: 0.52; cursor: not-allowed; }
.button[data-kind="danger"] { border-color: rgba(255, 117, 117, 0.36); color: #ffb4b4; }
.select, .fieldInput { width: 100%; min-width: 0; max-width: 100%; padding: 0 9px; }
.field { display: grid; gap: 5px; min-width: 0; }
.fieldLabel { color: var(--muted); font-size: 12px; font-weight: 700; }
.formRow { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; align-items: end; }
.actionRow { display: grid; grid-template-columns: minmax(150px, 220px) repeat(2, minmax(90px, max-content)); gap: 10px; align-items: end; margin-top: 10px; }
.notice { border: 1px solid var(--border); background: var(--panel2); border-radius: 12px; padding: 10px 12px; min-width: 0; overflow-wrap: anywhere; }
.notice[data-kind="error"] { border-color: rgba(255, 117, 117, 0.36); color: #ffb4b4; }
.notice[data-kind="ok"] { border-color: rgba(86, 211, 145, 0.35); color: #a3efc6; }
.statusSteps { display: grid; gap: 8px; margin: 12px 0; }
.statusStep { display: flex; align-items: center; gap: 8px; color: var(--muted); min-width: 0; }
.statusStepText { min-width: 0; overflow-wrap: anywhere; }
.statusDot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid var(--border); background: var(--panel3); flex: 0 0 auto; }
.statusStep[data-state="running"] { color: var(--accent-strong); }
.statusStep[data-state="running"] .statusDot { background: var(--accent-strong); box-shadow: 0 0 14px rgba(51, 225, 255, 0.6); }
.statusStep[data-state="done"] { color: var(--ok); }
.statusStep[data-state="done"] .statusDot { background: var(--ok); }
.statusStep[data-state="failed"] { color: var(--danger); }
.statusStep[data-state="failed"] .statusDot { background: var(--danger); }
.pre {
  max-height: 260px; overflow: auto; white-space: pre-wrap; word-break: break-word; margin: 0;
  font-size: 12px; color: rgba(255, 255, 255, 0.78);
}
.activityLayout { display: grid; grid-template-columns: minmax(320px, 0.85fr) minmax(0, 1.15fr); gap: 12px; align-items: start; }
.activityLayout > .card { min-width: 0; }
.activityList { display: grid; gap: 8px; min-width: 0; }
.activityItem {
  width: 100%; border: 1px solid var(--border); border-radius: 10px; background: var(--panel2); color: inherit;
  display: grid; gap: 6px; padding: 10px; text-align: left; min-width: 0;
}
.activityItem:hover { border-color: rgba(51, 225, 255, 0.38); }
.activityItemActive { border-color: rgba(51, 225, 255, 0.62); background: rgba(51, 225, 255, 0.08); }
.activityItemTop { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
.activityItemTop > strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.activityTitle { min-width: 0; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.activityMeta { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.activityReason { color: var(--muted); font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
.detailGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 12px 0; }
.detailCell { border: 1px solid var(--border2); border-radius: 10px; background: var(--panel2); padding: 9px; min-width: 0; }
.detailLabel { color: var(--muted2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; }
.detailValue { margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.debugDetails { margin-top: 12px; color: var(--muted); }
.debugDetails summary { cursor: pointer; font-weight: 800; }
.debugGrid { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 10px; margin-top: 8px; min-width: 0; overflow-wrap: anywhere; }
.toolbarRow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.filterButton { min-width: auto; height: 30px; font-size: 12px; padding: 0 10px; }
.filterButtonActive { border-color: rgba(51, 225, 255, 0.62); background: rgba(51, 225, 255, 0.12); }
.paginationRow { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.pagerButtons { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.runtimeEvidence { display: grid; gap: 8px; margin-top: 12px; min-width: 0; }
.runtimeItem { border: 1px solid var(--border2); border-radius: 10px; background: var(--panel2); padding: 9px; min-width: 0; max-width: 100%; overflow: hidden; }
.runtimeNameLine { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.runtimeName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.runtimeImage { overflow-wrap: anywhere; word-break: break-word; }
.composePreview { max-height: 360px; }

@media (max-width: 1100px) {
  .activityLayout { grid-template-columns: 1fr; }
}

@media (max-width: 700px) {
  .appShell { grid-template-columns: 56px 1fr; }
  .brandWordmark, .breadcrumb, .navHeader, .navLabel { display: none; }
  .navItem { justify-content: center; padding: 0; }
  .page { width: calc(100vw - 84px); padding: 14px 0 24px; }
  .toolsBar .fieldInput { width: min(100%, 52vw); }
  .summaryGrid, .mainGrid, .activityLayout, .detailGrid { grid-template-columns: 1fr; }
  .formRow, .actionRow { grid-template-columns: 1fr; }
}
`;
}

function renderAppScript(appInfo: HiveForgeInfo): string {
  return `const TOKEN_KEY = "HIVEFORGE_UI_TOKEN";
const HIVEFORGE_INFO = ${JSON.stringify(appInfo)};
const ACTIONS = ["deploy", "update", "upgrade", "remove", "purge"];
const ACTIVITY_PAGE_SIZE = 25;
const VIEW_PATHS = {
  home: "/ui",
  overview: "/ui/overview",
  deployments: "/ui/deployments",
  actions: "/ui/actions",
  activity: "/ui/activity"
};
const PATH_VIEWS = Object.fromEntries(Object.entries(VIEW_PATHS).map(([view, path]) => [path, view]));

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  environment: null,
  projects: [],
  inspectedComponents: [],
  deployments: [],
  deploymentRuntime: {},
  deploymentRuntimeLoading: false,
  deploymentDiagnostics: {},
  deploymentDiagnosticsLoading: false,
  deploymentDetailError: null,
  selectedDeploymentId: "",
  deploymentFilter: "active",
  operations: [],
  journal: [],
  selectedProject: "",
  selectedComponent: "",
  selectedProfile: "",
  selectedRef: "",
  selectedAction: "deploy",
  view: initialViewFromPath(),
  busy: false,
  environmentRefreshing: false,
  hiveforgeUpdating: false,
  operation: null,
  operationPoll: null,
  selectedActivityId: "",
  activityPage: 0,
  message: null,
  error: null
};

const app = document.getElementById("app");

function initialViewFromPath() {
  return PATH_VIEWS[window.location.pathname] || "home";
}

function normalizeView(view) {
  return VIEW_PATHS[view] ? view : "home";
}

function updateBrowserPath(view) {
  const path = VIEW_PATHS[normalizeView(view)];
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
}

function authHeaders(extra = {}) {
  return state.token ? { ...extra, Authorization: \`Bearer \${state.token}\` } : extra;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: authHeaders({ "content-type": "application/json", ...(options.headers || {}) })
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(body && body.error ? body.error : \`Request failed: \${response.status}\`);
  }
  return body;
}

async function refreshAll(options = {}) {
  if (!state.token) {
    if (options.render !== false) render({ preserveScroll: options.preserveScroll === true });
    return;
  }
  state.error = null;
  try {
    const [environments, projects, deployments, operations, journal] = await Promise.all([
      api("/environments"),
      api("/projects"),
      api("/deployments"),
      api("/operations"),
      api("/journal")
    ]);
    state.environment = environments.current;
    state.projects = projects.projects;
    state.deployments = deployments.deployments;
    if (!state.deployments.some((deployment) => deployment.deploymentId === state.selectedDeploymentId)) {
      state.selectedDeploymentId = defaultDeploymentId();
    }
    state.operations = operations.operations;
    state.journal = journal.events.slice().reverse();
    const policyProject = state.environment?.policy?.projects?.[0];
    if (!currentProject()) {
      state.selectedProject = policyProject?.id || state.projects[0]?.id || "";
    }
    const refs = selectedProjectRefs();
    if (!refs.includes(state.selectedRef)) {
      state.selectedRef = refs[0] || "";
    }
    const profiles = currentPolicyProject()?.profiles || [];
    if (!profiles.includes(state.selectedProfile)) {
      state.selectedProfile = profiles[0] || "";
    }
    const actions = availableActionsForSelectedComponent(policyProject);
    state.selectedAction = actions.includes(state.selectedAction) ? state.selectedAction : actions[0] || "deploy";
    normalizeActivitySelection(activityItems());
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Request failed";
  }
  if (options.render !== false) render({ preserveScroll: options.preserveScroll === true });
}

async function refreshUi() {
  await refreshAll({ preserveScroll: true });
  if (state.view === "deployments") {
    await refreshDeploymentsView();
  }
}

function setView(view, options = {}) {
  state.view = normalizeView(view);
  if (options.updateUrl !== false) updateBrowserPath(state.view);
  if (state.view === "deployments" && !state.selectedDeploymentId) {
    state.selectedDeploymentId = defaultDeploymentId();
  }
  render();
  if (state.view === "deployments") {
    void refreshDeploymentsView();
  }
}

async function refreshDeploymentsView() {
  if (!state.token || state.view !== "deployments") return;
  await Promise.all([
    refreshDeploymentRuntimeSummaries({ render: true }),
    loadSelectedDeploymentDiagnostics({ render: true })
  ]);
}

async function refreshDeploymentRuntimeSummaries(options = {}) {
  if (!state.token || !state.deployments.length) return;
  state.deploymentRuntimeLoading = true;
  if (options.render !== false) render({ preserveScroll: options.preserveScroll !== false });
  const entries = await Promise.all(
    state.deployments.map(async (deployment) => {
      if (deployment.status === "removed") {
        return [deployment.deploymentId, {
          summary: "removed",
          reason: "Deployment is recorded as removed in HiveForge state.",
          containers: [],
          services: []
        }];
      }
      try {
        const runtime = await api("/deployments/runtime-status", {
          method: "POST",
          body: JSON.stringify({ deploymentId: deployment.deploymentId })
        });
        return [deployment.deploymentId, runtime];
      } catch (error) {
        const message = error instanceof Error ? error.message : "Runtime status check failed";
        return [deployment.deploymentId, {
          summary: "unknown",
          unavailable: true,
          reason: message,
          containers: [],
          services: []
        }];
      }
    })
  );
  state.deploymentRuntime = Object.fromEntries(entries);
  state.deploymentRuntimeLoading = false;
  if (options.render !== false) render({ preserveScroll: options.preserveScroll !== false });
}

async function loadSelectedDeploymentDiagnostics(options = {}) {
  if (!state.selectedDeploymentId) return;
  await loadDeploymentDiagnostics(state.selectedDeploymentId, options);
}

async function loadDeploymentDiagnostics(deploymentId, options = {}) {
  if (!state.token || !deploymentId) return;
  state.deploymentDiagnosticsLoading = true;
  state.deploymentDetailError = null;
  if (options.render !== false) render({ preserveScroll: options.preserveScroll !== false });
  try {
    const diagnostics = await api("/deployments/diagnostics", {
      method: "POST",
      body: JSON.stringify({ deploymentId })
    });
    state.deploymentDiagnostics = {
      ...state.deploymentDiagnostics,
      [deploymentId]: diagnostics
    };
  } catch (error) {
    state.deploymentDetailError = error instanceof Error ? error.message : "Deployment diagnostics failed";
  } finally {
    state.deploymentDiagnosticsLoading = false;
    if (options.render !== false) render({ preserveScroll: options.preserveScroll !== false });
  }
}

function currentPolicyProject() {
  return state.environment?.policy?.projects?.find((project) => project.id === state.selectedProject) || null;
}

function currentProject() {
  return state.projects.find((project) => project.id === state.selectedProject) || null;
}

function selectedProjectRefs() {
  return currentProject()?.approvedRefs || [];
}

async function inspectSelectedProject() {
  if (!state.selectedProject || !state.selectedRef) return;
  state.error = null;
  state.operation = {
    kind: "inspect",
    status: "running",
    title: \`Inspecting \${state.selectedProject}@\${state.selectedRef}\`,
    steps: [{ label: "Checkout and load manifests", state: "running" }]
  };
  render();
  try {
    const result = await api(\`/projects/\${encodeURIComponent(state.selectedProject)}/inspect\`, {
      method: "POST",
      body: JSON.stringify({ gitRef: state.selectedRef })
    });
    state.inspectedComponents = result.components;
    state.selectedComponent = result.components[0]?.name || state.selectedComponent;
    const actions = availableActionsForSelectedComponent();
    state.selectedAction = actions.includes(state.selectedAction) ? state.selectedAction : actions[0] || state.selectedAction;
    state.message = \`Inspection loaded \${result.components.length} component(s).\`;
    await refreshAll({ render: false });
    state.operation = await api(\`/operations/\${encodeURIComponent(result.operationId)}\`);
    state.selectedActivityId = activityIdForOperation(state.operation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inspection failed";
    await refreshAll({ render: false });
    state.error = message;
    state.operation = state.operations.find((operation) =>
      operation.kind === "project_inspection" &&
      operation.projectId === state.selectedProject &&
      operation.gitRef === state.selectedRef &&
      operation.status === "failed"
    ) || {
      ...state.operation,
      status: "failed",
      title: "Inspection failed",
      steps: [{ label: message, state: "failed" }]
    };
    if (state.operation.operationId) {
      state.selectedActivityId = activityIdForOperation(state.operation);
    }
  }
  render();
}

async function refreshEnvironmentInventory() {
  if (!state.token) {
    state.error = "API token is required to refresh the environment.";
    render();
    return;
  }
  state.environmentRefreshing = true;
  state.error = null;
  state.message = null;
  render();
  try {
    await api("/environments/refresh", { method: "POST" });
    await refreshAll({ render: false });
    state.message = "Environment inventory refreshed.";
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Environment refresh failed";
  } finally {
    state.environmentRefreshing = false;
    render();
  }
}

async function updateHiveForge() {
  if (!state.token) {
    state.error = "API token is required to update HiveForge.";
    render();
    return;
  }
  state.hiveforgeUpdating = true;
  state.error = null;
  state.message = null;
  render();
  try {
    const result = await api("/hiveforge/update", { method: "POST" });
    if (result.status === "no_release") {
      state.message = "No published HiveForge release found on GitHub.";
    } else if (result.status === "up_to_date") {
      state.message = \`HiveForge is up to date: v\${result.currentVersion}.\`;
    } else {
      state.message = \`HiveForge update started: v\${result.currentVersion} -> \${result.latestTag}. Refresh after the container restarts.\`;
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "HiveForge update failed";
  } finally {
    state.hiveforgeUpdating = false;
    render();
  }
}

async function runLifecycleAction() {
  if (!state.selectedProject || !state.selectedComponent || !state.selectedRef || !state.selectedAction) return;
  state.busy = true;
  state.error = null;
  state.message = null;
  state.operation = null;
  render();
  try {
    const body = { gitRef: state.selectedRef };
    if (state.selectedProfile) body.profile = state.selectedProfile;
    const operation = await api(
      \`/operations/projects/\${encodeURIComponent(state.selectedProject)}/actions/\${encodeURIComponent(state.selectedComponent)}/\${encodeURIComponent(state.selectedAction)}\`,
      { method: "POST", body: JSON.stringify(body) }
    );
    state.operation = operation;
    state.selectedActivityId = activityIdForOperation(operation);
    state.message = \`Started operation: \${operation.operationId}\`;
    pollOperation(operation.operationId);
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Action failed";
    state.busy = false;
    render();
  }
}

async function pollOperation(operationId) {
  if (state.operationPoll) window.clearTimeout(state.operationPoll);
  try {
    state.operation = await api(\`/operations/\${encodeURIComponent(operationId)}\`);
    if (state.operation.status === "running") {
      render();
      state.operationPoll = window.setTimeout(() => pollOperation(operationId), 1000);
      return;
    }
    state.busy = false;
    await refreshAll();
    state.operation = await api(\`/operations/\${encodeURIComponent(operationId)}\`);
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Operation polling failed";
    state.busy = false;
  }
  render();
}

function setToken(value) {
  state.token = value.trim();
  if (state.token) localStorage.setItem(TOKEN_KEY, state.token);
  else localStorage.removeItem(TOKEN_KEY);
  refreshUi();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pill(value, kind = "") {
  return \`<span class="pill" \${kind ? \`data-kind="\${kind}"\` : ""}>\${escapeHtml(value)}</span>\`;
}

function renderDeployments() {
  if (!state.deployments.length) {
    return \`<div class="notice muted">No deployments recorded for this environment.</div>\`;
  }
  const deployments = filteredDeployments();
  const selected = deployments.find((deployment) => deployment.deploymentId === state.selectedDeploymentId) || deployments[0] || null;
  return \`<div>
    <div class="toolbarRow">
      \${deploymentFilterButton("active", "Active")}
      \${deploymentFilterButton("all", "All")}
      \${deploymentFilterButton("failed", "Problems")}
      \${deploymentFilterButton("removed", "Removed")}
      <span class="muted2">\${state.deploymentRuntimeLoading ? "checking Docker runtime..." : "runtime status from Docker labels"}</span>
    </div>
    <div class="activityLayout">
      <section class="card">
        <div class="cardHeader"><h2 class="h2">Runtime deployments</h2><span class="muted2">\${deployments.length} shown</span></div>
        <div class="cardBody">
          \${deployments.length ? \`<div class="activityList">\${deployments.map((deployment) => renderDeploymentListItem(deployment, deployment.deploymentId === selected.deploymentId)).join("")}</div>\` : \`<div class="notice muted">No deployments match this filter.</div>\`}
        </div>
      </section>
      <section class="card">
        <div class="cardHeader"><h2 class="h2">Deployment detail</h2><span class="muted2">\${selected ? escapeHtml(selected.deploymentName || selected.deploymentId) : "no match"}</span></div>
        <div class="cardBody">\${selected ? renderDeploymentDetail(selected) : \`<div class="notice muted">No deployment matches the current filter.</div>\`}</div>
      </section>
    </div>
  </div>\`;
}

function deploymentFilterButton(filter, label) {
  const active = state.deploymentFilter === filter ? " filterButtonActive" : "";
  return \`<button class="button filterButton\${active}" type="button" data-deployment-filter="\${filter}">\${escapeHtml(label)}</button>\`;
}

function renderDeploymentListItem(deployment, selected) {
  const status = deploymentPrimaryStatus(deployment);
  return \`<button class="activityItem\${selected ? " activityItemActive" : ""}" type="button" data-deployment-id="\${escapeHtml(deployment.deploymentId)}">
    <div class="activityItemTop">
      <span class="activityTitle">\${escapeHtml(deployment.project)}/\${escapeHtml(deployment.component)}</span>
      \${pill(status.label, status.kind)}
    </div>
    <div class="activityMeta">\${escapeHtml(deployment.deploymentName || deployment.deploymentId)} · \${escapeHtml(deployment.gitRef)} · \${escapeHtml(deployment.profile || "default")}</div>
    <div class="activityReason">\${escapeHtml(status.reason)}</div>
  </button>\`;
}

function renderDeploymentDetail(deployment) {
  const status = deploymentPrimaryStatus(deployment);
  const diagnostics = state.deploymentDiagnostics[deployment.deploymentId];
  const runtime = diagnostics?.runtime || state.deploymentRuntime[deployment.deploymentId];
  return \`<div>
    <div class="activityItemTop">
      <strong>\${escapeHtml(deployment.project)}/\${escapeHtml(deployment.component)}</strong>
      \${pill(status.label, status.kind)}
    </div>
    <div class="notice" \${status.key === "running" ? \`data-kind="ok"\` : status.key === "checking" ? "" : \`data-kind="error"\`} style="margin-top:10px;">\${escapeHtml(status.reason)}</div>
    <div class="detailGrid">
      \${detailCell("Runtime", status.label)}
      \${detailCell("Recorded state", deployment.status)}
      \${detailCell("Runtime name", deployment.deploymentName || deployment.deploymentId)}
      \${detailCell("Ref", deployment.gitRef)}
      \${detailCell("Profile", deployment.profile || "default")}
      \${detailCell("Last action", deployment.lastAction)}
      \${detailCell("Updated", formatFullTime(deployment.updatedAt))}
      \${detailCell("Operation", deployment.operationId)}
    </div>
    <h2 class="h2" style="margin:14px 0 8px;">Runtime</h2>
    \${renderRuntimeEvidence(runtime)}
    <h2 class="h2" style="margin:14px 0 8px;">Diagnostics</h2>
    \${renderDeploymentAnalysis(diagnostics)}
    <h2 class="h2" style="margin:14px 0 8px;">Recorded compose</h2>
    \${renderDeploymentCompose(diagnostics)}
    \${renderDeploymentDebug(deployment, diagnostics)}
  </div>\`;
}

function renderRuntimeEvidence(runtime) {
  if (!runtime) {
    return \`<div class="notice muted">Runtime status has not been checked yet.</div>\`;
  }
  const services = runtime.services || [];
  const containers = runtime.containers || [];
  if (!services.length && !containers.length) {
    return \`<div class="notice muted">\${escapeHtml(runtime.reason || "No Docker containers or services matched this deployment label.")}</div>\`;
  }
  return \`<div class="runtimeEvidence">
    \${services.map((service) => \`<div class="runtimeItem"><div class="runtimeNameLine"><strong class="runtimeName">\${escapeHtml(service.name)}</strong>\${pill(service.replicas || "service", service.replicas && service.replicas.startsWith("0/") ? "alert" : "")}</div><div class="muted mono runtimeImage">\${escapeHtml(service.image)}</div>\${renderServiceTasks(service.tasks || [])}</div>\`).join("")}
    \${containers.map((container) => \`<div class="runtimeItem"><div class="runtimeNameLine"><strong class="runtimeName">\${escapeHtml(container.name)}</strong>\${pill(container.state || "container", container.state === "running" ? "ok" : "alert")}</div><div class="muted mono runtimeImage">\${escapeHtml(container.image)}</div><div class="muted runtimeImage">\${escapeHtml(container.status || "")}\${container.health ? \` · health: \${escapeHtml(container.health)}\` : ""}</div></div>\`).join("")}
  </div>\`;
}

function renderServiceTasks(tasks) {
  if (!tasks.length) return "";
  return \`<div class="statusSteps">\${tasks.slice(0, 8).map((task) => \`<div class="statusStep" data-state="\${task.currentState?.toLowerCase().includes("running") ? "done" : task.error ? "failed" : "running"}"><span class="statusDot"></span><span class="statusStepText">\${escapeHtml(task.name)} <span class="muted">\${escapeHtml(task.currentState || task.desiredState || "")}\${task.error ? \` · \${escapeHtml(task.error)}\` : ""}</span></span></div>\`).join("")}</div>\`;
}

function renderDeploymentAnalysis(diagnostics) {
  if (state.deploymentDiagnosticsLoading) {
    return \`<div class="notice muted">Loading deployment diagnostics...</div>\`;
  }
  if (state.deploymentDetailError) {
    return \`<div class="notice" data-kind="error">\${escapeHtml(state.deploymentDetailError)}</div>\`;
  }
  if (!diagnostics) {
    return \`<div class="notice muted">Select a deployment to load diagnostics.</div>\`;
  }
  const findings = diagnostics.analysis?.findings || [];
  if (!findings.length) {
    return \`<div class="notice" data-kind="ok">\${escapeHtml(diagnostics.analysis?.summary || "ok")}</div>\`;
  }
  return \`<div class="runtimeEvidence">\${findings.map((finding) => \`<div class="runtimeItem"><strong>\${escapeHtml(humanLabel(finding.type))}</strong> \${pill(finding.severity, finding.severity === "error" ? "alert" : finding.severity === "warning" ? "warn" : "")}<div class="muted">\${escapeHtml(finding.message)}</div></div>\`).join("")}</div>\`;
}

function renderDeploymentCompose(diagnostics) {
  if (!diagnostics) {
    return \`<div class="notice muted">Compose artifact loads with deployment diagnostics.</div>\`;
  }
  const compose = diagnostics.compose;
  if (!compose || compose.status !== "present") {
    return \`<div class="notice muted">\${escapeHtml(compose?.reason || "No recorded compose artifact is available.")}</div>\`;
  }
  const digest = compose.artifact?.digestMatchesJournal === false ? "digest mismatch" : "recorded artifact";
  return \`<div class="field"><span class="fieldLabel">\${escapeHtml(digest)}\${compose.redacted ? " · redacted" : ""}</span><pre class="pre composePreview">\${escapeHtml(compose.content || "")}</pre></div>\`;
}

function renderDeploymentDebug(deployment, diagnostics) {
  const rows = [
    ["deploymentId", deployment.deploymentId],
    ["operationId", deployment.operationId],
    ["environment", deployment.environment],
    ["repository", deployment.repository],
    ["requiredLabels", diagnostics?.runtime?.requiredLabels ? JSON.stringify(diagnostics.runtime.requiredLabels) : ""],
    ["composeSource", diagnostics?.compose?.source || ""]
  ].filter(([, value]) => value);
  return \`<details class="debugDetails">
    <summary>Debug metadata</summary>
    <div class="debugGrid">\${rows.map(([label, value]) => \`<span class="muted2">\${escapeHtml(label)}</span><span class="mono">\${escapeHtml(value)}</span>\`).join("")}</div>
  </details>\`;
}

function renderActivity() {
  const activities = activityItems();
  if (!activities.length) {
    return \`<div class="notice muted">No activity recorded by this HiveForge process or durable journal.</div>\`;
  }
  normalizeActivitySelection(activities);
  const pageCount = activityPageCount(activities);
  const start = state.activityPage * ACTIVITY_PAGE_SIZE;
  const pageActivities = activities.slice(start, start + ACTIVITY_PAGE_SIZE);
  const selected = pageActivities.find((activity) => activity.id === state.selectedActivityId) || pageActivities[0];
  return \`<div class="activityLayout">
    <section class="card">
      <div class="cardHeader"><h2 class="h2">Recent activity</h2><span class="muted2">operations + durable audit</span></div>
      <div class="cardBody">
        <div class="activityList">
          \${pageActivities.map((activity) => renderActivityListItem(activity, activity.id === selected.id)).join("")}
        </div>
        \${renderActivityPagination(activities.length, state.activityPage, pageCount)}
      </div>
    </section>
    <section class="card">
      <div class="cardHeader"><h2 class="h2">Activity detail</h2><span class="muted2">\${escapeHtml(selected.sourceLabel)}</span></div>
      <div class="cardBody">\${renderActivityDetail(selected)}</div>
    </section>
  </div>\`;
}

function renderActivityPagination(total, page, pageCount) {
  const start = page * ACTIVITY_PAGE_SIZE + 1;
  const end = Math.min(total, (page + 1) * ACTIVITY_PAGE_SIZE);
  return \`<div class="paginationRow">
    <span class="muted2">\${start}-\${end} of \${total}</span>
    <div class="pagerButtons">
      <button class="button filterButton" type="button" data-activity-page="previous" \${page <= 0 ? "disabled" : ""}>Previous</button>
      <span class="muted2">Page \${page + 1} of \${pageCount}</span>
      <button class="button filterButton" type="button" data-activity-page="next" \${page >= pageCount - 1 ? "disabled" : ""}>Next</button>
    </div>
  </div>\`;
}

function renderActivityListItem(activity, selected) {
  return \`<button class="activityItem\${selected ? " activityItemActive" : ""}" type="button" data-activity-id="\${escapeHtml(activity.id)}">
    <div class="activityItemTop">
      <span class="activityTitle">\${escapeHtml(activity.title)}</span>
      \${pill(activity.status, statusKind(activity.status))}
    </div>
    <div class="activityMeta">\${escapeHtml(activity.whenLabel)} · \${escapeHtml(activity.target)} · \${escapeHtml(activity.refLabel)}</div>
    <div class="activityReason">\${escapeHtml(activity.reason)}</div>
  </button>\`;
}

function renderActivityDetail(activity) {
  const stdout = (activity.operation?.logs || []).filter((entry) => entry.level === "stdout").map((entry) => entry.message).join("\\n");
  const stderr = (activity.operation?.logs || []).filter((entry) => entry.level === "stderr").map((entry) => entry.message).join("\\n");
  return \`<div>
    <div class="activityItemTop">
      <strong>\${escapeHtml(activity.title)}</strong>
      \${pill(activity.status, statusKind(activity.status))}
    </div>
    <div class="notice" \${activity.status === "failed" ? \`data-kind="error"\` : activity.status === "succeeded" ? \`data-kind="ok"\` : ""} style="margin-top:10px;">\${escapeHtml(activity.reason)}</div>
    <div class="detailGrid">
      \${detailCell("Target", activity.target)}
      \${detailCell("Ref", activity.refLabel)}
      \${detailCell("Profile", activity.profileLabel)}
      \${detailCell("Duration", activity.duration)}
      \${detailCell("Started", activity.startedLabel)}
      \${detailCell("Ended", activity.endedLabel)}
    </div>
    <div class="statusSteps">\${renderActivityTimeline(activity)}</div>
    \${stdout ? \`<div class="field" style="margin-top:10px;"><span class="fieldLabel">stdout</span><pre class="pre">\${escapeHtml(stdout)}</pre></div>\` : ""}
    \${stderr ? \`<div class="field" style="margin-top:10px;"><span class="fieldLabel">stderr</span><pre class="pre">\${escapeHtml(stderr)}</pre></div>\` : ""}
    \${renderActivityDebug(activity)}
  </div>\`;
}

function detailCell(label, value) {
  return \`<div class="detailCell"><div class="detailLabel">\${escapeHtml(label)}</div><div class="detailValue">\${escapeHtml(value || "—")}</div></div>\`;
}

function renderActivityTimeline(activity) {
  const logs = (activity.operation?.logs || []).filter((entry) => entry.level === "info" || entry.level === "error");
  if (logs.length) {
    return logs.map((entry) => \`<div class="statusStep" data-state="\${entry.level === "error" ? "failed" : activity.status === "running" ? "running" : "done"}"><span class="statusDot"></span><span><span class="muted mono">\${escapeHtml(formatClockTime(entry.at))}</span> \${escapeHtml(entry.message)}</span></div>\`).join("");
  }
  if (activity.journal) {
    return \`<div class="statusStep" data-state="done"><span class="statusDot"></span><span><span class="muted mono">\${escapeHtml(formatClockTime(activity.journal.startedAt))}</span> Started \${escapeHtml(operationTypeLabel(activity.journal.operationType))}</span></div>
      <div class="statusStep" data-state="\${activity.journal.status === "failed" ? "failed" : "done"}"><span class="statusDot"></span><span><span class="muted mono">\${escapeHtml(formatClockTime(activity.journal.endedAt))}</span> \${escapeHtml(activity.journal.reason)}</span></div>\`;
  }
  return \`<div class="notice muted">No step log is available for this activity.</div>\`;
}

function renderActivityDebug(activity) {
  const rows = [
    ["source", activity.sourceLabel],
    ["operationId", activity.operationId],
    ["actionOperationId", activity.actionOperationId],
    ["journalOperationId", activity.journal?.operationId || ""],
    ["eventId", activity.eventId],
    ["kind", activity.operation?.kind || ""],
    ["operationType", activity.journal?.operationType || ""],
    ["repository", activity.repository || ""],
    ["deploymentName", activity.operation?.deploymentName || ""]
  ].filter(([, value]) => value);
  return \`<details class="debugDetails">
    <summary>Debug metadata</summary>
    <div class="debugGrid">\${rows.map(([label, value]) => \`<span class="muted2">\${escapeHtml(label)}</span><span class="mono">\${escapeHtml(value)}</span>\`).join("")}</div>
  </details>\`;
}

function activityPageCount(activities) {
  return Math.max(1, Math.ceil(activities.length / ACTIVITY_PAGE_SIZE));
}

function normalizeActivitySelection(activities) {
  if (!activities.length) {
    state.selectedActivityId = "";
    state.activityPage = 0;
    return;
  }
  const selectedIndex = activities.findIndex((activity) => activity.id === state.selectedActivityId);
  if (selectedIndex === -1) {
    state.selectedActivityId = activities[0].id;
    state.activityPage = 0;
    return;
  }
  const selectedPage = Math.floor(selectedIndex / ACTIVITY_PAGE_SIZE);
  const pageCount = activityPageCount(activities);
  if (state.activityPage < 0 || state.activityPage >= pageCount) {
    state.activityPage = selectedPage;
    return;
  }
  const pageStart = state.activityPage * ACTIVITY_PAGE_SIZE;
  const pageEnd = pageStart + ACTIVITY_PAGE_SIZE;
  if (selectedIndex < pageStart || selectedIndex >= pageEnd) {
    state.activityPage = selectedPage;
  }
}

function selectActivityPage(direction) {
  const activities = activityItems();
  if (!activities.length) {
    normalizeActivitySelection(activities);
    return;
  }
  const pageCount = activityPageCount(activities);
  const delta = direction === "next" ? 1 : -1;
  state.activityPage = Math.min(pageCount - 1, Math.max(0, state.activityPage + delta));
  const firstOnPage = activities[state.activityPage * ACTIVITY_PAGE_SIZE];
  state.selectedActivityId = firstOnPage?.id || activities[0].id;
}

function activityItems() {
  const eventByOperationId = new Map();
  for (const event of state.journal) {
    if (!eventByOperationId.has(event.operationId)) {
      eventByOperationId.set(event.operationId, event);
    }
  }
  const linkedEventIds = new Set();
  const operationItems = state.operations.map((operation) => {
    const journal = journalForOperation(operation, eventByOperationId);
    if (journal) linkedEventIds.add(journal.eventId);
    return activityFromOperation(operation, journal);
  });
  const journalItems = state.journal
    .filter((event) => !linkedEventIds.has(event.eventId))
    .map((event) => activityFromJournal(event));
  return [...operationItems, ...journalItems].sort((left, right) => right.sortAt.localeCompare(left.sortAt));
}

function journalForOperation(operation, eventByOperationId) {
  const direct = eventByOperationId.get(operation.operationId);
  if (direct) return direct;
  const actionOperationId = operation.result?.actionOperationId;
  return actionOperationId ? eventByOperationId.get(actionOperationId) || null : null;
}

function activityFromOperation(operation, journal) {
  const reason = operation.error || journal?.reason || lastOperationMessage(operation) || (operation.status === "running" ? "Running" : "Completed");
  const startedAt = operation.startedAt || journal?.startedAt || "";
  const endedAt = operation.endedAt || journal?.endedAt || "";
  return {
    id: activityIdForOperation(operation),
    sourceLabel: journal ? "Operation + journal" : "Operation",
    title: operationTitle(operation, journal),
    target: activityTarget(operation, journal),
    status: operation.status,
    reason,
    refLabel: operation.gitRef || journal?.gitRef || "—",
    profileLabel: operation.profile || journal?.profile || "—",
    startedLabel: formatFullTime(startedAt),
    endedLabel: endedAt ? formatFullTime(endedAt) : "running",
    whenLabel: formatRelativeTime(startedAt),
    duration: formatDuration(startedAt, endedAt),
    sortAt: startedAt || "",
    operationId: operation.operationId,
    actionOperationId: operation.result?.actionOperationId || "",
    eventId: journal?.eventId || "",
    repository: operation.repository || journal?.repository || "",
    operation,
    journal
  };
}

function activityFromJournal(event) {
  return {
    id: activityIdForJournal(event),
    sourceLabel: "Journal",
    title: journalTitle(event),
    target: journalTarget(event),
    status: event.status,
    reason: event.reason,
    refLabel: event.gitRef || "—",
    profileLabel: event.profile || "—",
    startedLabel: formatFullTime(event.startedAt),
    endedLabel: formatFullTime(event.endedAt),
    whenLabel: formatRelativeTime(event.startedAt),
    duration: formatDuration(event.startedAt, event.endedAt),
    sortAt: event.startedAt || "",
    operationId: "",
    actionOperationId: "",
    eventId: event.eventId,
    repository: event.repository || "",
    operation: null,
    journal: event
  };
}

function renderProjects() {
  if (!state.projects.length) return \`<div class="notice muted">No projects loaded.</div>\`;
  const policyProjects = new Map((state.environment?.policy?.projects || []).map((project) => [project.id, project]));
  return \`<div class="tableWrap"><table class="table">
    <thead><tr><th>Project</th><th>Repository</th><th>Refs</th><th>Profiles</th><th>Actions</th></tr></thead>
    <tbody>\${state.projects.map((project) => {
      const policy = policyProjects.get(project.id);
      return \`<tr>
        <td><strong>\${escapeHtml(project.name)}</strong><div class="muted mono">\${escapeHtml(project.id)}</div></td>
        <td class="mono">\${escapeHtml(project.repository)}</td>
        <td>\${escapeHtml((project.approvedRefs || []).join(", "))}</td>
        <td>\${escapeHtml((policy?.profiles || []).join(", ") || "—")}</td>
        <td>\${escapeHtml((policy?.actions || []).join(", ") || "—")}</td>
      </tr>\`;
    }).join("")}</tbody>
  </table></div>\`;
}

function renderEnvironmentNodes() {
  const nodes = state.environment?.nodes || [];
  if (!nodes.length) {
    return \`<div class="notice muted">No node inventory recorded for this environment.</div>\`;
  }
  return \`<div class="tableWrap"><table class="table">
    <thead><tr><th>Hostname</th><th>Role</th><th>Availability</th><th>Status</th><th>Labels</th></tr></thead>
    <tbody>\${nodes.map((node) => {
      const labels = Object.entries(node.labels || {}).map(([key, value]) => \`\${key}=\${value}\`);
      return \`<tr>
        <td><strong>\${escapeHtml(node.hostname)}</strong><div class="muted mono">\${escapeHtml(node.id)}</div></td>
        <td>\${pill(node.role, node.role === "manager" ? "ok" : "")}</td>
        <td>\${escapeHtml(node.availability)}</td>
        <td>\${escapeHtml(node.status)}</td>
        <td>\${labels.length ? labels.map((label) => pill(label)).join(" ") : "—"}</td>
      </tr>\`;
    }).join("")}</tbody>
  </table></div>\`;
}

function renderOperationStatus() {
  const operation = state.operation;
  if (!operation) {
    return \`<div class="notice muted">No operation running yet. Use Inspect to load components, then Run to execute the selected lifecycle action.</div>\`;
  }
  const kind = operation.status === "failed" ? "error" : operation.status === "succeeded" ? "ok" : "";
  const stdout = (operation.logs || []).filter((entry) => entry.level === "stdout").map((entry) => entry.message).join("\\n");
  const stderr = (operation.logs || []).filter((entry) => entry.level === "stderr").map((entry) => entry.message).join("\\n");
  return \`<div class="notice" \${kind ? \`data-kind="\${kind}"\` : ""}>
    <div style="display:flex;align-items:center;gap:10px;justify-content:space-between;">
      <strong>\${escapeHtml(operation.operationId || operation.title)}</strong>
      \${pill(operation.status, operation.status === "failed" ? "alert" : operation.status === "succeeded" ? "ok" : "warn")}
    </div>
    <div class="statusSteps">
      \${(operation.logs || operation.steps || []).map((entry) => \`<div class="statusStep" data-state="\${entry.level === "error" ? "failed" : operation.status === "running" ? "running" : "done"}"><span class="statusDot"></span><span><span class="muted mono">\${escapeHtml(entry.at || "")}</span> \${escapeHtml(entry.message || entry.label)}</span></div>\`).join("")}
    </div>
    \${operation.error ? \`<div class="muted">Error: \${escapeHtml(operation.error)}</div>\` : ""}
    \${stdout ? \`<div class="field" style="margin-top:10px;"><span class="fieldLabel">stdout</span><pre class="pre">\${escapeHtml(stdout)}</pre></div>\` : ""}
    \${stderr ? \`<div class="field" style="margin-top:10px;"><span class="fieldLabel">stderr</span><pre class="pre">\${escapeHtml(stderr)}</pre></div>\` : ""}
  </div>\`;
}

function renderOverview() {
  const current = state.environment;
  return \`<div class="grid">
    <div class="grid summaryGrid">
      <div class="card metric"><div class="metricLabel">Environment</div><div class="metricValue" style="font-size:18px">\${escapeHtml(current?.name || "—")}</div></div>
      <div class="card metric"><div class="metricLabel">Deployments</div><div class="metricValue">\${state.deployments.length}</div></div>
      <div class="card metric"><div class="metricLabel">Projects</div><div class="metricValue">\${state.projects.length}</div></div>
      <div class="card metric"><div class="metricLabel">Activity</div><div class="metricValue">\${activityItems().length}</div></div>
    </div>
    <section class="card"><div class="cardHeader"><h2 class="h2">Node inventory</h2><button class="button" id="refreshEnvironmentButton" type="button" \${state.environmentRefreshing || !state.token ? "disabled" : ""}>\${state.environmentRefreshing ? "Refreshing..." : "Refresh nodes"}</button></div><div class="cardBody">\${renderEnvironmentNodes()}</div></section>
    <section class="card"><div class="cardHeader"><h2 class="h2">Projects and policy</h2></div><div class="cardBody">\${renderProjects()}</div></section>
  </div>\`;
}

function renderActionForm() {
  const projectPolicy = currentPolicyProject();
  const projects = state.projects;
  const profiles = projectPolicy?.profiles || [];
  const actions = availableActionsForSelectedComponent(projectPolicy);
  const refs = selectedProjectRefs();
  const components = state.inspectedComponents;
  return \`<div class="grid">
  <div class="card">
    <div class="cardHeader"><h2 class="h2">Lifecycle action</h2><span class="muted2">current policy enforced</span></div>
    <div class="cardBody">
      <div class="formRow">
        <label class="field"><span class="fieldLabel">Project</span><select class="select" id="projectSelect">
          \${projects.map((project) => \`<option value="\${escapeHtml(project.id)}" \${project.id === state.selectedProject ? "selected" : ""}>\${escapeHtml(project.name)} · \${escapeHtml(project.id)}</option>\`).join("")}
        </select></label>
        <label class="field"><span class="fieldLabel">Git ref</span><select class="select mono" id="refSelect">
          \${refs.map((ref) => \`<option value="\${escapeHtml(ref)}" \${ref === state.selectedRef ? "selected" : ""}>\${escapeHtml(ref)}</option>\`).join("")}
        </select></label>
        <label class="field"><span class="fieldLabel">Component</span><select class="select mono" id="componentSelect" \${components.length ? "" : "disabled"}>
          \${components.length ? components.map((component) => \`<option value="\${escapeHtml(component.name)}" \${component.name === state.selectedComponent ? "selected" : ""}>\${escapeHtml(component.name)}</option>\`).join("") : \`<option value="">—</option>\`}
        </select></label>
        <label class="field"><span class="fieldLabel">Profile</span><select class="select" id="profileSelect">
          \${profiles.length ? profiles.map((profile) => \`<option value="\${escapeHtml(profile)}" \${profile === state.selectedProfile ? "selected" : ""}>\${escapeHtml(profile)}</option>\`).join("") : \`<option value="">—</option>\`}
        </select></label>
      </div>
      <div class="actionRow">
        <label class="field"><span class="fieldLabel">Action</span><select class="select" id="actionSelect">
          \${actions.map((action) => \`<option value="\${escapeHtml(action)}" \${action === state.selectedAction ? "selected" : ""}>\${escapeHtml(action)}</option>\`).join("")}
        </select></label>
        <button class="button" id="inspectButton" type="button" \${state.selectedRef ? "" : "disabled"}>Inspect</button>
        <button class="button" id="runButton" type="button" \${state.busy || !state.selectedComponent ? "disabled" : ""}>\${state.busy ? "Running..." : "Run"}</button>
      </div>
    </div>
  </div>
  <section class="card"><div class="cardHeader"><h2 class="h2">Operation status</h2><span class="muted2">current run</span></div><div class="cardBody">\${renderOperationStatus()}</div></section>
  </div>\`;
}

function pageTitle() {
  if (state.view === "home") return "Home";
  if (state.view === "deployments") return "Deployments";
  if (state.view === "actions") return "Lifecycle Actions";
  if (state.view === "activity") return "Activity";
  return "Overview";
}

function pageSubtitle() {
  if (state.view === "home") return "Deployment control plane for explicit Docker and Swarm project actions.";
  return state.environment ? state.environment.description || state.environment.name : "Connect with the REST bearer token.";
}

function renderHome() {
  return \`<section class="homeHero" aria-label="HiveForge home">
    <div class="homeHeroPanel">
      <img class="homeBrandLogo" src="/assets/hiveforge-logo.svg" alt="HiveForge">
      <div class="homeCopy">
        HiveForge runs on the target Docker or Swarm environment, registers approved project repositories,
        validates manifests and requirements, then runs explicit lifecycle actions through UI, REST, or MCP.
      </div>
      <div class="homeActions">
        <a class="button" href="https://github.com/sepa79/HiveForge" target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </div>
  </section>\`;
}

function renderCurrentView() {
  if (state.view === "home") {
    return renderHome();
  }
  if (state.view === "deployments") {
    return \`<section class="card"><div class="cardHeader"><h2 class="h2">Deployments</h2></div><div class="cardBody">\${renderDeployments()}</div></section>\`;
  }
  if (state.view === "actions") {
    return renderActionForm();
  }
  if (state.view === "activity") {
    return renderActivity();
  }
  return renderOverview();
}

function navItem(view, icon, label) {
  const active = state.view === view ? " navItemActive" : "";
  return \`<button class="navItem\${active}" type="button" data-view="\${view}"><span class="navIcon">\${icon}</span><span class="navLabel">\${label}</span></button>\`;
}

function render(options = {}) {
  const current = state.environment;
  const scrollPosition = options.preserveScroll ? { x: window.scrollX, y: window.scrollY } : null;
  app.innerHTML = \`<div class="appShell">
    <header class="topBar"><div class="topBarInner">
      <a class="logoLink" href="/ui" aria-label="HiveForge home">
        <img class="brandMark" src="/assets/hiveforge-mark.svg" alt="" aria-hidden="true">
        <span class="brandWordmark" aria-hidden="true"><span class="brandWordHive">Hive</span><span class="brandWordForge">Forge</span></span>
      </a>
      <div class="breadcrumb">\${current ? \`Environment / \${escapeHtml(current.name)}\` : "Environment / disconnected"}</div>
      <div class="topBarRight">
        <span class="muted mono">v\${escapeHtml(HIVEFORGE_INFO.version)}</span>
        \${state.token ? pill("API token set", "ok") : pill("API token missing", "alert")}
        <button class="button" id="updateHiveForgeButton" type="button" \${state.hiveforgeUpdating || !state.token ? "disabled" : ""}>\${state.hiveforgeUpdating ? "Updating HF..." : "Update HF"}</button>
        <button class="button" id="refreshButton" type="button">Refresh</button>
      </div>
    </div></header>
    <aside class="sideNav">
      <div style="width:100%">
        <div class="navHeader">Navigation</div>
        \${navItem("home", "H", "Home")}
        \${navItem("overview", "O", "Overview")}
        \${navItem("deployments", "D", "Deployments")}
        \${navItem("actions", "A", "Actions")}
        \${navItem("activity", "T", "Activity")}
      </div>
    </aside>
    <main class="appContent">
      <form class="toolsBar" id="tokenForm">
        <input class="fieldInput mono" id="tokenInput" type="password" autocomplete="current-password" value="\${escapeHtml(state.token)}" placeholder="Bearer token" aria-label="Bearer token">
        <button class="button" id="saveTokenButton" type="submit">Save token</button>
      </form>
      <div class="page \${state.view === "home" ? "pageHome" : ""}">
        \${state.view === "home" ? "" : \`<div class="pageHeader">
          <div><h1 class="h1">\${pageTitle()}</h1><div class="muted">\${escapeHtml(pageSubtitle())}</div></div>
        </div>\`}
        \${state.error ? \`<div class="notice" data-kind="error" style="margin-bottom:12px;">\${escapeHtml(state.error)}</div>\` : ""}
        \${state.message ? \`<div class="notice" data-kind="ok" style="margin-bottom:12px;">\${escapeHtml(state.message)}</div>\` : ""}
        \${renderCurrentView()}
      </div>
    </main>
  </div>\`;

  document.getElementById("refreshButton")?.addEventListener("click", refreshUi);
  document.getElementById("refreshEnvironmentButton")?.addEventListener("click", refreshEnvironmentInventory);
  document.getElementById("updateHiveForgeButton")?.addEventListener("click", updateHiveForge);
  document.querySelectorAll("[data-view]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      setView(event.currentTarget.getAttribute("data-view") || "overview");
    });
  });
  document.getElementById("tokenForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    setToken(document.getElementById("tokenInput").value);
  });
  document.getElementById("projectSelect")?.addEventListener("change", (event) => {
    state.selectedProject = event.target.value;
    const policy = currentPolicyProject();
    state.selectedProfile = policy?.profiles?.[0] || "";
    state.selectedRef = selectedProjectRefs()[0] || "";
    state.inspectedComponents = [];
    state.selectedComponent = "";
    const actions = availableActionsForSelectedComponent(policy);
    state.selectedAction = actions[0] || "deploy";
    render();
  });
  document.getElementById("refSelect")?.addEventListener("change", (event) => {
    state.selectedRef = event.target.value;
    state.inspectedComponents = [];
    state.selectedComponent = "";
    render();
  });
  document.getElementById("componentSelect")?.addEventListener("change", (event) => {
    state.selectedComponent = event.target.value;
    const actions = availableActionsForSelectedComponent();
    state.selectedAction = actions.includes(state.selectedAction) ? state.selectedAction : actions[0] || state.selectedAction;
    render();
  });
  document.getElementById("profileSelect")?.addEventListener("change", (event) => { state.selectedProfile = event.target.value; });
  document.getElementById("actionSelect")?.addEventListener("change", (event) => { state.selectedAction = event.target.value; });
  document.getElementById("inspectButton")?.addEventListener("click", inspectSelectedProject);
  document.getElementById("runButton")?.addEventListener("click", runLifecycleAction);
  document.querySelectorAll("[data-activity-id]").forEach((element) => {
    element.addEventListener("click", (event) => {
      state.selectedActivityId = event.currentTarget.getAttribute("data-activity-id") || "";
      render();
    });
  });
  document.querySelectorAll("[data-activity-page]").forEach((element) => {
    element.addEventListener("click", (event) => {
      selectActivityPage(event.currentTarget.getAttribute("data-activity-page") || "next");
      render();
    });
  });
  document.querySelectorAll("[data-deployment-filter]").forEach((element) => {
    element.addEventListener("click", (event) => {
      state.deploymentFilter = event.currentTarget.getAttribute("data-deployment-filter") || "active";
      if (!filteredDeployments().some((deployment) => deployment.deploymentId === state.selectedDeploymentId)) {
        state.selectedDeploymentId = defaultDeploymentId();
      }
      render({ preserveScroll: true });
      void loadSelectedDeploymentDiagnostics({ render: true });
    });
  });
  document.querySelectorAll("[data-deployment-id]").forEach((element) => {
    element.addEventListener("click", (event) => {
      state.selectedDeploymentId = event.currentTarget.getAttribute("data-deployment-id") || "";
      render({ preserveScroll: true });
      void loadSelectedDeploymentDiagnostics({ render: true });
    });
  });
  if (scrollPosition) {
    window.requestAnimationFrame(() => window.scrollTo(scrollPosition.x, scrollPosition.y));
  }
}

function componentNames(components) {
  return components.map((component) => component.name);
}

function operationKindLabel(kind) {
  return String(kind || "operation").replaceAll("_", " ");
}

function operationTarget(operation) {
  if (operation.projectId) {
    return operation.component ? \`\${operation.projectId}/\${operation.component}\` : operation.projectId;
  }
  return operation.repository || "—";
}

function defaultDeploymentId() {
  return filteredDeployments()[0]?.deploymentId || "";
}

function filteredDeployments() {
  return state.deployments.filter((deployment) => matchesDeploymentFilter(deployment));
}

function matchesDeploymentFilter(deployment) {
  const status = deploymentPrimaryStatus(deployment);
  if (state.deploymentFilter === "all") return true;
  if (state.deploymentFilter === "removed") return status.key === "removed";
  if (state.deploymentFilter === "failed") {
    return deployment.status === "failed" || ["unhealthy", "exited", "missing", "unknown", "unavailable"].includes(status.key);
  }
  return status.key !== "removed";
}

function deploymentPrimaryStatus(deployment) {
  if (deployment.status === "removed") {
    return {
      key: "removed",
      label: "Removed",
      kind: "warn",
      reason: "Removed by HiveForge. Hidden from the active filter."
    };
  }
  const runtime = state.deploymentRuntime[deployment.deploymentId];
  if (!runtime) {
    return {
      key: "checking",
      label: "Checking",
      kind: "warn",
      reason: "Checking Docker runtime status for this deployment label."
    };
  }
  if (runtime.unavailable) {
    return {
      key: "unavailable",
      label: "Unavailable",
      kind: "warn",
      reason: \`Runtime status request failed: \${runtime.reason || "unknown error"}\`
    };
  }
  const reason = runtimeStatusReason(runtime);
  if (runtime.summary === "running") return { key: "running", label: "Running", kind: "ok", reason };
  if (runtime.summary === "unhealthy") return { key: "unhealthy", label: "Unhealthy", kind: "alert", reason };
  if (runtime.summary === "exited") return { key: "exited", label: "Exited", kind: "alert", reason };
  if (runtime.summary === "missing") return { key: "missing", label: "Missing", kind: "alert", reason };
  return { key: "unknown", label: "Unknown", kind: "warn", reason };
}

function runtimeStatusReason(runtime) {
  if (runtime.reason) return runtime.reason;
  const services = runtime.services || [];
  const containers = runtime.containers || [];
  if (services.length) {
    const replicas = services.map((service) => service.replicas).filter(Boolean);
    const uniqueReplicas = Array.from(new Set(replicas));
    if (uniqueReplicas.length === 1) {
      return \`\${services.length} service(s), all replicas \${uniqueReplicas[0]}.\`;
    }
    if (uniqueReplicas.length > 1) {
      const shown = uniqueReplicas.slice(0, 4).join(", ");
      const suffix = uniqueReplicas.length > 4 ? ", ..." : "";
      return \`\${services.length} service(s), replica states \${shown}\${suffix}.\`;
    }
    return \`\${services.length} service(s) matched deployment labels.\`;
  }
  if (containers.length) {
    const running = containers.filter((container) => container.state === "running").length;
    return \`\${containers.length} container(s), \${running} running.\`;
  }
  return "No Docker containers or services matched this deployment label.";
}

function activityIdForOperation(operation) {
  return \`operation:\${operation.operationId}\`;
}

function activityIdForJournal(event) {
  return \`journal:\${event.eventId}\`;
}

function operationTitle(operation, journal) {
  if (operation.kind === "lifecycle_action" && operation.action && operation.component) {
    return \`\${humanLabel(operation.action)} \${operation.component}\`;
  }
  if (operation.kind === "project_inspection") return "Inspect project";
  if (operation.kind === "repository_inspection") return "Inspect repository";
  if (operation.kind === "project_registration") return "Register project";
  if (operation.kind === "project_ref_unregistration") return "Unregister project ref";
  return journal ? journalTitle(journal) : humanLabel(operation.kind || "operation");
}

function journalTitle(event) {
  if (event.operationType === "run_action") {
    return \`\${humanLabel(event.action || "run")} \${event.component || event.project}\`;
  }
  return operationTypeLabel(event.operationType);
}

function activityTarget(operation, journal) {
  if (operation.projectId) {
    return operation.component ? \`\${operation.projectId}/\${operation.component}\` : operation.projectId;
  }
  if (journal) return journalTarget(journal);
  return operation.repository || "—";
}

function journalTarget(event) {
  if (event.component) return \`\${event.project}/\${event.component}\`;
  return event.project || event.repository || "—";
}

function operationTypeLabel(operationType) {
  if (operationType === "checkout_project") return "Checkout project";
  if (operationType === "inspect_project") return "Inspect project";
  if (operationType === "validate_requirements") return "Validate requirements";
  if (operationType === "run_action") return "Run action";
  return humanLabel(operationType || "operation");
}

function humanLabel(value) {
  return String(value || "operation")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function lastOperationMessage(operation) {
  const logs = operation.logs || [];
  const entry = [...logs].reverse().find((item) => item.level === "error" || item.level === "info");
  return entry?.message || "";
}

function statusKind(status) {
  if (status === "succeeded") return "ok";
  if (status === "failed") return "alert";
  return "warn";
}

function formatRelativeTime(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return value || "—";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return \`\${seconds}s ago\`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return \`\${minutes}m ago\`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return \`\${hours}h ago\`;
  return \`\${Math.floor(hours / 24)}d ago\`;
}

function formatDuration(startedAt, endedAt) {
  const start = Date.parse(startedAt || "");
  if (!Number.isFinite(start)) return "—";
  const end = endedAt ? Date.parse(endedAt) : Date.now();
  if (!Number.isFinite(end)) return "—";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return \`\${seconds}s\`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds ? \`\${minutes}m \${remainingSeconds}s\` : \`\${minutes}m\`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? \`\${hours}h \${remainingMinutes}m\` : \`\${hours}h\`;
}

function formatFullTime(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return value || "—";
  return new Date(timestamp).toLocaleString();
}

function formatClockTime(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return value || "";
  return new Date(timestamp).toLocaleTimeString();
}

function availableActionsForSelectedComponent(policyProject = currentPolicyProject()) {
  const inspectedComponent = state.inspectedComponents.find((component) => component.name === state.selectedComponent);
  if (inspectedComponent) {
    return inspectedComponent.actions;
  }
  return policyProject?.actions || ACTIONS;
}

window.addEventListener("popstate", () => {
  setView(initialViewFromPath(), { updateUrl: false });
});

render();
refreshUi();
`;
}
