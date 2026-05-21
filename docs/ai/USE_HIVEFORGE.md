# Use HiveForge Through MCP

This is the operator runbook for AI agents.

## Hard Rule

AI agents and users operate HiveForge through MCP.

REST is not a user/operator interface. REST exists for HiveForge implementation,
development, and debugging by HiveForge maintainers. Do not instruct users to
call REST directly for normal operations.

There is no REST fallback for users.

## Connect

Use a known HiveForge target when available:

```bash
npm run hf-target -- list
npm run hf-target -- use <target-id>
<TARGET_TOKEN_ENV>=<token> npm run hiveforge-mcp-target
```

If no known target exists, start MCP explicitly against one HiveForge endpoint:

```bash
HIVEFORGE_BASE_URL=http://<host>:3000 \
HIVEFORGE_AUTH_TOKEN=<token> \
npm run hiveforge-mcp
```

Do not invent endpoints or tokens.

## Normal Flow

Use MCP tools in this order:

1. `get_hiveforge_info`
2. `list_environments`
3. `list_projects`
4. `list_deployments`
5. `inspect_repository` only for a candidate repository/ref not yet registered
6. `register_project` only after inspection succeeds and the operator approves
7. `inspect_project`
8. `validate_requirements`
9. `start_action`
10. `get_operation`
11. `read_journal`

## Required Inputs

Before starting an action, confirm:

- active HiveForge target,
- project id,
- git ref or release input required by the current contract,
- component,
- action,
- profile,
- expected health/evidence check.

Missing inputs are blockers. Do not guess project ids, refs, components,
profiles, actions, or health checks.

## Evidence

Report:

- HiveForge target,
- HiveForge version,
- environment id,
- project id,
- ref/release,
- component,
- action,
- profile,
- operation id,
- final status,
- relevant journal event ids or summaries.

Do not include secret values.
