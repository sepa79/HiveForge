# Use HiveForge Through MCP

This is the operator runbook for AI agents.

## Hard Rule

AI agents and users operate HiveForge through MCP.

REST is not a user/operator interface. REST exists for HiveForge implementation,
development, and debugging by HiveForge maintainers. Do not instruct users to
call REST directly for normal operations.

There is no REST fallback for users.

## Connect

When helping a user configure an MCP client, first identify the client and
configuration surface. VS Code Copilot, Amazon Q IDE, Amazon Q CLI, and other
clients do not share one universal config file. Use
[MCP client setup](../install/mcp-clients.md) and translate the canonical
HiveForge stdio command into the user's client.

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
Do not configure the HiveForge REST URL as a remote MCP HTTP endpoint.

Do not invent endpoints or tokens.

## Normal Flow

Use MCP tools in this order:

1. `check_health`
2. `get_hiveforge_info`
3. `get_operator_workflows` when the agent needs the built-in production,
   development, or HiveForge-maintainer playbook before acting
4. `list_environments`
5. `refresh_environment` when Docker/Swarm node labels or node membership may
   have changed
6. `list_environment_nodes` when node inventory or placement labels matter
7. `list_projects`
8. `list_deployments`
9. `inspect_repository` only for a candidate repository/ref not yet registered
10. `register_project` only after inspection succeeds and the operator approves
11. `unregister_project_ref` only when the operator explicitly wants to remove an
   old ref from an existing project registration
12. `set_environment_project_policy` only after the operator approves the
   environment, actions, and profiles for that project
13. `set_project_runtime_env` for non-secret values that must stay outside git
14. `inspect_project`
15. `explain_deploy_prerequisites`
16. `validate_requirements`
17. `prepare_release_deploy` for release/image-tag prepare checks, or
   `start_action` for the current repo/ref POC lifecycle path
18. `get_operation`
19. `get_deployment_compose` when the action recorded a rendered Compose/Stack
   artifact
20. `check_deployment_runtime_status` after deployment execution, using the
   `deploymentId` from `list_deployments`
21. `read_journal`

`prepare_release_deploy` currently prepares and validates a release plan only.
It does not build images, push images, or execute deployment actions. With
`gitRef`, it also checks out the project, prepares declared
`artifacts.managedPaths`, writes `/hf/artifacts/release-vars.json`,
and validates explicit
`requiredFiles`.

`get_deployment_compose` returns the recorded rendered Compose/Stack artifact
for one operation. It does not re-render current source. `check_deployment_runtime_status`
checks Docker containers/services by the single `hiveforge.deployment` label
resolved from HiveForge state DB; it does not infer ownership from names.

When the connected target is a Full node, use `get_managed_repositories_info`
to discover the shared Forgejo Git service and OCI registry. For normal
projects, the user or agent still builds, `git push`es, and `docker push`es
manually, then uses the existing HiveForge deployment workflow with an explicit
image reference. The same manual artifact flow may also be used for HiveForge
maintainer development on that Full node: push Git changes, build and push a
development image, then update the HiveForge service manually. Do not use
`Update HF` for development images; that UI flow is reserved for published
official releases.

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
- required runtime files under `/hf/artifacts` when the release deploy depends
  on managed runtime files,
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
- deployment id when available,
- component,
- recorded compose artifact digest/status when available,
- live Docker runtime summary from `check_deployment_runtime_status`,
- action,
- profile,
- operation id,
- final status,
- relevant journal event ids or summaries.

Do not include secret values.
