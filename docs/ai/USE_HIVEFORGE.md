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
on first start. MCP connects to REST and does not read runtime files directly.

Do not invent endpoints or tokens.

## Normal Flow

Use MCP tools in this order:

1. `check_health`
2. `get_hiveforge_info`
3. `list_environments`
4. `refresh_environment` when Docker/Swarm node labels or node membership may
   have changed
5. `list_environment_nodes` when node inventory or placement labels matter
6. `list_projects`
7. `list_deployments`
8. `inspect_repository` only for a candidate repository/ref not yet registered
9. `register_project` only after inspection succeeds and the operator approves
10. `set_environment_project_policy` only after the operator approves the
   environment, actions, and profiles for that project
11. `set_project_runtime_env` for non-secret values that must stay outside git
12. `inspect_project`
13. `explain_deploy_prerequisites`
14. `validate_requirements`
15. `prepare_release_deploy` for release/image-tag prepare checks, or
   `start_action` for the current repo/ref POC lifecycle path
16. `get_operation`
17. `read_journal`

`prepare_release_deploy` currently prepares and validates a release plan only.
It does not build images, push images, or execute deployment actions. With
`gitRef`, it also checks out the project, prepares declared
`artifacts.managedPaths`, writes `HIVEFORGE_ARTIFACTS_DIR/release-vars.json`,
and validates explicit
`requiredFiles`.

## Required Inputs

Before starting an action, confirm:

- active HiveForge target,
- project id,
- git ref or release input required by the current contract,
- component,
- action,
- profile,
- non-secret runtime env required by manifest `requirements.environment`,
- git ref when using checkout-backed `prepare_release_deploy`,
- release vars such as `release.imageTag` when using
  `prepare_release_deploy`,
- registry vars such as `imageRepository.project` when using
  `prepare_release_deploy`,
- release image templates or a release artifact template when using
  `prepare_release_deploy`,
- required runtime files under `HIVEFORGE_PROJECT_DIR` when the release deploy
  depends on copied files,
- expected health/evidence check.

Missing inputs are blockers. Do not guess project ids, refs, components,
profiles, actions, or health checks.

Use `explain_deploy_prerequisites` before `start_action` or
`prepare_release_deploy` when a project/ref/component/action/profile is known.
It reports manual prerequisites such as Docker volumes and secrets by name, plus
HiveForge-managed prerequisites such as policy, approved refs, profile
eligibility, and runtime env keys. It does not create missing resources.

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
