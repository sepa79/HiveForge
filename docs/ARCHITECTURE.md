# Architecture — HiveForge

This file is the starting SSOT for architecture.

## Status

Draft architecture for the initial HiveWatch deployment POC.

## Purpose

HiveForge is a deployment control plane that runs on a target Docker/Swarm
environment. It validates registered projects, prepares managed files under its
own data root, executes declared lifecycle actions, and records operation
history.

## Architecture principles

- Keep boundaries explicit.
- Keep contracts/specs as SSOT.
- Prefer simple, observable flows.
- Prefer explicit configuration over hidden defaults.
- Avoid fallback chains that hide real failures.
- Make recovery and debugging possible.
- Do not expose secret values.

## System overview

HiveForge does not own application code. Consumer projects, initially HiveWatch
and later PocketHive, carry manifests and deployment assets. HiveForge provides
the control plane around those assets.

```text
Human / AI Agent
      |
      | UI / MCP / REST
      v
HiveForge container on target env
      |
      | checkout explicit git ref from project registry
      v
Project workspace cache
      |
      | read root + listed component manifests
      v
Registry + Validator
      |
      | run declared adapter/action as render/preparation
      v
Ansible playbooks from project repo
      |
      | rendered Compose/Stack file
      v
HiveForge Docker deploy executor
      |
      v
Docker / Swarm target resources

HiveForge journal records operation evidence. SQLite records current deployment
state.
```

The diagram reflects the current HiveWatch POC, which still checks out a
registered project ref before deployment. The target v1 contract for
PocketHive/HiveMind-style managed services is release-driven: deployment input
is a release ref or image tag set with already-published registry artifacts. The
release contract lives in `docs/specs/releases.md`.

## Main components

| Component | Responsibility | Notes |
|---|---|---|
| API | REST control surface for checkout, inspection, validation, actions, and journal reads. | Must not leak secrets. |
| Environment registry | Loads known deployment environment metadata and capabilities. | Environment policy is explicit config. |
| MCP server | AI-facing tool surface over the same application services as REST. | Tool names stay explicit. |
| UI | Human-facing environment, project, component, and action workflow. | First POC can be minimal. |
| Git workspace manager | Checks out registered repositories at explicit refs. | No arbitrary repository execution. |
| Manifest loader | Reads root and component `hiveforge.yaml` files. | Root manifest controls component list. |
| Registry | In-memory view of checked-out projects and managed components. | Built from manifests only. |
| Validator | Checks requirements before actions run. | Missing requirement is a hard failure. |
| Action runner | Executes declared actions through declared adapters, initially Ansible. | No adapter fallback. |
| Journal | Append-only operation log. | Records target ref, action, result, reason. |
| SQLite state store | Durable indexed current-state store. | Tracks deployment slots and stable deployment ids. |

## Boundaries

HiveForge manages only components explicitly listed in the project manifest and
backed by a component manifest. Docker Compose files are runtime topology, not
HiveForge contracts.

HiveForge does not infer operations. The project repository owns action files,
for example Ansible playbooks, and the manifest declares which action maps to
which file.

## Data model

- Workspace cache: checked-out project repositories by project and ref.
- Registry state: parsed project/component manifests for the active workspace.
- Validation reports: requirement checks for a project/component/action.
- Journal: append-only operation records.
- SQLite state DB: current deployment slots and their stable `deploymentId`.

Secret values are never read, persisted, logged, or returned.

## APIs / contracts / specs

Canonical specs live under `docs/specs/`.

- `docs/specs/hiveforge-poc.md` defines the current POC behavior.
- `docs/specs/capabilities.md` defines the capability vocabulary for portable
  profile matching.
- `docs/specs/deployment-artifacts.md` defines the portable release deployment
  profile and environment capability matching direction.
- `docs/specs/manifest.schema.json` is the SSOT for root and component
  `hiveforge.yaml`.
- `docs/specs/config/project-registry.schema.json` is the SSOT for registered project
  repositories and refs.
- `docs/specs/config/environments.schema.json` is the SSOT for known
  environments.
- `docs/specs/repository-inspection.md` defines read-only bootstrap inspection
  for candidate repositories.
- `docs/specs/releases.md` defines the target release-driven deployment
  contract for managed services.
- `docs/specs/journal/event.schema.json` is the SSOT for operation journal
  events.
- `docs/specs/journal/jsonl.md` defines the POC journal storage backend.
- `docs/specs/state/sqlite.md` defines the durable current-state backend.
- `docs/specs/runtime-env.md` defines non-secret runtime environment config
  stored outside project repositories and injected into validation/actions.
- `docs/specs/validation/runtime-requirements.md` defines runtime requirement
  validation.
- `docs/specs/actions/ansible.md` defines the POC Ansible action runner.
- `docs/specs/orchestration/deploy-flow.md` defines the POC deploy flow.
- `docs/specs/api/openapi.yaml` defines the POC REST contract.
- `docs/specs/mcp/tools.md` defines the POC MCP tool contract.
- `docs/specs/ui/operator-console.md` defines the POC UI contract.

## Runtime / deployment

The deployed shape is a HiveForge container running on the target Docker/Swarm
environment with access to:

- a configured workspace directory,
- a configured journal directory,
- a configured data root that stores non-secret runtime env config and SQLite
  state,
- git network access for registered repositories,
- the target Docker/Swarm control surface used by HiveForge's deploy executor.

The deploy container is self-contained for HiveForge runtime dependencies:
Node.js, git, SSH client, CA certificates, and Ansible are installed in the
image. The target host must provide only the Docker/Swarm control access needed
by HiveForge's deploy executor. The container contract lives in
`docs/specs/runtime-container.md`.

## Observability

Every operation must be observable through the journal. Logs may support
debugging, but the journal is the product contract for operation history.

## Failure modes

- Repository not registered: reject before checkout.
- Git ref missing: reject before manifest loading.
- Root manifest missing or invalid: reject project activation.
- Listed component manifest missing: reject component registry build.
- Requirement missing: reject action execution.
- Action file missing: reject action execution.
- Action fails: record failure and reason in journal.
- Secret value would be exposed: treat as a bug; output must use names only.

## Open architecture questions

- Exact HiveWatch component list for the POC.
- Whether the UI remains bundled after the POC or moves to a separate build.
- Whether a future per-node HiveForge agent should manage explicitly configured
  node-local roots, such as a dedicated ClickHouse mount on one Swarm node.
