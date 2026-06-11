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
Provide requiredFiles for runtime files that must exist under HIVEFORGE_PROJECT_DIR after managedPaths.
Validate the resolved app image refs and report blockers.
Do not build images, push images, execute deployment actions, infer tags, or use REST.
```

## Diagnose Failure

```text
Use HiveForge MCP tools to inspect operation <operation-id> and read the journal.
Summarize what failed, where it failed, and what explicit input/config should change.
Do not use REST.
```
