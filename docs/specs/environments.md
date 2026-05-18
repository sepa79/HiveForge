# Environments

## Status

Draft contract.

## Rule

An environment is a concrete deployment target known to HiveForge. Environment
configuration is explicit and loaded from `HIVEFORGE_ENVIRONMENTS_PATH` in the
current POC.

The current POC exposes environments through REST so UI and MCP clients can
discover where operations are running. Deployment authorization comes from the
project registry plus environment-scoped project policy.

For the target managed-service contract, an environment is represented by an
environment-local HiveForge service. That service reports capabilities for its
own runtime/provider implementation. Project manifests stay portable.

## Shape

Environment config is validated by `docs/specs/config/environments.schema.json`.

Each environment declares:

- `id`
- `name`
- `kind`
- `capabilities`
- `policy.projects`

Capabilities use the vocabulary in `docs/specs/capabilities.md`.

Example:

```yaml
capabilities:
  runtime:
    - docker-swarm
  registry: true
  ingress: true
  managedRoots:
    - scenarios-runtime
    - stack-root
  placement: true
  sharedRuntimeRoot: true
```

`managedRoots` are logical names, not host paths. HiveForge manages only roots
reported by the environment-local service. It does not create arbitrary host
mount points.

## Policy

Policy is required for configured environments and is enforced before lifecycle
actions run. The first POC policy supports:

- registered project ids,
- allowed profiles per project,
- allowed lifecycle actions per project.

Repository refs remain controlled by the project registry. Repository inspection is
read-only and does not authorize deployment.

## Eligibility

Profile eligibility is computed before policy authorization:

```text
profile requirements subset-of environment capabilities
```

Missing capabilities produce structured validation issues. Missing capabilities
must not trigger fallback profile selection, runtime switching, or
provider-specific inference.
