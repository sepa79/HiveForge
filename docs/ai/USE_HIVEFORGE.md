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
HIVEFORGE_AUTH_TOKEN="$(cat /opt/hiveforge/auth-token)" \
npm run hiveforge-mcp
```

Use the installed host's `auth-token` file when HiveForge generated the token
on first start. MCP connects to REST and does not use `HIVEFORGE_BASE_DIR` or
read runtime files directly.

Do not invent endpoints or tokens.

## Normal Flow

Use MCP tools in this order:

1. `check_health`
2. `get_hiveforge_info`
3. `list_environments`
4. `list_projects`
5. `list_deployments`
6. `inspect_repository` only for a candidate repository/ref not yet registered
7. `register_project` only after inspection succeeds and the operator approves
8. `inspect_project`
9. `validate_requirements`
10. `deploy_release` for release/image-tag prepare checks, or `start_action` for
   the current repo/ref POC lifecycle path
11. `get_operation`
12. `read_journal`

`deploy_release` currently prepares and validates a release plan only. It does
not build images, push images, or execute deployment actions. With `gitRef`, it
also checks out the project, prepares declared `artifacts.managedPaths`, writes
`HIVEFORGE_ARTIFACTS_DIR/release-vars.json`, and validates explicit
`requiredFiles`.

## Required Inputs

Before starting an action, confirm:

- active HiveForge target,
- project id,
- git ref or release input required by the current contract,
- component,
- action,
- profile,
- git ref when using checkout-backed `deploy_release`,
- release vars such as `release.imageTag` when using `deploy_release`,
- registry vars such as `imageRepository.project` when using `deploy_release`,
- release image templates or a release artifact template when using
  `deploy_release`,
- required runtime files under `HIVEFORGE_PROJECT_DIR` when the release deploy
  depends on copied files,
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
