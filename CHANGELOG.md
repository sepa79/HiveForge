# Changelog

## 0.5.7 - 2026-08-20

- Preserve operator-owned `deployment` and `capabilities.bindSources.allowed`
  when `refresh_environment` rewrites `environments.yaml`, so a node refresh
  updates runtime inventory without stripping Portainer executor config or bind
  source allow-lists.

## 0.5.6 - 2026-08-17

- Refresh `@modelcontextprotocol/sdk`, `undici`, `vitest`, and vulnerable
  transitive packages so `npm audit` is clean again for both production and
  development dependencies.
- Expose the selected deployment executor kind in deployment inventory and
  publish non-secret environment executor metadata through REST/MCP while
  keeping Portainer API keys server-local.
- Make the failed-command diagnostics test deterministic on this runtime by
  capturing stderr/stdout from `/bin/sh` instead of relying on fragile
  `node -e` stdio timing during non-zero exits.
- Document the planned explicit Portainer deployment adapter so HiveForge can
  keep Portainer as the stack owner for deploy, remove, restart, and upgrade
  operations instead of bypassing it through direct Docker mutation.
- Tighten the Portainer adapter plan around fixed install mode, durable
  executor ownership, Portainer `stackId` persistence, and a shared
  pre-executor render-validation path.

## 0.5.5 - 2026-08-07

- Add a standalone Full Compose/Swarm install containing HiveForge, Forgejo,
  and a trusted-LAN gateway. It provides Git and OCI services through one fixed
  `hiveforge` identity, so normal `git push` and `docker push` need no client
  login. Forgejo uses node-local SQLite storage and is pinned to the explicitly
  configured manager that owns that data.
- Add read-only `GET /managed-repositories/info` and MCP
  `get_managed_repositories_info`. Full advertises only the shared Forgejo Git
  service, OCI registry, and fixed owner namespace—not a catalog of application
  repositories or image paths; the response includes the manual
  build/push/deploy workflow.
- Make the initial Full lab transport explicitly `insecure-http`. Every result
  identifies the exact Docker `insecure-registries` prerequisite as
  `manual-unverified`; HiveForge never modifies Docker daemon configuration,
  restarts Docker, claims node-wide pull readiness, or falls back to another
  transport.
- Allow explicit `https://...git` repositories from any HTTPS Git host, not
  only GitHub, while continuing to allow environment-reachable development
  `http://...git` repositories and reject arbitrary external HTTP repositories.
- Breaking registry/schema contract change: registered project source
  `github` is renamed to `https-git` to match the broader HTTPS Git contract.
  Existing project registry data must migrate those source values explicitly;
  HiveForge does not keep `github` as a silent compatibility alias.
- Make managed-repository discovery fail explicitly as `unavailable` when
  HiveForge cannot inspect its own Docker runtime or the sibling Full Forgejo
  service, instead of surfacing an internal server error.
- Ship the Full Compose template with explicit `.invalid` Forgejo placeholder
  host values and report managed-repository discovery as `incomplete` until
  the operator replaces them with a real Git/OCI host and port.
- Keep build actions, application-repository provisioning, Git upstream
  changes, image selection, and deploy mutation outside this release.

## 0.5.4 - 2026-08-07

- Complete the deployment debug-ability slice with canonical
  `diagnose_deployment` evidence: expected-versus-actual Docker/Swarm
  resources, placement mismatches, restart loops, last-exit hints, and
  bind-source failures correlate back to the recorded deployment and rendered
  Compose artifact. Docker query failures are explicit, redacted `unknown`
  evidence, never inferred healthy state.
- Validate `requires.placement.nodeLabels` against one active, ready Swarm node
  before deployment. A generic `placement: true` capability is no longer proof
  that a deployable node exists.
- Add explicit managed-root accessibility states and the manual
  `verify_managed_root_access` REST/MCP diagnostic. It is the only check that
  verifies host bind-mount visibility across the eligible Docker/Swarm nodes;
  it does not run automatically or block deploys.
- Make the Swarm managed-root probe use the running HiveForge image, wait for a
  bounded cold pull, and return `inconclusive` evidence when a task does not
  reach a terminal result in time. Temporary probe services are removed in all
  outcomes.
- Surface concrete prerequisite, runtime, diagnostics, managed-root, and
  recorded-Compose evidence in the Actions and Deployments operator views,
  while preserving redaction of secret values.
- Add focused contract and behavior coverage for missing placement labels,
  managed-root probe outcomes, runtime diagnostics, rendered-artifact evidence,
  and Swarm/bind-mount failures.

## 0.5.3 - 2026-06-25

- Add explicit project ref unregistration through REST and MCP so operators can
  remove old registered refs from development project registrations without
  deleting the project or changing environment policy.
- Document that project ref unregistration fails explicitly when the ref is the
  project's last registered ref; full project unregister remains a separate
  operation outside the current contract.
- Replace separate Operations and Journal operator views with a paginated
  Activity master-detail screen that explicitly correlates process-local
  operations with durable journal events.
- Make Deployments runtime-first: active filtering and deployment detail now
  prioritize Docker runtime evidence, diagnostics findings, and recorded compose
  artifacts before HiveForge's recorded state metadata.
- Fix Deployments layout and scroll behavior for large Swarm stacks with long
  service names, image references, task names, and frequent async runtime
  refreshes.
- Add copyable operator-console view URLs under `/ui`, including
  `/ui/deployments`, `/ui/actions`, and `/ui/activity`, while keeping REST API
  paths such as `/deployments` authenticated API endpoints.
- Replace free-text lifecycle Git ref and component inputs with registered-ref
  and inspected-component selectors so operators run actions against explicit
  project inventory.

## 0.5.2 - 2026-06-12

- Run declared Ansible actions in an isolated helper container where `/hf` is
  the current project's managed root and the checkout is mounted read-only at
  `/workspace`.
- Replace the project-facing rendered-compose env contract with the fixed
  action path `/hf/stacks/compose.yml`; `HIVEFORGE_BIND_SOURCE_DIR` remains only
  the host/node-visible root for rendered Docker bind source values.
- Derive helper-container mount sources from the configured runtime-root bind
  source so standard `/opt/hiveforge:/hf` Docker/Swarm installs mount
  `/opt/hiveforge/data/deployed/<project>` as the action `/hf`.
- Add `HIVEFORGE_ACTION_RUNNER_IMAGE` to the install template and fall back to
  Docker inspect of the current HiveForge container image when the override is
  absent.
- Update docs, diagnostics, fixtures, and tests for the `/hf` project-root
  action contract and the simplified `artifacts/runtime/...` managed artifact
  layout.

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
- Detect the actual host bind source for `/hf` from Docker inspect when a new
  `environments.yaml` is generated without
  `HIVEFORGE_MANAGED_ROOT_BIND_SOURCE_ROOT`, covering self-updates from older
  HiveForge services that do not yet carry the new environment variable.
- Create or update the GitHub Release for tag builds and upload the MCP client
  tarball as a release asset.
- Make HiveForge server-side outbound HTTP requests, including the `Update HF`
  GitHub Releases check, honor standard proxy environment variables inside the
  container and return an explicit proxy/network diagnostic instead of a bare
  `fetch failed`.

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
