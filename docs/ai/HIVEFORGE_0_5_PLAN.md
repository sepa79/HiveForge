# HiveForge 0.5.x Plan

## Status

Planning note for the next breaking MCP/operator-readiness slice.

This is not an implementation contract. Before implementation, promote the
accepted tool shapes into `docs/specs/mcp/tools.md`, REST transport changes into
`docs/specs/api/openapi.yaml`, and any workspace retention behavior into the
relevant runtime/workspace spec.

The action path notes in this planning file predate the 0.5.2 isolated action
root contract. Current project actions use `/hf` as the project managed root,
write rendered Compose to `/hf/stacks/compose.yml`, and use
`HIVEFORGE_BIND_SOURCE_DIR` only for Docker bind source values.

## Release Split

### 0.5.0 MVP

- UI shows failed inspect/register/pre-deploy attempts as visible history instead
  of losing them before a deployment row exists.
- Minimal project/operator UI view shows projects, deployments, operation
  history, runtime diagnostics, and compose/artifact links for deployments.
- Docker runtime diagnostics cover service/container status, Swarm task state,
  basic restart/error reason, and exact bind-source validation errors.
- Workspace visibility covers checkout/workspace listing and manual cleanup for
  stale checkouts.
- Update-in-place verification proves HiveForge redeploy keeps `projects.yaml`,
  `environments.yaml`, SQLite state, journal, and runtime env data.
- Consumer compatibility gates fail fast and visibly when a repository misses
  `version: "0.5"`.
- HomeLab smoke covers HiveForge install/reset/wait diagnostics through Ansible
  and one compatible consumer smoke, initially HiveWatch after a compatible ref
  is published.

### 0.5.1

- Introduce explicit deployment trust modes:
  - `restricted`: project actions prepare/render files and HiveForge performs
    Docker deploy/remove/purge. This is the default direction for HiveMind,
    HiveWatch, and PocketHive release-driven deployments.
  - `trusted`: project-owned Ansible actions may use Docker directly and own
    deploy/update/remove/purge behavior. This preserves SkippyBot-style
    component-targeted Compose actions without pretending Docker access is
    sandboxed.
- Execute restricted release deploy/upgrade after `prepare_release_deploy`; no
  build fallback and no repo/ref action fallback.
- Add explicit trusted-mode warnings in UI/API/MCP. Trusted mode is operator
  code with Docker access, not a security boundary.
- Introduce explicit access roles:
  - `admin`: may register projects/refs, edit environment policy, approve
    trusted mode, approve risky mounts such as `/var/run/docker.sock`, manage
    runtime configuration, and run deployments.
  - `operator`: may inspect, deploy/update/remove/upgrade/purge only already
    registered and policy-allowed projects/profiles/actions, and read operation
    diagnostics.
- Pass `HIVEFORGE_DEPLOYMENT_ID` to trusted actions and require/validate the
  simple `hiveforge.deployment=<deploymentId>` label when a project declares
  Docker effects. Store project/component/profile/action/trust metadata in
  HiveForge state, not as duplicated Docker labels.
- Add UI for deploy prerequisites: manual prerequisites, missing labels,
  secrets, mounts, release vars, image refs, trust mode, Docker socket exposure,
  and operator approvals for risky mounts such as `/var/run/docker.sock`.
- Improve compose/artifact UI with redaction, download/copy, and
  operation-linked artifact history.

### 0.5.2

- Expand Docker diagnostics with expected-vs-actual resources, per-node mount
  visibility, task placement mismatch, restart loops, and last exit/log hints.
- Add a one-page deployment diagnostics report with project/component/profile
  filters.

### 0.5.3

- Harden restricted action runner execution with per-operation runner
  containers, narrow mounts, no Docker socket for restricted project Ansible,
  and explicit allowed tools.
- Document trusted runner execution separately: trusted actions may receive
  Docker access by design, must be visibly approved, and are not a sandbox.

### 0.5.4

- Add HomeLab E2E suite with scripted MCP tests, a tiny YAML runner or Cucumber
  if needed, HiveWatch -> HiveMind -> PocketHive scenarios, and artifact/log
  collection.
- Add a CI/lab bridge for branch images where practical.

### Later 0.5.x

- Advanced workspace retention policies.
- Better project cleanup UX.
- More UI polish around deployment comparison and history.
- Multi-environment target UX improvements.
- Broader consumer repository migration tooling.

## Goals

- Make MCP tool names match actual behavior.
- Give new agents a simple, explicit answer to "what must be done before
  deploy?"
- Give operators a simple, explicit answer to "are the deployed containers
  running?"
- Let operators inspect the exact rendered Compose/Stack artifact used for a
  deployment.
- Give operators diagnostics for HiveForge's own runtime paths and managed-root
  accessibility across Docker/Swarm nodes.
- Support both restricted and trusted deployment modes without hiding the
  security tradeoff.
- Run restricted project deployment actions outside the HiveForge control-plane
  container, with a smaller, explicit filesystem and Docker privilege boundary.
- Preserve trusted project-owned actions for consumers that need flexible
  component-level Docker behavior.
- Separate administrative approval from day-to-day deployment so an AI/operator
  can deploy an already-approved project without direct environment access and
  without permission to onboard new repositories or widen policy.
- Give operators a project-centered UI view for deployments, artifacts,
  prerequisites, labels, runtime status, and workspace cleanup.
- Preserve HiveForge operator data across HiveForge container redeploys and
  image upgrades.
- Keep PocketHive release deployment release-driven, with no build fallback.
- Make checkout workspace retention visible and operator-controlled.

## Non-Goals

- Do not add silent compatibility aliases.
- Do not make prerequisites tooling create Docker labels, secrets, mounts, or
  runtime config automatically.
- Do not infer deployment ownership from Docker Compose service names,
  container names, or image names.
- Do not force every consumer into HiveForge-owned Docker execution. Trusted
  project-owned actions remain a first-class mode.
- Do not present trusted mode as sandboxed. Docker socket access in trusted mode
  is full Docker-host control.
- Do not let an operator-role token register repositories, widen environment
  policy, enable trusted mode, or approve risky mounts.
- Do not return unredacted rendered files that may contain secret values.
- Do not reset, regenerate, or overwrite existing HiveForge runtime files during
  update-in-place.
- Do not treat configured `managedRoot.shared: true` as proven unless HiveForge
  can verify or clearly report the basis for that claim.
- Do not run restricted project-owned Ansible/playbook code in the HiveForge
  control-plane container once the isolated runner contract exists.
- Do not mount the full HiveForge runtime root, auth token, registry,
  environment config, journal, or runtime-env store into project action runners.
- Do not make the UI implement separate deploy, readiness, diagnostics, artifact,
  or cleanup logic outside the REST/application services.
- Do not expose secret values through MCP, REST, logs, UI, or journal entries.
- Do not infer image tags from branches, git refs, local images, or `latest`.

## 1. Breaking MCP Rename

Status: implemented on branch `feat/0.5-isolated-action-runner`; the internal
REST release path remains unchanged as transport.

Replace the misleading MCP tool name:

```text
deploy_release -> prepare_release_deploy
```

The new name must describe current behavior: validate inputs, prepare managed
files when checkout-backed, render release artifacts, validate required files,
and return a release deployment plan.

Required changes:

- Rename the MCP tool.
- Rename user-facing docs and prompts.
- Update MCP runtime/client tests that assert tool names.
- Update the internal REST summary/description if it still says deploy when the
  endpoint only prepares.
- Add a changelog entry that calls this a breaking MCP contract change.

Compatibility rule:

- Do not keep `deploy_release` as a hidden alias.
- If an old client calls `deploy_release`, it should fail as an unknown tool.

Open naming decision:

- Keep the internal REST path as-is for transport stability, or rename the REST
  path in the same breaking slice. If REST changes, update OpenAPI and tests in
  the same change.

## 2. Deploy Prerequisites Tool

Status: first slice implemented on branch `feat/0.5-isolated-action-runner`.
It reports registration/ref, manifest, component/action, environment policy,
profile eligibility, Docker volume/secret, runtime env, and basic release input
presence. Rendered artifact, bind mount, and `requiredFiles` evidence remains
future work.

Add a read-only MCP tool:

```text
explain_deploy_prerequisites
```

Purpose: return a structured checklist of manual and HiveForge-managed
prerequisites before an agent attempts `start_action` or
`prepare_release_deploy`.

Expected inputs:

```json
{
  "projectId": "pockethive",
  "gitRef": "v1.2.3",
  "component": "stack",
  "action": "deploy",
  "profile": "swarm-reduced"
}
```

Expected output shape:

```json
{
  "ready": false,
  "manualPrerequisites": [
    {
      "type": "node_label",
      "required": "pockethive.postgres=true",
      "status": "missing",
      "reason": "Selected profile requires placement on a labeled Swarm node"
    }
  ],
  "hiveforgePrerequisites": [
    {
      "type": "environment_policy",
      "status": "missing",
      "reason": "Environment policy must explicitly allow project/action/profile"
    }
  ],
  "releasePrerequisites": [
    {
      "type": "release_var",
      "required": "release.imageTag",
      "status": "missing"
    }
  ]
}
```

The tool should report at least:

- active HiveForge target/environment facts,
- project registration and approved ref status,
- environment policy status for project/action/profile,
- profile eligibility against environment capabilities,
- Swarm node labels needed by placement requirements,
- declared Docker secrets by name only,
- declared volumes/bind paths/mount requirements,
- non-secret runtime env requirements and whether HiveForge has values,
- release vars such as `release.imageTag`,
- registry vars such as `imageRepository.project`,
- rendered application image requirements,
- checkout-backed `artifacts.managedPaths` and `requiredFiles` status.

Behavior rules:

- Read-only only.
- No secret values.
- No automatic label/secret/mount creation.
- Missing data is an explicit checklist item, not a guessed default.
- Use `refresh_environment` before this tool when Swarm labels may have changed.

## 3. Runtime Container Status

Status: initial MCP/REST implementation exists as
`check_deployment_runtime_status`, backed by explicit Docker label lookup.
Follow-up work remains for task-level Swarm details, restart/exit diagnostics,
expected-resource comparison, and UI presentation.

Current `check_health` and `/health` only report the HiveForge process health.
They do not prove that project containers are running. `list_deployments` is
SQLite current-state inventory, not live Docker runtime state.

Add an authenticated REST endpoint and MCP tool for live runtime status.

MCP tool:

```text
check_deployment_runtime_status
```

REST endpoint:

```text
POST /deployments/runtime-status
```

Expected inputs:

```json
{
  "deploymentId": "deployment-..."
}
```

Expected output shape:

```json
{
  "deploymentId": "deployment-...",
  "projectId": "pockethive",
  "component": "stack",
  "profile": "swarm-reduced",
  "summary": "running",
  "requiredLabels": {
    "hiveforge.deployment": "deployment-..."
  },
  "containers": [
    {
      "id": "abc123",
      "name": "pockethive_orchestrator.1.x",
      "image": "registry.lan:5000/pockethive/orchestrator:dev-1",
      "state": "running",
      "health": "healthy",
      "labels": {
        "hiveforge.deployment": "deployment-..."
      },
      "mounts": []
    }
  ],
  "services": []
}
```

The tool should report at least:

- live Docker container state,
- Docker healthcheck state when the image/container defines one,
- image reference actually running,
- Swarm node for Swarm tasks when available,
- restart count or recent exit reason when available,
- Docker task/container errors, including bind mount failures such as missing
  source paths,
- missing expected runtime resources when HiveForge knows the expected release
  artifact/resource list,
- unknown ownership when resources are not labeled with HiveForge deployment
  metadata.

Ownership and selection rules:

- Use one explicit HiveForge-managed Docker label on rendered Compose/Stack
  resources: `hiveforge.deployment=<deploymentId>`.
- Store project, component, profile, environment, operation, and artifact mapping
  in HiveForge SQLite state instead of duplicating them as Docker labels.
- Do not guess ownership from Compose project names, container names, or image
  repository strings.
- If a legacy deployment has no HiveForge labels, return `unknown`/`untracked`
  instead of pretending the deployment is healthy.
- Do not return environment variables, command arguments that may contain
  secrets, or full container inspect payloads.
- Preserve Docker's mount error text when redaction rules allow it, because
  messages such as `bind source path does not exist` are actionable evidence.

Implementation notes:

- Docker single-host and Docker Swarm need separate adapters behind one typed
  contract.
- Swarm status should include services/tasks when that is the reliable source,
  and containers when container-level health is available.
- This is separate from `check_health`; the public unauthenticated `/health`
  should remain process-only.
- Add UI visibility after the MCP/REST contract exists.

## 4. Rendered Deployment Artifact Preview

Status: initial compose-specific MCP/REST implementation exists as
`get_deployment_compose`, backed by `run_action` journal artifacts recorded from
`HIVEFORGE_RENDERED_COMPOSE_FILE`. Follow-up work remains for parsed bind-source
metadata, additional artifact types, immutable artifact storage decisions, and
UI presentation.

Operators need to see the deployment artifact HiveForge actually used, especially
the rendered Compose/Stack file for PocketHive-style release deployment.

Add an authenticated REST endpoint and MCP tool for rendered artifact evidence.

MCP tool:

```text
get_deployment_compose
```

REST endpoint:

```text
GET /deployments/{operationId}/compose
```

Expected inputs:

```json
{
  "operationId": "uiop-123"
}
```

Expected output shape:

```json
{
  "operationId": "uiop-123",
  "status": "present",
  "source": "operation_artifact",
  "artifact": {
    "name": "compose",
    "mediaType": "application/yaml",
    "sha256": "9f...",
    "currentSha256": "9f...",
    "digestMatchesJournal": true
  },
  "redacted": true,
  "content": "services:\n  orchestrator:\n    image: registry.lan:5000/pockethive/orchestrator:dev-1\n"
}
```

Required behavior:

- Store or reference the rendered artifact used by the operation before
  execution, along with a content digest.
- Return the exact operation artifact, not a newly rendered file that may differ
  after config changes.
- Redact secret values before returning content through MCP/REST/UI.
- Include artifact path and digest in the journal or operation evidence, without
  storing secret values in the journal.
- Support at least rendered Compose/Stack YAML and release vars evidence for the
  PocketHive path.
- Extract and expose non-secret bind mount sources/targets from the rendered
  Compose/Stack artifact so operators can see which host paths Docker was asked
  to mount.

Open design decisions:

- Whether artifact content is stored as immutable operation evidence or read
  from the managed project directory with a verified digest.
- Whether large artifacts should return a preview plus download/export path
  instead of full content in MCP.
- How to mark fields that were redacted so agents do not treat the preview as a
  byte-for-byte deploy file.
- Whether parsed artifact metadata such as bind sources lives beside the raw
  artifact evidence or in a separate normalized artifact index.

Behavior rules:

- No best-effort reconstruction from current manifests.
- No fallback to source templates when rendered artifacts are missing.
- Do not hide host bind source paths from diagnostics; they are deployment
  topology evidence, not secret values, unless explicitly marked sensitive by a
  future contract.
- No unredacted secret material in MCP, REST responses, UI, logs, or journal.

## 5. HiveForge Runtime Diagnostics

Operators need a direct answer to "where is HiveForge storing data?" and "can
the target runtime nodes actually see the managed root that deploy actions will
bind into containers?"

Add an authenticated REST endpoint and MCP tool for HiveForge self-diagnostics.

Candidate MCP tool:

```text
diagnose_hiveforge_runtime
```

Candidate REST endpoint:

```text
GET /diagnostics/runtime
```

Expected output shape:

```json
{
  "hiveforge": {
    "version": "0.5.0",
    "runtimeRoot": "/hf",
    "registryPath": "/hf/projects.yaml",
    "environmentsPath": "/hf/environments.yaml",
    "workspaceDir": "/hf/workspace",
    "journalDir": "/hf/journal",
    "dataRoot": "/hf/data",
    "authTokenSource": "file"
  },
  "paths": [
    {
      "name": "dataRoot",
      "path": "/hf/data",
      "status": "ok",
      "checks": ["exists", "directory", "readable", "writable"]
    }
  ],
  "managedRoot": {
    "controlPlanePath": "/hf/data",
    "bindSourceRoot": "/mnt/shared_nfs/hiveforge",
    "declaredShared": true,
    "verifiedShared": false,
    "status": "unknown",
    "reason": "No cross-node write/read probe has been run"
  }
}
```

The tool should report at least:

- resolved runtime paths: runtime root, registry, environments, workspace,
  journal, data root, runtime env file,
- which auth token source is active, without token values,
- whether each path exists, is a directory or file as expected, and is readable
  and writable by the HiveForge process,
- filesystem owner/mode when useful for diagnosing write failures,
- configured environment id/kind and managedRoot capability,
- node inventory age/source when available,
- whether `managedRoot.bindSourceRoot` is configured when actions need
  host-visible bind sources,
- warnings when an upgrade appears to have started against an empty or different
  runtime root.

Managed-root accessibility checks:

- For single Docker, verify that the configured `managedRoot.bindSourceRoot` can be
  mounted or is otherwise usable by the local Docker engine before reporting it
  usable.
- For Swarm with `managedRoot.shared: true`, verify access from every eligible
  node before reporting `verifiedShared: true`.
- For Swarm with `managedRoot.shared: false`, verify or report only the listed
  `managedRoot.nodes`.
- If HiveForge cannot execute a cross-node probe, return `unknown` with the
  reason and the configured assumption; do not report `ok`.
- Validate bind source paths from rendered Compose/Stack artifacts against the
  nodes where Docker may schedule the workload. A path that exists only on the
  HiveForge manager is not valid for unconstrained Swarm services.

Probe design rules:

- Use explicit temporary probe files/directories under the HiveForge-managed
  data root and clean them up.
- Prefer a minimal Docker/Swarm task that reads/writes the probe path from each
  target node when verifying node accessibility.
- Do not require SSH.
- Do not create project deployment files or mutate project state.
- Do not print secret values or full environment dumps.
- Record enough diagnostic evidence to make operator mistakes obvious, for
  example wrong host path, missing mount on worker nodes, permission denied, or
  Docker socket unavailable.
- For Swarm, include the node name/id for every failed mount probe and the
  exact host path that failed.

Acceptance:

- Diagnostics distinguish configured, assumed, verified, failed, and unknown
  managed-root states.
- Diagnostics can explain a concrete bind mount failure such as
  `/opt/hiveforge/...` existing on the HiveForge node but missing from the
  node where a PocketHive task was scheduled.
- `explain_deploy_prerequisites` can reference these diagnostics when a profile
  requires shared or node-local managed root access.
- Install docs tell operators to run this diagnostic after first install and
  after changing Swarm nodes, labels, or storage mounts.

## 6. HiveForge Update-In-Place Data Retention

Redeploying or upgrading HiveForge itself must preserve existing operator data.
This covers `docker compose up -d` with a newer image, Swarm stack redeploys,
Portainer stack updates, and replacing the HiveForge container while keeping the
same configured runtime root and host bind source.

Data that must be retained:

- `auth-token` unless the operator explicitly changes auth configuration,
- `projects.yaml`,
- `environments.yaml`, including operator-owned policy, vars, and managed-root
  settings,
- `journal/operations.jsonl`,
- `data/runtime-env.json`,
- `data/hiveforge.sqlite`,
- `data/deployed/<projectId>/` managed deployment files,
- workspace directories unless a separate explicit cleanup action removes them.

Required behavior:

- Runtime initialization may create missing files/directories, but must not
  overwrite existing files.
- The Compose and Stack install templates must keep stable host mounts for the
  HiveForge runtime root and its configured `managedRoot.bindSourceRoot`.
- Startup should report the selected paths and token source without printing
  token values.
- If a configured mount/path changes during upgrade, HiveForge should fail or
  warn explicitly instead of starting with an empty accidental data root.
- MCP/REST/UI should continue to show pre-existing projects, policies, runtime
  env metadata, deployments, and journal events after redeploy.

0.5.x should add a documented update-in-place verification flow:

```text
capture: check_health, list_projects, list_environments, list_deployments,
         list_project_runtime_env, read_journal
redeploy HiveForge with a newer image using the same runtime root
verify:  check_health, list_projects, list_environments, list_deployments,
         list_project_runtime_env, read_journal
compare: no data loss except process-local operations from list_operations
```

Acceptance:

- Automated or scripted smoke coverage proves HiveForge data survives a
  container recreate with the same mounted runtime root.
- The test explicitly proves `list_operations` is process-local and may reset,
  while the journal and deployment inventory remain durable.
- Install docs state that editing the host side of the `/hf` bind mount changes
  where HiveForge persisted state lives. The container-side runtime root is
  fixed at `/hf`; explicit runtime path variables are maintainer/packaging
  escape hatches, not the normal install contract.

## 7. Admin And Operator Access Roles

Status: planned direction after 0.5.0. Current HiveForge uses one bearer token
for authenticated API/MCP calls. That is enough for the POC, but it does not
separate administrative environment changes from normal deployment work.

The target workflow is:

```text
admin approves project/ref/profile/trust mode once
operator or AI agent deploys and tests approved project through MCP
operator does not need direct SSH/Docker/Portainer access to the environment
```

Roles:

- `admin`: can inspect and register repositories, add or remove registered
  project refs, edit environment policy, allow actions/profiles/trust modes,
  approve risky mounts such as `/var/run/docker.sock`, manage non-secret
  runtime configuration, update HiveForge, and run deployments.
- `operator`: can inspect current state, run lifecycle actions for
  already-registered and policy-allowed project/profile/action/trustMode
  combinations, read operation logs, read diagnostics, and view rendered
  artifacts with redaction.

Authorization rules:

- Repository inspection remains read-only and may be available to both roles,
  but registration is admin-only.
- Environment policy editing is admin-only.
- Enabling `trusted` mode for a project/profile/action is admin-only.
- Approving risky restricted artifacts, including a rendered service that mounts
  `/var/run/docker.sock`, is admin-only unless a later policy explicitly grants
  that approval to a narrower role.
- Deploy/update/remove/upgrade/purge are allowed to both admin and operator only
  after registration, environment policy, profile eligibility, and trust-mode
  checks pass.
- Operator tokens must fail explicitly on admin-only operations. Do not silently
  downgrade, queue, or reinterpret admin requests.

Open design decisions:

- Whether the first implementation uses separate admin/operator bearer tokens,
  token records under `/hf`, or an external auth provider.
- Whether UI login chooses a role from the supplied token or shows role-scoped
  controls after token validation.
- How MCP exposes role and permission failures so agents stop and ask for admin
  approval instead of retrying.

Acceptance:

- `register_project` and `set_environment_project_policy` fail for an operator
  token.
- A normal operator can deploy a policy-approved restricted HiveMind/HiveWatch/
  PocketHive release without direct environment access.
- A normal operator can deploy a policy-approved trusted SkippyBot component
  only when an admin already allowed trusted mode for that project/profile/action.
- API/UI/MCP responses show the current role and explain admin-required
  failures without exposing token values.

## 8. Project Action Trust Modes And Restricted Runner

Status: planned direction after 0.5.0. The earlier plan made HiveForge-owned
Docker execution the only target. SkippyBot proves that would make HiveForge too
primitive for trusted component-level deployments. 0.5.1 should instead add an
explicit trust-mode split.

Current behavior runs project-declared Ansible actions in the HiveForge
container. That makes project action code trusted with the HiveForge control
plane's filesystem and Docker socket. It can read or modify `auth-token`,
`projects.yaml`, `environments.yaml`, `data/runtime-env.json`, the journal, and
other projects' deployment data.

The new contract must not pretend one execution model covers all projects.

Trust modes:

- `restricted`: project actions do not receive Docker socket access. They
  prepare or render artifacts, and HiveForge owns Docker deploy/remove/purge.
  HiveMind, HiveWatch, and PocketHive should use this mode for release-driven
  deployments.
- `trusted`: project actions are trusted operator code and may receive Docker
  access. They own deploy/update/remove/purge semantics, including targeted
  component-level Compose actions such as SkippyBot's
  `docker compose up -d --no-build --no-deps --force-recreate <service>`.
  HiveForge must surface that this is not sandboxed.

This also makes path contracts mode-specific. Restricted actions should use
task-oriented paths that HiveForge can validate before applying Docker changes.
Trusted actions may need project-specific paths for compatibility, but the
manifest must declare trusted mode instead of getting Docker access implicitly.

Restricted runner boundary:

- The HiveForge control-plane container keeps `/hf`, registry, environments,
  auth token, runtime-env store, journal, and API state.
- The action runner container receives only the selected checkout and the
  selected project deployment directory.
- The runner must not receive the full HiveForge runtime root.
- The runner must not receive the HiveForge auth token, registry,
  environments file, journal, or runtime-env store.
- The runner should be ephemeral per operation and removed after completion,
  unless an explicit debug-retention mode is requested.
- The restricted runner must not receive Docker socket access; HiveForge
  performs the apply/deploy/remove/purge Docker step itself.
- The project action contract is Ansible-only. The runner guarantees
  `ansible-playbook`, packaged Ansible built-ins, POSIX shell execution for
  explicit shell/command tasks, basic Unix file utilities, `curl`, `jq`, and CA
  certificates.
- Git is only for HiveForge-controlled checkout phases, not normal action
  execution. Docker CLI is not a project runner capability; HiveForge owns the
  Docker apply/deploy step.
- The runner contract does not guarantee Python as a project-callable CLI, `yq`,
  language runtimes, build tools, Maven, Java, Node package managers, SSH, SSH
  agent/socket access, project-specific CLIs, Ansible collections, or roles
  unless they are explicitly declared and provided.

Trusted runner boundary:

- Trusted actions may receive Docker socket access or Docker CLI access when the
  environment policy explicitly allows trusted mode for the project/profile.
- Trusted mode is full Docker-host control. HiveForge cannot enforce "only this
  project's containers" with a raw Docker socket.
- Trusted actions may run project-owned deploy/update/remove/purge playbooks.
  This keeps SkippyBot-style per-component cleanup and targeted service restart
  valid.
- HiveForge should still pass `HIVEFORGE_DEPLOYMENT_ID` and require declared
  Docker effects to apply `hiveforge.deployment=<deploymentId>` where practical.
  That label is for diagnostics and inventory, not for security isolation.
- HiveForge stores project/component/profile/action/trustMode/operationId in
  SQLite state keyed by `deploymentId`; Docker labels should stay minimal.
- If trusted actions do not create resources with the expected deployment label,
  HiveForge reports the deployment as untracked or diagnostics-degraded rather
  than guessing ownership from names.

Path contract for restricted Docker/Swarm action runners:

Project repositories must declare the breaking action contract version in the
root manifest:

```yaml
kind: project
version: "0.5"
```

Repositories without this version, or with another version, must fail during
inspection/registration before any action runs.

Lifecycle contract:

- Root manifests define the allowed canonical lifecycle vocabulary for the
  project.
- Component manifests declare the lifecycle action subset that component
  actually supports.
- Components do not have to implement the same action set. Example: a
  `pockethive` component can support `deploy`, `remove`, and `update`, while
  optional `toxiproxy` or `mocks` components may support only `deploy` and
  `remove`.
- A run request for an action outside the selected component's declared subset
  must fail before any runner starts.
- The older POC validator that required every component to implement the full
  root action subset has been removed on branch
  `feat/0.5-isolated-action-runner`.

Expose only task-oriented paths to project Ansible:

```text
HIVEFORGE_RENDERED_COMPOSE_FILE
HIVEFORGE_BIND_SOURCE_DIR
```

`HIVEFORGE_RENDERED_COMPOSE_FILE` is the file path the action writes or uses as
the exact Compose/Stack artifact for Docker.

`HIVEFORGE_BIND_SOURCE_DIR` is the only project-owned directory that rendered
Compose/Stack files may use as the left side of Docker bind mounts, except for
explicit system allowlist paths such as `/var/run/docker.sock`.

For the runner, HiveForge should mount the selected project deployment directory
at the same absolute path that Docker/Swarm nodes see. Example:

```text
host/runtime node:
  /mnt/shared_nfs/hiveforge/deployed/<projectId>/

action runner:
  /mnt/shared_nfs/hiveforge/deployed/<projectId>/
```

This avoids exposing both internal `/hf/...` paths and host-visible
`/mnt/shared_nfs/...` paths to project actions.

Expected runner inputs:

- checkout directory, mounted read-only when possible,
- deployment directory, mounted read-write at the node-visible absolute path,
- non-secret runtime env selected for the operation,
- explicit operation/project/component/action/profile metadata,
- no unrelated HiveForge control-plane files.

Validation rules:

- Before action execution, HiveForge creates the project deployment directory and
  the parent directories for `HIVEFORGE_RENDERED_COMPOSE_FILE` and
  `HIVEFORGE_BIND_SOURCE_DIR`.
- After action execution and before reporting deployment success, HiveForge
  parses the rendered Compose/Stack file.
- For Docker/Swarm profiles, bind source paths must be under
  `HIVEFORGE_BIND_SOURCE_DIR` or on a typed allowlist.
- Rendered bind source paths must not reference `/hf`, the checkout directory,
  or other HiveForge internal paths.
- Bind source paths must exist on every eligible runtime node before reporting
  readiness.
- Swarm services/tasks created by the operation must be checked for
  `Rejected`/`Failed` states and mount errors before the operation is reported
  as succeeded.

Open design decisions:

- Exact manifest shape for `deployment.trustMode` and environment policy gates
  that allow or deny trusted mode.
- How trusted projects declare expected Docker effects, for example Compose
  project name, targeted services, and required
  `hiveforge.deployment=<deploymentId>` labels.
- Whether the runner image is the HiveForge image with a restricted entrypoint
  or a separate minimal image containing Ansible without Docker CLI.
- How projects declare any extra Ansible collections/roles or helper tools
  without making them hidden image dependencies.
- Whether repository inspection should use sparse checkout to fetch only the
  HiveForge contract directory first, for example `hiveforge.yaml` or a future
  `deploy/hiveforge/` contract root, then fail fast on unsupported `version`
  before cloning the full repository.
- How debug retention is requested and cleaned up without leaving privileged
  containers running.
- How to express system bind allowlists in the manifest/environment contract
  without reintroducing magic strings.
- Whether a future Docker API proxy or authorization plugin is worth adding so
  trusted-style Compose flexibility can become technically restricted. Raw
  Docker socket access must remain documented as unrestricted.

Acceptance:

- A restricted project action cannot read or modify `auth-token`,
  `projects.yaml`, `environments.yaml`, `data/runtime-env.json`, or the journal
  through normal runner mounts.
- A trusted action is visibly marked trusted in API/UI/MCP output before
  execution and is not described as sandboxed.
- A repository missing `version: "0.5"` fails during inspect/register before
  action execution.
- A small Swarm smoke project can write config files to
  `HIVEFORGE_BIND_SOURCE_DIR`, write or use `HIVEFORGE_RENDERED_COMPOSE_FILE`,
  let HiveForge deploy the stack in restricted mode, and run successfully on a
  worker node.
- The same smoke fails clearly if the rendered Compose file contains `/hf/...`
  as a bind source.
- A trusted SkippyBot-style smoke can run a project-owned targeted Compose
  action and HiveForge can still find labeled resources when the action applies
  `hiveforge.deployment=<deploymentId>`.
- Operation status fails when Swarm tasks are rejected for missing bind sources.
- Runtime diagnostics and project UI can show the rendered bind source path,
  node visibility result, and Docker task error.

## 9. PocketHive Release Deploy Follow-Through

PocketHive remains blocked until the old compatibility deploy action is replaced
with a restricted, release-driven runtime path.

Required work:

- Replace the PocketHive HiveForge action that runs `build-hive.sh --quick`.
- Use already-published images selected through explicit release vars.
- Keep image build/push outside HiveForge deploy execution.
- Wire PocketHive runtime compose/config/scenario files through
  `artifacts.managedPaths`.
- Make `prepare_release_deploy` prove that required runtime files and image vars
  are present before any execution step.
- Add the later restricted execution contract separately from the prepare tool.
- Require operator-visible approval when a rendered PocketHive/HiveMind/HiveWatch
  Compose/Stack artifact mounts `/var/run/docker.sock` into an application
  service. This warning is about the deployed service's privileges, not about
  granting Docker access to the restricted action runner.

Acceptance:

- A PocketHive dev tag pushed to an explicit registry can be selected through
  MCP.
- HiveForge does not require Maven/Java to deploy PocketHive.
- `latest` and unqualified PocketHive application image refs are rejected before
  execution.
- PocketHive release deployment uses `restricted` mode: project actions prepare
  artifacts, HiveForge applies Docker changes, and there is no fallback to
  trusted repo/ref Ansible actions.

## 10. Workspace Retention And Cleanup

Current behavior: every checkout uses a fresh workspace directory under
`<workspaceRoot>/<projectId>/<encodedRef>-<random>/`, and old checkout
directories remain on disk.

0.5.x should make this visible and controlled.

Required design decisions:

- Whether cleanup is manual-only, TTL-based, max-count-based, or a combination.
- Whether failed checkouts are retained by default for diagnostics.
- What metadata identifies the owning operation, project, ref, creation time,
  and last use.

Candidate MCP/admin tools:

```text
list_workspaces
cleanup_workspaces
```

`cleanup_workspaces` should support dry-run output before deletion:

```json
{
  "dryRun": true,
  "olderThanHours": 72,
  "projectId": "pockethive"
}
```

Behavior rules:

- No implicit cleanup that hides evidence of a failed deploy.
- Cleanup decisions should be auditable.
- Do not delete HiveForge-managed deployed runtime files under
  `<runtime-root>/data/deployed/<projectId>/`; workspace cleanup is only for git
  checkout workspaces.

## 11. Project Operator UI View

Add or expand a project-centered UI view so a human operator can understand one
project without jumping between environment, journal, operation, and raw config
views.

The UI must use the same REST/application services as MCP and must not implement
separate deploy, readiness, diagnostics, artifact, status, or cleanup logic.

Candidate route:

```text
/projects/{projectId}
```

The project view should show:

- project metadata: id, name, repository, approved refs,
- components, profiles, and declared lifecycle actions,
- environment policy for this project, including allowed actions/profiles,
- deployment inventory filtered to the project,
- live runtime status for current deployments using
  `check_deployment_runtime_status`/REST equivalent,
- readiness/prerequisites using `explain_deploy_prerequisites`/REST equivalent,
- required/manual labels, including which Swarm nodes currently have or miss
  them,
- declared Docker secrets and volumes/mount requirements by name/path only,
- non-secret runtime env keys and profile scopes, with values shown only when
  the existing runtime-env contract allows it,
- rendered deployment artifacts for selected operations, especially Compose/Stack
  preview with redaction and digest,
- parsed bind mounts from the rendered Compose/Stack artifact, including source
  path, target path, owning service, and whether each source exists on required
  nodes,
- Docker task/container mount errors correlated back to the rendered service and
  source path,
- operation history and relevant journal events filtered to the project,
- workspace/checkouts for the project, including age/ref/operation metadata,
- cleanup action for old project checkouts using the same dry-run first contract
  as `cleanup_workspaces`.

UI behavior rules:

- Cleanup must default to dry-run/preview before deletion.
- Destructive actions must be explicit and scoped to the selected project.
- Artifact previews must show whether content is redacted and include digest.
- Prerequisite and runtime-status panels must preserve `unknown` states instead
  of converting them to green/healthy UI.
- Bind mount diagnostics must show the exact failing source path and node when
  known.
- Labels and manual prerequisites should be copyable as exact key/value or command
  snippets only when the backend returns those fields explicitly.
- The UI must not display secret values or full container inspect payloads.

Open design decisions:

- Whether project view is server-rendered with progressive enhancement, or a
  small authenticated client-side view using the existing token flow.
- Whether workspace cleanup belongs directly on the project view or behind an
  "advanced maintenance" section.
- Whether artifact previews should be inline, modal, or downloadable evidence
  files.

Acceptance:

- A PocketHive project page can answer: what is deployed, what Compose/Stack was
  used, which labels/manual prerequisites are missing, whether containers are
  running, which bind mount source is failing on which node, and which old
  checkouts can be cleaned.
- The UI contract in `docs/specs/ui/operator-console.md` is updated before or
  with implementation.
- UI tests cover at least rendering of unknown/degraded states, redacted
  artifact evidence, and cleanup dry-run results.

## 12. New-Agent Runbook Update

Update `docs/ai/USE_HIVEFORGE.md` after the tools exist.

Target flow:

```text
check_health
get_hiveforge_info
list_environments
refresh_environment
list_environment_nodes
diagnose_hiveforge_runtime
list_projects
list_deployments
explain_deploy_prerequisites
inspect_repository/register_project when needed
set_environment_project_policy when explicitly approved
set_project_runtime_env for non-secret values
validate_requirements
prepare_release_deploy or start_action
get_operation
get_deployment_artifact
check_deployment_runtime_status
read_journal
```

The runbook must clearly say:

- `prepare_release_deploy` is not execution.
- Admin-only operations such as `register_project`,
  `set_environment_project_policy`, trusted-mode approval, and risky-mount
  approval must stop with an admin-required message when the current token is an
  operator token.
- Manual prerequisites remain manual unless a separate explicit provisioning
  workflow exists.
- `get_deployment_artifact` returns operation evidence; it must not silently
  re-render from current source.
- `check_health` means the HiveForge process is reachable; runtime container
  status comes from `check_deployment_runtime_status`.
- `diagnose_hiveforge_runtime` explains HiveForge's own storage paths and
  whether managed-root accessibility is configured, verified, failed, or
  unknown.
- Project actions run through an isolated action runner once that contract
  exists; agents should inspect runner diagnostics instead of assuming actions
  run inside the HiveForge API container.
- Secrets are never MCP arguments.
- Update-in-place verification belongs in install/operator docs, not normal
  project deploy flow.
- The project UI should expose the same evidence a careful agent reports:
  project deployments, prerequisites, runtime status, rendered artifacts, and
  cleanup candidates.

## Reviewer/Jester Notes

- Reviewer: keep MCP tool schema as the SSOT and update tests that assert the
  registered tool list.
- Reviewer: if REST path semantics change, update OpenAPI and REST tests in the
  same commit.
- Jester: failing old `deploy_release` calls should be obvious, not silently
  routed to the new tool.
- Jester: prerequisites output must distinguish "missing", "present",
  "unknown", and "not_applicable"; otherwise agents will overstate readiness.
- Jester: runtime status must distinguish "not deployed", "deployed but no
  tracked containers", "containers running", "containers unhealthy", and
  "Docker unavailable".
- Jester: artifact preview must not leak secrets and must not pretend a redacted
  preview is byte-for-byte identical to the deployed file.
- Jester: diagnostics must not say a shared managed root is usable on every node
  unless HiveForge has verified that access or clearly reports the assumption as
  unverified.
- Jester: action runner isolation must prove the runner cannot read or mutate
  HiveForge control-plane files such as `auth-token`, `projects.yaml`,
  `environments.yaml`, `data/runtime-env.json`, or the journal.
- Jester: a successful Ansible exit code is not enough for Docker/Swarm deploy
  success; HiveForge must inspect rendered bind sources and task/service health
  before reporting success.
- Jester: bind mount errors must point at the rendered source path and scheduled
  node; a generic "container failed" status is not enough.
- Jester: HiveForge redeploy tests must prove durable files survive container
  replacement; process-local operations are allowed to reset only because the
  journal is durable.
- Jester: UI project view must not hide `unknown` diagnostics behind optimistic
  green states, and cleanup actions must not delete deployed runtime files.
- Jester: workspace cleanup must not delete active checkouts or managed deployed
  runtime files.
