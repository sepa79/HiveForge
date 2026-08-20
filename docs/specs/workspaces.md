# Workspaces

## Status

Draft contract.

## Rule

HiveForge checkout workspaces are explicit, temporary operational state. They
exist only to support repository inspection, manifest preflight, validation,
managed-file preparation, and declared action execution for one selected
project/ref flow.

Workspace retention is time-based, not indefinite. HiveForge must make the
retention basis visible and auditable. Cleanup never applies to managed
deployment files under `<runtime-root>/data/deployed/<projectId>/`; it applies
only to git checkout workspaces under the configured workspace root.

Manual cleanup is not a separate retention model. It is an explicit operator or
agent action that accelerates the same cleanup contract used by automatic
retention.

## Current layout

Project checkout workspaces live under:

```text
<workspaceRoot>/<projectId>/<encodedRef>-<random>/
```

Sparse manifest-preflight workspaces live under:

```text
<workspaceRoot>/<projectId>/<encodedRef>-preflight-<random>/
```

Repository bootstrap inspection workspaces live under:

```text
<workspaceRoot>/repository-inspection/repo-<random>/
```

The path remains implementation detail. The cleanup contract must not infer
meaning only from the directory name once metadata exists.

## Workspace metadata

Every HiveForge-managed workspace must have canonical metadata, stored with the
workspace and returned through REST/MCP.

Suggested metadata shape:

```json
{
  "workspaceId": "workspace-...",
  "kind": "project-checkout",
  "projectId": "hivewatch",
  "repository": "https://example.invalid/repo.git",
  "gitRef": "main",
  "workspacePath": "/hf/workspace/hivewatch/bWFpbg-abc123",
  "operationId": "uiop-...",
  "createdAt": "2026-08-20T12:00:00Z",
  "lastUsedAt": "2026-08-20T12:03:00Z",
  "inUse": false,
  "lifecycleState": "completed",
  "cleanupEligibleAfter": "2026-08-20T13:03:00Z"
}
```

Required fields:

- `workspaceId`
- `kind`
- `workspacePath`
- `createdAt`
- `lastUsedAt`
- `inUse`
- `lifecycleState`
- `cleanupEligibleAfter`

Optional fields:

- `projectId`
- `repository`
- `gitRef`
- `operationId`

Initial `kind` vocabulary:

- `project-checkout`
- `manifest-preflight`
- `repository-inspection`

Initial `lifecycleState` vocabulary:

- `active`
- `completed`
- `failed`
- `cleanup-pending`

`lastUsedAt` must update on every real workspace use, not only when the
directory is created.

## Automatic retention

Automatic cleanup applies only when HiveForge can explicitly associate the
workspace with a terminal lifecycle state. A workspace is cleanup-eligible only
when all of the following are true:

- `inUse` is `false`
- `lifecycleState` is terminal (`completed` or `failed`)
- current time is at or after `cleanupEligibleAfter`

Initial retention rule:

- `cleanupEligibleAfter = lastUsedAt + 1 hour`

Failed workspaces are not retained specially once they exceed the same
retention window.

Automatic cleanup must not:

- delete a workspace still marked `inUse`
- delete a workspace without canonical metadata
- delete managed deployment files under `data/deployed`
- guess whether a workspace is safe to remove from directory naming alone

## Manual cleanup

Manual cleanup uses the same eligibility contract. It may shorten the waiting
time by selecting older workspaces explicitly, but it must still refuse to
delete workspaces marked `inUse`.

The first explicit selector is intentionally narrow:

```json
{
  "dryRun": true,
  "olderThanHours": 1
}
```

Initial manual cleanup rules:

- `dryRun` is required for preview-only requests
- `olderThanHours` is the only required selector in the first slice
- no first-slice `projectId`, `gitRef`, or `status` selector is required

## REST and MCP surface

Initial read surface:

- REST: `GET /workspaces`
- MCP: `list_workspaces`

Initial cleanup surface:

- REST: `POST /workspaces/cleanup`
- MCP: `cleanup_workspaces`

`list_workspaces` returns only current workspace metadata and derived cleanup
status. It does not mutate retention state.

`cleanup_workspaces` returns either:

- a dry-run report of candidates and reasons, or
- an execution report showing removed and skipped workspaces

## Cleanup report

Initial result shape:

```json
{
  "dryRun": true,
  "olderThanHours": 1,
  "evaluatedAt": "2026-08-20T13:05:00Z",
  "candidates": [
    {
      "workspaceId": "workspace-123",
      "workspacePath": "/hf/workspace/hivewatch/bWFpbg-abc123",
      "eligible": true,
      "reason": "cleanup window elapsed"
    }
  ],
  "removed": [],
  "skipped": []
}
```

Each candidate/removal/skip entry must identify the workspace and the explicit
reason.

## Audit rules

Cleanup decisions must be auditable.

At minimum:

- dry-run and execution requests should be visible through normal operation
  history or journal evidence
- skipped workspaces must keep an explicit reason such as `in_use`,
  `metadata_missing`, or `retention_window_not_elapsed`
- execution results must report counts and exact workspace paths or ids that
  were removed

## Acceptance

- HiveForge can list active and idle workspaces with `createdAt`, `lastUsedAt`,
  `inUse`, lifecycle state, and cleanup eligibility.
- Automatic retention removes terminal workspaces one hour after last use.
- Manual cleanup can preview or execute removal using `olderThanHours`.
- Failed workspaces are not retained indefinitely by default.
- No cleanup path deletes an active workspace or a managed deployment file.
