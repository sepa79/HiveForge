# Architecture — HiveForge

This file is the starting SSOT for architecture.

## Status

Draft architecture for the initial HiveWatch deployment POC.

## Purpose

HiveForge is a deployment control plane that runs on a target Docker/Swarm
environment. It checks out approved project repositories, reads `hiveforge.yaml`
manifests, validates declared requirements, executes declared lifecycle actions,
and records operation history.

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
and later PocketHive, carry manifests and action files. HiveForge provides the
control plane around those assets.

```text
Human / AI Agent
      |
      | UI / MCP / REST
      v
HiveForge container on target env
      |
      | checkout explicit git ref from allowlist
      v
Project workspace cache
      |
      | read root + listed component manifests
      v
Registry + Validator
      |
      | run declared adapter/action
      v
Ansible playbooks from project repo
      |
      v
Docker / Swarm target resources

HiveForge journal records every operation.
```

## Main components

| Component | Responsibility | Notes |
|---|---|---|
| API | REST control surface for checkout, inspection, validation, actions, and journal reads. | Must not leak secrets. |
| Environment registry | Loads known deployment environment metadata and capabilities. | Environment policy is explicit config. |
| MCP server | AI-facing tool surface over the same application services as REST. | Tool names stay explicit. |
| UI | Human-facing environment, project, component, and action workflow. | First POC can be minimal. |
| Git workspace manager | Checks out allowlisted repositories at explicit refs. | No arbitrary repository execution. |
| Manifest loader | Reads root and component `hiveforge.yaml` files. | Root manifest controls component list. |
| Registry | In-memory view of checked-out projects and managed components. | Built from manifests only. |
| Validator | Checks requirements before actions run. | Missing requirement is a hard failure. |
| Action runner | Executes declared actions through declared adapters, initially Ansible. | No adapter fallback. |
| Journal | Append-only operation log. | Records target ref, action, result, reason. |

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

Secret values are never read, persisted, logged, or returned.

## APIs / contracts / specs

Canonical specs live under `docs/specs/`.

- `docs/specs/hiveforge-poc.md` defines the current POC behavior.
- `docs/specs/manifest.schema.json` is the SSOT for root and component
  `hiveforge.yaml`.
- `docs/specs/config/allowlist.schema.json` is the SSOT for allowed project
  repositories and refs.
- `docs/specs/config/environments.schema.json` is the SSOT for known
  environments.
- `docs/specs/repository-inspection.md` defines read-only bootstrap inspection
  for candidate repositories.
- `docs/specs/journal/event.schema.json` is the SSOT for operation journal
  events.
- `docs/specs/journal/jsonl.md` defines the POC journal storage backend.
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
- git network access for allowlisted repositories,
- the target Docker/Swarm control surface required by project playbooks.

The deploy container is self-contained for HiveForge runtime dependencies:
Node.js, git, SSH client, CA certificates, and Ansible are installed in the
image. The target host must provide only the Docker/Swarm control access needed
by declared playbooks. The container contract lives in
`docs/specs/runtime-container.md`.

## Observability

Every operation must be observable through the journal. Logs may support
debugging, but the journal is the product contract for operation history.

## Failure modes

- Repository not allowlisted: reject before checkout.
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
