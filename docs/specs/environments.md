# Environments

## Status

Draft POC contract.

## Rule

An environment is a concrete deployment target known to HiveForge. Environment
configuration is explicit and loaded from `HIVEFORGE_ENVIRONMENTS_PATH`.

The current POC exposes environments through REST so UI and MCP clients can
discover where operations are running. Deployment authorization comes from the
project registry plus environment-scoped project policy.

## Shape

Environment config is validated by `docs/specs/config/environments.schema.json`.

Each environment declares:

- `id`
- `name`
- `kind`
- `capabilities`
- `policy.projects`

## Policy

Policy is required for configured environments and is enforced before lifecycle
actions run. The first POC policy supports:

- registered project ids,
- allowed profiles per project,
- allowed lifecycle actions per project.

Repository refs remain controlled by the project registry. Repository inspection is
read-only and does not authorize deployment.
