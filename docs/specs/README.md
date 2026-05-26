# Specs / Contracts

This directory is the canonical home for project specs and contracts.

Use it for:

- REST/OpenAPI contracts,
- config schemas,
- file formats,
- CLI contracts,
- MCP/tool contracts,
- integration contracts,
- journal event contracts.

## Rules

- One canonical spec per contract.
- Implementation follows the spec, not the other way around.
- Contract changes must be reviewed.
- Breaking changes must be explicit.
- If generated code is used, document source spec and generation command.
- Do not keep duplicate schemas/DTOs/parsers for the same contract without
  documenting why.

## Current Specs

| Spec | Purpose | Status |
|---|---|---|
| `control-plane-vision.md` | Direction for environments, bootstrap, UI, MCP, and deployments. | Draft |
| `capabilities.md` | Capability vocabulary for portable profile matching. | Draft |
| `deployment-artifacts.md` | Portable release deployment profiles and environment matching design. | Draft |
| `hiveforge-poc.md` | Initial HiveForge/HiveWatch POC contract. | Draft |
| `manifest.schema.json` | Root and component `hiveforge.yaml` contract. | Draft |
| `config/project-registry.schema.json` | Registered project registry contract. | Draft |
| `config/environments.schema.json` | Known environments config contract. | Draft |
| `environments.md` | Known deployment environment contract. | Draft |
| `repository-inspection.md` | Read-only repository bootstrap inspection contract. | Draft |
| `releases.md` | Target release-driven deployment contract for managed services. | Draft |
| `journal/event.schema.json` | Append-only operation journal event contract. | Draft |
| `journal/jsonl.md` | POC JSONL journal storage contract. | Draft |
| `runtime-container.md` | Self-contained deploy container runtime contract. | Draft |
| `runtime-env.md` | Non-secret runtime environment variable storage and injection contract. | Draft |
| `validation/runtime-requirements.md` | Runtime requirement validation contract. | Draft |
| `profiles.md` | Deployment profile contract. | Draft |
| `actions/lifecycle.md` | Canonical deployment lifecycle action contract. | Draft |
| `actions/ansible.md` | POC Ansible action runner contract. | Draft |
| `orchestration/deploy-flow.md` | POC deploy orchestration contract. | Draft |
| `api/openapi.yaml` | POC REST API contract. | Draft |
| `mcp/tools.md` | POC MCP tool contract. | Draft |
| `ui/operator-console.md` | POC human operator console contract. | Draft |
| `local-docker-smoke.md` | Development-only local Docker smoke flow. | Draft |

## Suggested structure

```text
docs/specs/
  README.md
  hiveforge-poc.md
  manifest.schema.json
  api/
  config/
    project-registry.schema.json
    runtime-env.schema.json
  integrations/
  journal/
    event.schema.json
  mcp/
```

## Open Questions

- UI operator console contract.
- Durable inventory backend after JSONL POC.

## Decisions Needed

- SQLite journal/inventory migration timing.

## Known Gaps

- MCP server has only POC stdio coverage and still needs client integration
  smoke tests.
- UI is POC-only and server-rendered/static for now.
- No SQLite journal backend yet.

## Next Spec Work

1. Implement release deploy/upgrade API and MCP operations from `releases.md`.
2. Define repository bootstrap/edit tools for MCP.
3. Extend UI operator console actions and failure states.
4. Decide SQLite journal/inventory contract.
