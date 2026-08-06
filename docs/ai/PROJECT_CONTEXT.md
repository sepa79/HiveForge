# Project Context — HiveForge

## Purpose

HiveForge is a standalone deployment control plane for target Docker/Swarm
environments. It lets humans and AI agents deploy explicitly managed components
from approved git repositories through UI, MCP, and REST.

## What this project does

HiveForge runs on the target environment, checks out an approved project at an
explicit git ref, reads `hiveforge.yaml` manifests, validates requirements, and
runs declared lifecycle actions. The first POC target is HiveWatch. PocketHive
will later use HiveForge by carrying root and component manifests plus the
deployment assets needed by its managed components.

## What this project does not do

- Do not infer deployment behavior from Docker Compose.
- Do not manage components without manifests.
- Do not act as a secrets engine.
- Do not act as a scheduler or container runtime.
- Do not deploy repositories that are not registered.
- Do not add fallback chains between adapters or actions.

## Main users / operators

- Human operators using the UI.
- AI agents using MCP tools.
- Automation using REST.

## Main modules

The following modules are implemented. Their owning contracts are the current
source of truth; roadmap items remain explicitly marked as future work.

| Module | Current responsibility | Owning contract |
|---|---|---|
| REST API | Authenticated control-plane transport for project, environment, deployment, diagnostics, and update operations. | `docs/specs/api/openapi.yaml` |
| MCP server | Local stdio AI-facing tools backed by the REST API. | `docs/specs/mcp/tools.md` |
| Operator UI | Project, component, action, deployment, artifact, and runtime inspection workflow. | `docs/specs/ui/operator-console.md` |
| Registry, workspace, and manifest loading | Explicit Git repository registration, checkout, and root/component manifest inspection. | `docs/specs/config/project-registry.schema.json`, `docs/specs/manifest.schema.json` |
| Environment and validation | Environment policy, runtime requirements, profile eligibility, and deploy prerequisites. | `docs/specs/environments.md`, `docs/specs/capabilities.md` |
| Action and Docker execution | Declared lifecycle actions plus HiveForge-owned Docker deploy/remove/purge paths. | `docs/specs/actions/lifecycle.md`, `docs/specs/orchestration/deploy-flow.md` |
| Runtime evidence | Journal, deployment state, runtime diagnostics, and managed-root verification evidence. | `docs/specs/journal/jsonl.md`, `docs/specs/runtime-container.md` |

Remaining delivery work, including access/trust roles, restricted runner
hardening, and deeper diagnostics/UI coverage, is tracked in
`docs/ai/HIVEFORGE_0_5_PLAN.md`.

## Runtime model

HiveForge runs as a container on the target Docker/Swarm environment. It needs a
workspace directory for checkouts and a journal directory for operation history.

## Deployment model

Initial deployment target for HiveForge itself is Docker/Swarm. HiveForge then
deploys consumer projects by executing manifest-declared actions, initially
Ansible playbooks stored in the consumer repository.

## Data/storage model

- checkout workspace,
- parsed manifest registry,
- validation reports,
- append-only journal.

## External integrations

- git,
- Ansible for the first adapter,
- target Docker/Swarm environment,
- registered project repositories.

## Important risks

- Running repo-provided deployment actions on the target host is powerful; use a
  project registry and explicit refs.
- Secret values must never appear in logs, UI, MCP output, REST responses, or the
  journal.
- Adapter behavior must be explicit; no fallback to alternate deployment modes.
- Current known deployment/operator gaps are tracked in
  [Known Problems](KNOWN_PROBLEMS.md). Check this before changing validation,
  deploy prerequisites, UI visibility, or deployment diagnostics.

## Things AI agents must not guess

- Do not guess project repositories; use the project registry.
- Do not guess components from Compose.
- Do not guess action commands.
- Do not invent fallback adapters.
- Do not expose or request secret values unless a task explicitly concerns secret
  provisioning outside HiveForge.
