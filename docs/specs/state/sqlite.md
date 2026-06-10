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

The unique deployment slot key is:

```text
environment + project + component + profile
```

`profile` may be absent; internally the empty profile key is explicit.

Deployment status values:

- `preparing` - HiveForge has a stable deployment id and is preparing/executing
  the Docker deploy step.
- `deployed` - HiveForge Docker deploy completed for the slot.
- `removed` - the slot was removed by a lifecycle action.
- `failed` - HiveForge attempted the current deployment step and it failed.

## Retention

The SQLite DB is part of HiveForge operator data and must be retained across
HiveForge container recreate/update-in-place flows when the same runtime root is
mounted.

HiveForge may create the DB and missing tables during startup. It must not
delete or replace an existing DB during normal startup.
