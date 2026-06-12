# HiveForge AI Prompts

Use these prompts when asking an AI agent to operate HiveForge.

## Prepare Install

```text
Help me prepare a Docker Compose or Portainer installation for HiveForge on host <host>.
Use deploy/docker-compose.hiveforge.yml as the base.
Generate docker-compose.hiveforge.yml, projects.yaml, environments.yaml, and a short runbook.
Ask for missing host paths, token source, image tag, project registry, or environment policy.
Do not invent secrets, registry entries, profiles, or actions.
Do not run the installation unless I explicitly ask you to.
```

## Configure MCP Client

```text
Help me configure HiveForge MCP in my MCP client.
First ask which client I use: VS Code Copilot, Amazon Q IDE, Amazon Q CLI, or another MCP client.
Use docs/install/mcp-clients.md as the source of truth.
Do not assume VS Code mcp.json works for Amazon Q or other clients.
Configure HiveForge as a local stdio MCP server that runs docker in the foreground.
Do not configure the HiveForge REST URL as a remote MCP HTTP server.
Ask for the HiveForge base URL, auth token source, image tag, and user/global vs workspace/local scope.
Do not ask me to paste a token into chat when the client supports a password prompt or local environment variable.
Verify the connection with check_health, get_hiveforge_info, list_environments, and list_projects.
```

## Inspect Candidate Repository

```text
Use HiveForge MCP tools to inspect repository <repo-url> at ref <ref>.
Tell me whether it is deployable and list any explicit blockers.
Do not use REST.
```

## Register Project

```text
Use HiveForge MCP tools to inspect and register repository <repo-url> at ref <ref>.
Register only if inspection succeeds.
Ask before registering if project id, ref, or policy is ambiguous.
Do not use REST.
```

## Validate Deployment

```text
Use HiveForge MCP tools to validate project <project-id> at ref <ref> with profile <profile>.
Report missing requirements and journal evidence.
Do not use REST.
```

## Run Action

```text
Use HiveForge MCP tools to run action <action> for project <project-id>, ref <ref>,
component <component>, profile <profile>.
Poll the operation and summarize final status with journal evidence.
Do not use REST.
```

## Prepare Release Deployment

```text
Use HiveForge MCP prepare_release_deploy to prepare a release deployment for project <project-id>,
ref <ref>, component <component>, action <action>, profile <profile>.
Use release.imageTag=<tag> and imageRepository.project=<registry/namespace>.
Use a release artifact template when available instead of manually inventing image lists.
Use gitRef=<ref> when runtime files must be prepared from the checked-out repository.
Provide requiredFiles for runtime files that must exist under the project action root `/hf` after managedPaths.
Validate the resolved app image refs and report blockers.
Do not build images, push images, execute deployment actions, infer tags, or use REST.
```

## Diagnose Failure

```text
Use HiveForge MCP tools to inspect operation <operation-id> and read the journal.
Summarize what failed, where it failed, and what explicit input/config should change.
Do not use REST.
```
