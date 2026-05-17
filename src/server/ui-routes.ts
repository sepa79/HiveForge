import { writeText } from "./json-http.js";
import type { HttpRoute } from "./http-types.js";

export const uiPublicPaths = [/^\/$/, /^\/favicon\.svg$/, /^\/ui\/app\.js$/, /^\/ui\/styles\.css$/];

export function createUiRoutes(): HttpRoute[] {
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
      pattern: /^\/favicon\.svg$/,
      async handle({ response }) {
        writeText(response, 200, "image/svg+xml; charset=utf-8", renderFavicon());
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
        writeText(response, 200, "text/javascript; charset=utf-8", renderAppScript());
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

function renderFavicon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#05070b"/>
  <circle cx="32" cy="32" r="19" fill="none" stroke="#33e1ff" stroke-width="4"/>
  <path d="M22 43V21h5v8h10v-8h5v22h-5v-9H27v9z" fill="#ffc107"/>
</svg>`;
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
  z-index: 10;
}
.topBarInner { height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 12px; }
.logoLink { display: inline-flex; align-items: center; height: 44px; gap: 10px; color: inherit; text-decoration: none; }
.brandMark {
  width: 28px; height: 28px; display: grid; place-items: center;
  border-radius: 50%;
  border: 1px solid rgba(51, 225, 255, 0.45);
  color: var(--accent-strong);
  box-shadow: 0 0 20px rgba(51, 225, 255, 0.18) inset, 0 0 14px rgba(51, 225, 255, 0.18);
  font-weight: 900;
}
.brandWordmark { font-size: 22px; font-weight: 900; line-height: 1; letter-spacing: 0; white-space: nowrap; }
.brandWordHive { color: rgba(255, 255, 255, 0.95); }
.brandWordForge { color: #ffc107; }
.breadcrumb { color: var(--muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.topBarRight { margin-left: auto; display: flex; align-items: center; gap: 8px; }

.sideNav {
  grid-row: 2;
  border-right: 1px solid var(--border2);
  background: rgba(8, 10, 14, 0.88);
  backdrop-filter: blur(6px);
  padding: 12px 0;
}
.navHeader { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; padding: 0 18px 10px; }
.navItem {
  display: flex; align-items: center; gap: 10px; height: 40px; margin: 0 8px 6px; padding: 0 12px;
  width: calc(100% - 16px);
  border-radius: 8px; color: #0ff; border: 1px solid rgba(51, 225, 255, 0.28);
  background: radial-gradient(120% 120% at 10% 10%, rgba(51, 225, 255, 0.20), rgba(51, 225, 255, 0.06) 42%, rgba(255, 255, 255, 0.04) 70%, rgba(0, 0, 0, 0) 100%);
  box-shadow: 0 0 18px rgba(51, 225, 255, 0.12) inset;
  text-decoration: none;
  text-align: left;
}
.navItemActive { border-color: rgba(255, 193, 7, 0.45); box-shadow: 0 0 18px rgba(255, 193, 7, 0.12) inset; }
.navIcon { width: 18px; text-align: center; font-weight: 900; }
.navLabel { color: rgba(255, 255, 255, 0.9); font-weight: 700; }

.appContent { grid-row: 2; min-width: 0; min-height: 0; overflow: auto; }
.toolsBar {
  min-height: 48px; border-bottom: 1px solid var(--border2); background: rgba(255, 255, 255, 0.025);
  display: flex; align-items: center; gap: 8px; padding: 8px 14px; position: sticky; top: 0; z-index: 4;
}
.page { padding: 18px; max-width: 1420px; }
.pageHeader { display: flex; gap: 16px; align-items: flex-start; justify-content: space-between; margin-bottom: 14px; }
.h1 { margin: 0; font-size: 28px; line-height: 1.1; letter-spacing: 0; }
.h2 { margin: 0; font-size: 15px; font-weight: 900; letter-spacing: 0; }
.muted { color: var(--muted); }
.muted2 { color: var(--muted2); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

.grid { display: grid; gap: 12px; }
.summaryGrid { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 12px; }
.mainGrid { grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr); align-items: start; }
.card {
  border: 1px solid var(--border); background: var(--panel); border-radius: 8px; box-shadow: 0 16px 40px var(--shadow);
}
.cardHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border-bottom: 1px solid var(--border2); }
.cardBody { padding: 12px; }
.metric { padding: 12px; min-height: 84px; }
.metricLabel { color: var(--muted); font-size: 12px; }
.metricValue { font-size: 24px; font-weight: 900; margin-top: 6px; line-height: 1; }

.tableWrap { overflow: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--panel2); }
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
  min-height: 34px; border-radius: 8px; border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.055); color: var(--text);
}
.button {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 11px;
  font-weight: 800; text-decoration: none;
}
.button:hover { border-color: rgba(51, 225, 255, 0.45); }
.button:disabled { opacity: 0.52; cursor: not-allowed; }
.button[data-kind="danger"] { border-color: rgba(255, 117, 117, 0.36); color: #ffb4b4; }
.select, .fieldInput { padding: 0 9px; }
.field { display: grid; gap: 5px; min-width: 0; }
.fieldLabel { color: var(--muted); font-size: 12px; font-weight: 700; }
.formRow { display: grid; grid-template-columns: repeat(4, minmax(130px, 1fr)); gap: 10px; align-items: end; }
.notice { border: 1px solid var(--border); background: var(--panel2); border-radius: 8px; padding: 10px 12px; }
.notice[data-kind="error"] { border-color: rgba(255, 117, 117, 0.36); color: #ffb4b4; }
.notice[data-kind="ok"] { border-color: rgba(86, 211, 145, 0.35); color: #a3efc6; }
.statusSteps { display: grid; gap: 8px; margin: 12px 0; }
.statusStep { display: flex; align-items: center; gap: 8px; color: var(--muted); }
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

@media (max-width: 700px) {
  .appShell { grid-template-columns: 56px 1fr; }
  .brandWordmark, .breadcrumb, .navHeader, .navLabel { display: none; }
  .navItem { justify-content: center; padding: 0; }
  .summaryGrid, .mainGrid { grid-template-columns: 1fr; }
  .formRow { grid-template-columns: 1fr; }
}
`;
}

function renderAppScript(): string {
  return `const TOKEN_KEY = "HIVEFORGE_UI_TOKEN";
const ACTIONS = ["deploy", "update", "upgrade", "remove", "purge"];

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  environment: null,
  projects: [],
  deployments: [],
  journal: [],
  operations: [],
  selectedProject: "",
  selectedComponent: "",
  selectedProfile: "",
  selectedRef: "main",
  selectedAction: "deploy",
  view: "overview",
  busy: false,
  operation: null,
  operationPoll: null,
  message: null,
  error: null
};

const app = document.getElementById("app");

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

async function refreshAll() {
  if (!state.token) {
    render();
    return;
  }
  state.error = null;
  try {
    const [environments, projects, deployments, journal] = await Promise.all([
      api("/environments"),
      api("/projects"),
      api("/deployments"),
      api("/journal")
    ]);
    state.environment = environments.current;
    state.projects = projects.projects;
    state.deployments = deployments.deployments;
    state.journal = journal.events.slice().reverse();
    try {
      const operations = await api("/operations");
      state.operations = operations.operations;
    } catch {
      state.operations = [];
    }
    const policyProject = state.environment?.policy?.projects?.[0];
    state.selectedProject ||= policyProject?.id || state.projects[0]?.id || "";
    state.selectedProfile ||= policyProject?.profiles?.[0] || "";
    state.selectedAction = policyProject?.actions?.includes(state.selectedAction) ? state.selectedAction : policyProject?.actions?.[0] || "deploy";
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Request failed";
  }
  render();
}

function currentPolicyProject() {
  return state.environment?.policy?.projects?.find((project) => project.id === state.selectedProject) || null;
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
    state.selectedComponent = result.components[0] || state.selectedComponent;
    state.message = \`Inspection loaded \${result.components.length} component(s).\`;
    state.operation = {
      ...state.operation,
      status: "succeeded",
      title: \`Inspection completed: \${result.operationId}\`,
      steps: [{ label: \`Loaded \${result.components.length} component(s): \${result.components.join(", ") || "none"}\`, state: "done" }]
    };
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Inspection failed";
    state.operation = {
      ...state.operation,
      status: "failed",
      title: "Inspection failed",
      steps: [{ label: state.error, state: "failed" }]
    };
  }
  render();
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
  refreshAll();
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
  return \`<div class="tableWrap"><table class="table">
    <thead><tr><th>Project</th><th>Component</th><th>Profile</th><th>Status</th><th>Ref</th><th>Last action</th><th>Updated</th></tr></thead>
    <tbody>\${state.deployments.map((item) => \`<tr>
      <td><strong>\${escapeHtml(item.project)}</strong></td>
      <td>\${escapeHtml(item.component)}</td>
      <td>\${escapeHtml(item.profile || "—")}</td>
      <td>\${pill(item.status, item.status === "deployed" ? "ok" : "warn")}</td>
      <td class="mono">\${escapeHtml(item.gitRef)}</td>
      <td>\${escapeHtml(item.lastAction)}</td>
      <td class="muted">\${escapeHtml(item.updatedAt)}</td>
    </tr>\`).join("")}</tbody>
  </table></div>\`;
}

function renderJournal() {
  const events = state.journal.slice(0, state.view === "journal" ? 50 : 12);
  if (!events.length) return \`<div class="notice muted">No journal events.</div>\`;
  return \`<div class="tableWrap"><table class="table">
    <thead><tr><th>Type</th><th>Project</th><th>Action</th><th>Status</th><th>Reason</th></tr></thead>
    <tbody>\${events.map((event) => \`<tr>
      <td class="mono">\${escapeHtml(event.operationType)}</td>
      <td>\${escapeHtml(event.project)}</td>
      <td>\${escapeHtml(event.action || "—")}</td>
      <td>\${pill(event.status, event.status === "succeeded" ? "ok" : "alert")}</td>
      <td class="muted">\${escapeHtml(event.reason)}</td>
    </tr>\`).join("")}</tbody>
  </table></div>\`;
}

function renderOperationRows() {
  if (!state.operations.length) return \`<div class="notice muted">No operations recorded in this process.</div>\`;
  return \`<div class="tableWrap"><table class="table">
    <thead><tr><th>Operation</th><th>Project</th><th>Action</th><th>Status</th><th>Started</th></tr></thead>
    <tbody>\${state.operations.map((operation) => \`<tr>
      <td><button class="button mono" type="button" data-operation-id="\${escapeHtml(operation.operationId)}">\${escapeHtml(operation.operationId)}</button></td>
      <td>\${escapeHtml(operation.projectId)} / \${escapeHtml(operation.component)}</td>
      <td>\${escapeHtml(operation.action)}</td>
      <td>\${pill(operation.status, operation.status === "succeeded" ? "ok" : operation.status === "failed" ? "alert" : "warn")}</td>
      <td class="muted">\${escapeHtml(operation.startedAt)}</td>
    </tr>\`).join("")}</tbody>
  </table></div>\`;
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
        <td>\${escapeHtml((project.allowedRefs || []).join(", "))}</td>
        <td>\${escapeHtml((policy?.profiles || []).join(", ") || "—")}</td>
        <td>\${escapeHtml((policy?.actions || []).join(", ") || "—")}</td>
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
      <div class="card metric"><div class="metricLabel">Journal events</div><div class="metricValue">\${state.journal.length}</div></div>
    </div>
    <section class="card"><div class="cardHeader"><h2 class="h2">Projects and policy</h2></div><div class="cardBody">\${renderProjects()}</div></section>
  </div>\`;
}

function renderActionForm() {
  const projectPolicy = currentPolicyProject();
  const projects = state.projects;
  const profiles = projectPolicy?.profiles || [];
  const actions = projectPolicy?.actions || ACTIONS;
  return \`<div class="grid">
  <div class="card">
    <div class="cardHeader"><h2 class="h2">Lifecycle action</h2><span class="muted2">current policy enforced</span></div>
    <div class="cardBody">
      <div class="formRow">
        <label class="field"><span class="fieldLabel">Project</span><select class="select" id="projectSelect">
          \${projects.map((project) => \`<option value="\${escapeHtml(project.id)}" \${project.id === state.selectedProject ? "selected" : ""}>\${escapeHtml(project.name)} · \${escapeHtml(project.id)}</option>\`).join("")}
        </select></label>
        <label class="field"><span class="fieldLabel">Git ref</span><input class="fieldInput mono" id="refInput" value="\${escapeHtml(state.selectedRef)}"></label>
        <label class="field"><span class="fieldLabel">Component</span><input class="fieldInput mono" id="componentInput" value="\${escapeHtml(state.selectedComponent)}" placeholder="api"></label>
        <label class="field"><span class="fieldLabel">Profile</span><select class="select" id="profileSelect">
          \${profiles.length ? profiles.map((profile) => \`<option value="\${escapeHtml(profile)}" \${profile === state.selectedProfile ? "selected" : ""}>\${escapeHtml(profile)}</option>\`).join("") : \`<option value="">—</option>\`}
        </select></label>
      </div>
      <div class="formRow" style="grid-template-columns: minmax(160px, 220px) auto auto 1fr; margin-top: 10px;">
        <label class="field"><span class="fieldLabel">Action</span><select class="select" id="actionSelect">
          \${actions.map((action) => \`<option value="\${escapeHtml(action)}" \${action === state.selectedAction ? "selected" : ""}>\${escapeHtml(action)}</option>\`).join("")}
        </select></label>
        <button class="button" id="inspectButton" type="button">Inspect</button>
        <button class="button" id="runButton" type="button" \${state.busy ? "disabled" : ""}>\${state.busy ? "Running..." : "Run"}</button>
      </div>
    </div>
  </div>
  <section class="card"><div class="cardHeader"><h2 class="h2">Operation status</h2></div><div class="cardBody">\${renderOperationStatus()}</div></section>
  <section class="card"><div class="cardHeader"><h2 class="h2">Operation history</h2></div><div class="cardBody">\${renderOperationRows()}</div></section>
  </div>\`;
}

function pageTitle() {
  if (state.view === "deployments") return "Deployments";
  if (state.view === "actions") return "Lifecycle Actions";
  if (state.view === "journal") return "Journal";
  return "Overview";
}

function renderCurrentView() {
  if (state.view === "deployments") {
    return \`<section class="card"><div class="cardHeader"><h2 class="h2">Deployments</h2></div><div class="cardBody">\${renderDeployments()}</div></section>\`;
  }
  if (state.view === "actions") {
    return renderActionForm();
  }
  if (state.view === "journal") {
    return \`<div class="grid"><section class="card"><div class="cardHeader"><h2 class="h2">Operation logs</h2></div><div class="cardBody">\${renderOperationRows()}\${state.operation ? \`<div style="margin-top:12px;">\${renderOperationStatus()}</div>\` : ""}</div></section><section class="card"><div class="cardHeader"><h2 class="h2">Journal</h2></div><div class="cardBody">\${renderJournal()}</div></section></div>\`;
  }
  return renderOverview();
}

function navItem(view, icon, label) {
  const active = state.view === view ? " navItemActive" : "";
  return \`<button class="navItem\${active}" type="button" data-view="\${view}"><span class="navIcon">\${icon}</span><span class="navLabel">\${label}</span></button>\`;
}

function render() {
  const current = state.environment;
  app.innerHTML = \`<div class="appShell">
    <header class="topBar"><div class="topBarInner">
      <a class="logoLink" href="/" aria-label="HiveForge home">
        <span class="brandMark">H</span>
        <span class="brandWordmark"><span class="brandWordHive">Hive</span><span class="brandWordForge">Forge</span></span>
      </a>
      <div class="breadcrumb">\${current ? \`Environment / \${escapeHtml(current.name)}\` : "Environment / disconnected"}</div>
      <div class="topBarRight">
        \${state.token ? pill("API token set", "ok") : pill("API token missing", "alert")}
        <button class="button" id="refreshButton" type="button">Refresh</button>
      </div>
    </div></header>
    <aside class="sideNav">
      <div style="width:100%">
        <div class="navHeader">Navigation</div>
        \${navItem("overview", "O", "Overview")}
        \${navItem("deployments", "D", "Deployments")}
        \${navItem("actions", "A", "Actions")}
        \${navItem("journal", "J", "Journal")}
      </div>
    </aside>
    <main class="appContent">
      <form class="toolsBar" id="tokenForm">
        <input class="fieldInput mono" id="tokenInput" type="password" autocomplete="current-password" value="\${escapeHtml(state.token)}" placeholder="Bearer token" aria-label="Bearer token">
        <button class="button" id="saveTokenButton" type="submit">Save token</button>
      </form>
      <div class="page">
        <div class="pageHeader">
          <div><h1 class="h1">\${pageTitle()}</h1><div class="muted">\${current ? escapeHtml(current.kind) : "Connect with the REST bearer token."}</div></div>
          <div class="muted mono">\${current ? escapeHtml(current.id) : ""}</div>
        </div>
        \${state.error ? \`<div class="notice" data-kind="error" style="margin-bottom:12px;">\${escapeHtml(state.error)}</div>\` : ""}
        \${state.message ? \`<div class="notice" data-kind="ok" style="margin-bottom:12px;">\${escapeHtml(state.message)}</div>\` : ""}
        \${renderCurrentView()}
      </div>
    </main>
  </div>\`;

  document.getElementById("refreshButton")?.addEventListener("click", refreshAll);
  document.querySelectorAll("[data-view]").forEach((element) => {
    element.addEventListener("click", (event) => {
      state.view = event.currentTarget.getAttribute("data-view") || "overview";
      render();
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
    state.selectedAction = policy?.actions?.[0] || "deploy";
    render();
  });
  document.getElementById("refInput")?.addEventListener("change", (event) => { state.selectedRef = event.target.value.trim(); });
  document.getElementById("componentInput")?.addEventListener("change", (event) => { state.selectedComponent = event.target.value.trim(); });
  document.getElementById("profileSelect")?.addEventListener("change", (event) => { state.selectedProfile = event.target.value; });
  document.getElementById("actionSelect")?.addEventListener("change", (event) => { state.selectedAction = event.target.value; });
  document.getElementById("inspectButton")?.addEventListener("click", inspectSelectedProject);
  document.getElementById("runButton")?.addEventListener("click", runLifecycleAction);
  document.querySelectorAll("[data-operation-id]").forEach((element) => {
    element.addEventListener("click", async (event) => {
      const operationId = event.currentTarget.getAttribute("data-operation-id");
      if (!operationId) return;
      state.operation = await api(\`/operations/\${encodeURIComponent(operationId)}\`);
      render();
    });
  });
}

render();
refreshAll();
`;
}
