# Changelog

## 0.5.1 - 2026-06-12

- Seed generated `environments.yaml` with
  `capabilities.managedRoot.bindSourceRoot` from the standard Docker/Swarm
  install template so fresh installs expose `HIVEFORGE_BIND_SOURCE_DIR` without
  HomeLab-specific post-generation patching.
- Add install-template and Swarm runtime-root tests that fail when the standard
  install path no longer produces a host-visible managed root.
- Fix npm audit findings by updating `hono` and `vitest` patch versions.
- Add CI and publish-workflow artifacts for the MCP client tarball.
- Include `curl`, `jq`, `ping`, `mc`, and `nano` in the HiveForge runtime
  image for operator/debug use.

## 0.5.0 - 2026-06-11

- Add environment-owned external Docker bind source allowlists through
  `capabilities.bindSources.allowed` and reject HiveForge internal paths such as
  `/hf` even when misconfigured in the allowlist.
- Make inactive lifecycle actions (`remove` and `purge`) HiveForge-owned for
  Docker deployments: validate that the component declares the action, skip
  managed-file preparation, remove the recorded Compose project or Swarm stack,
  and wait for Docker resources to disappear.
- Add runtime task diagnostics for deployed Docker services so unhealthy
  deployments expose service task state in REST, MCP, and OpenAPI surfaces.
- Consolidate HiveForge installation templates to one Compose file that works
  with `docker compose up` and Portainer/Swarm stacks while preserving manager
  placement constraints.
- Add an operator UI `Update HF` action backed by GitHub Releases version
  checks and explicit self-update to the concrete released image tag, including
  a visible no-release state before the first GitHub Release is published.
- Document the 0.5 deploy flow updates for external bind sources and Docker
  removal semantics.

## 0.5.0-alpha.0 - 2026-06-10

- Breaking MCP change: rename `deploy_release` to `prepare_release_deploy`.
  The old tool name is not kept as an alias; clients that call it receive an
  unknown-tool failure.
- Require root project manifests to declare `version: "0.5"` and reject removed
  POC action path variables before running project actions.
- Allow managed components to declare per-component lifecycle action subsets
  instead of requiring every component to implement the full root action set.

## 0.4.8 - 2026-06-08

- Add MCP `refresh_environment` and `list_environment_nodes` tools so agents can
  explicitly refresh Swarm node inventory and list current nodes with labels
  without calling REST directly.
- Include failed command diagnostics for lifecycle actions, including exit
  status plus redacted stdout/stderr tails in operation logs.

## 0.4.7 - 2026-06-08

- Add explicit environment refresh through `POST /environments/refresh` so
  operators can re-run local Docker/Swarm autodetection after node labels or
  runtime facts change.
- Add an Overview `Refresh nodes` action that refreshes environment inventory
  and reloads the UI without relying on an implicit server restart.
- Preserve operator-owned managed-root settings, project policy, and deployment
  vars during refresh, and fail explicitly if autodetection reports a different
  current environment id.
- Make non-home page headers use the human environment name and remove duplicate
  raw id/kind labels such as `swarm` / `swarm`.
- Document the refresh API and runtime-container behavior for node inventory
  updates.

## 0.4.6 - 2026-06-08

- Auto-detect Docker Swarm manager environments when initializing a new
  HiveForge base directory and generate `environments.yaml` with Swarm runtime,
  placement capability, and node inventory.
- Expose environment node inventory through config, REST/OpenAPI, MCP docs, and
  the operator UI, including Docker node id, hostname, role, availability,
  status, and labels.
- Fail explicitly when Swarm is active but HiveForge is started on a worker
  without an explicit `environments.yaml`.
- Keep mount inventory, host path discovery, and host path templating out of
  the autodetection slice; projects remain responsible for explicit bind paths
  and placement labels.
- Log the selected HiveForge auth token source at startup and warn when a
  base-dir token file is ignored because `HIVEFORGE_AUTH_TOKEN` is set, without
  printing token values.

## 0.4.5 - 2026-05-27

- Add non-secret project runtime environment storage with REST and MCP tools for
  listing, setting, and unsetting profile-scoped values outside git.
- Pass resolved runtime environment into requirement validation and lifecycle
  actions so projects can keep deploy-time image tags and public config out of
  repository manifests.
- Add explicit host-visible HiveForge path handling for Swarm bind mounts,
  including `HIVEFORGE_PROJECT_HOST_DIR` for deployment actions.
- Improve Docker Compose and Swarm install templates with proxy environment
  passthrough and host root configuration for Swarm targets.
- Refresh the operator UI with the new HiveForge logo, home view, token flow,
  and layout fixes.

## 0.4.4 - 2026-05-26

- Add MCP/REST environment policy editing for explicitly allowing a registered
  project on a known environment.
- Add a first Swarm quickstart focused on external HiveWatch/HiveMind example
  repositories and MCP startup without a local checkout.
- Add a paste-ready Swarm/Portainer stack template with a named `/hf` volume and
  manager-node placement.

## 0.4.3 - 2026-05-26

- Add a public REST health endpoint at `/health`.
- Expose health checks through MCP so clients can verify the selected
  HiveForge target before running operations.
- Document MCP token usage for Docker Compose installs.
- Propose runtime config provisioning for `.env`-derived secrets and private
  config without plaintext values in model-visible MCP payloads.

## 0.4.2 - 2026-05-25

- Make Docker Compose installs use a single HiveForge base directory mounted at
  `/hf`.
- Let the server initialize missing `projects.yaml`, `environments.yaml`,
  `workspace/`, `journal/operations.jsonl`, and `data/` under the base dir.
- Generate a durable `auth-token` file on first start when
  `HIVEFORGE_AUTH_TOKEN` is not provided.
- Keep explicit runtime path mode available, but reject mixing it with
  `HIVEFORGE_BASE_DIR`.

## 0.1.1 - 2026-05-24

- Add CLI `--base-dir` mode for a single mounted HiveForge runtime directory.
- Auto-initialize an empty base dir with `projects.yaml`, `workspace/`,
  `journal/operations.jsonl`, and `data/`.
- Reject mixed runtime path modes when `--base-dir` is combined with explicit
  `--registry`, `--workspace`, `--journal`, or `--data-root`.
- Document the base-dir runtime contract and add CLI coverage.
