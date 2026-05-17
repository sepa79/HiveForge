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
- Do not deploy arbitrary repositories outside an allowlist.
- Do not add fallback chains between adapters or actions.

## Main users / operators

- Human operators using the UI.
- AI agents using MCP tools.
- Automation using REST.

## Main modules

Planned modules:

| Module | Purpose | Notes |
|---|---|---|
| API | REST control surface. | Contract to be defined. |
| MCP server | AI-facing tool surface. | Reuses application services. |
| UI | Human-facing project/component/action workflow. | Minimal for POC. |
| Workspace manager | Git checkout and workspace cache. | Allowlist required. |
| Manifest loader | Load root and component manifests. | Uses schema once defined. |
| Validator | Check requirements before actions. | Explicit failure only. |
| Action runner | Run declared adapter actions. | Initial adapter: Ansible. |
| Journal | Append-only operation history. | No secret values. |

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
- allowlisted project repositories.

## Important risks

- Running repo-provided deployment actions on the target host is powerful; use an
  allowlist and explicit refs.
- Secret values must never appear in logs, UI, MCP output, REST responses, or the
  journal.
- Adapter behavior must be explicit; no fallback to alternate deployment modes.

## Things AI agents must not guess

- Do not guess project repositories; use the allowlist.
- Do not guess components from Compose.
- Do not guess action commands.
- Do not invent fallback adapters.
- Do not expose or request secret values unless a task explicitly concerns secret
  provisioning outside HiveForge.
