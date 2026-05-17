# MCP Tool Contract

## Status

Draft POC contract.

## Rule

MCP tools reuse the same application services as REST and CLI. MCP must not add
alternate deployment logic, action fallbacks, or manifest discovery.

## Tools

### `list_projects`

Input: none.

Output: allowlisted project IDs, names, repositories, and allowed refs.

### `list_environments`

Input: none.

Output: current environment and known environment metadata/capabilities.
When configured, environment metadata includes project policy for allowed
project/profile/action combinations.

### `list_deployments`

Input: none.

Output: deployment inventory for the current environment, derived from
succeeded lifecycle actions in the journal.

### `inspect_repository`

Input:

```json
{
  "repository": "https://github.com/sepa79/HiveWatch.git",
  "gitRef": "main"
}
```

Behavior: read-only checkout of the requested repository/ref, manifest loading,
and declared action-file checks. This does not authorize deployment and does not
run project actions.

Output: deployability result, project metadata, component names, lifecycle
actions, and an explicit reason when not deployable.

### `inspect_project`

Input:

```json
{
  "projectId": "hivewatch",
  "gitRef": "main"
}
```

Behavior: checkout allowlisted ref and load root/component manifests.

Output: operation ID, project metadata, and managed components.

### `validate_requirements`

Input:

```json
{
  "projectId": "hivewatch",
  "gitRef": "main"
}
```

Behavior: checkout, inspect, and validate declared requirements.

Output: operation ID, `ok`, and validation issues.

### `run_action`

Input:

```json
{
  "projectId": "hivewatch",
  "gitRef": "main",
  "component": "api",
  "action": "deploy",
  "profile": "test"
}
```

Behavior: checkout, inspect, validate, then run the declared action.
`action` must be one of `deploy`, `remove`, `purge`, `update`, or `upgrade`.
`profile` is optional at the tool contract level, but projects may declare it as
a required environment variable. Environment policy may also require and limit
profiles.

Output: operation ID, stdout, and stderr.

### `read_journal`

Input: none.

Output: journal events validated by `docs/specs/journal/event.schema.json`.

## Failure Handling

Failures are explicit tool errors and are also recorded in the journal by the
underlying services where operation context exists. Secret values must not be
returned.
