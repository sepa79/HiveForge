# SQLite State Store

## Status

Draft 0.5 contract.

## Purpose

HiveForge stores durable current-state data in SQLite at:

```text
<runtime data root>/hiveforge.sqlite
```

With the standard container runtime root this is:

```text
/hf/data/hiveforge.sqlite
```

JSONL journal files remain append-only operation evidence. SQLite is the indexed
state store for data HiveForge must query directly after process restart or
container redeploy.

## Deployments

The `deployments` table stores the current state for one environment/project/
component/profile deployment slot.

Each row has one stable `deployment_id`. Docker resources owned by HiveForge use
only this Docker object label:

```text
hiveforge.deployment=<deployment_id>
```

Project, component, profile, environment, current operation, and timestamps live
in SQLite, not as duplicated Docker labels.

Each row also stores one `deployment_name`. Docker Compose project names and
Docker Swarm stack names use this runtime deployment name:

```text
<deployment_name>
```

The default `deployment_name` for a new slot is the project id, for example
`hivewatch`. REST and MCP callers may supply an explicit deployment name for a
new slot. HiveForge must not silently rename an existing slot; changing the
deployment name requires an explicit new slot/removal flow. Docker project/stack
names must not contain the `deployment_id`; that id belongs in
`hiveforge.deployment` and SQLite state.

The unique deployment slot key is:

```text
environment + project + component + profile
```

`profile` may be absent; internally the empty profile key is explicit.

Each deployment row also stores one explicit runtime owner:

- `executor_kind` - `docker-direct` or `portainer-stack`.

This value is durable state, not a retry/fallback hint. HiveForge records it so
later deploy/remove/diagnostic flows use the same runtime owner explicitly.

For Portainer-owned deployments, the row also stores:

- `portainer_endpoint_id`
- `portainer_stack_id`
- `portainer_stack_name`

`portainer_stack_id` is the stable runtime identity after the first successful
Portainer stack create. `portainer_stack_name` is operator/debug metadata only;
HiveForge must not treat it as the primary identity once a stack id exists.
`portainer_endpoint_id` is also durable owner identity for that slot while the
slot is active; HiveForge must fail explicitly rather than silently switching an
existing slot to a different Portainer endpoint.

Deployment status values:

- `preparing` - HiveForge has a stable deployment id and is preparing/executing
  the deployment executor step.
- `deployed` - HiveForge deployment executor completed for the slot.
- `removed` - the slot was removed by a lifecycle action.
- `gone` - HiveForge proved that a previously `deployed`, `removed`, or
  `failed` runtime no longer exists and reconciled the slot after it was removed outside
  HiveForge.
- `failed` - HiveForge attempted the current deployment step and it failed.

## Retention

The SQLite DB is part of HiveForge operator data and must be retained across
HiveForge container recreate/update-in-place flows when the same runtime root is
mounted.

HiveForge may create the DB and missing tables during startup. It must not
delete or replace an existing DB during normal startup.
