# HiveForge POC Spec

## Status

Draft POC specification.

## Goal

Prove HiveForge can deploy HiveWatch from a git repository using explicit
project and component manifests, without any PocketHive-specific behavior.

## Non-Goals

- HiveForge is not a container runtime.
- HiveForge is not a scheduler.
- HiveForge is not a secrets engine.
- HiveForge is not a generic Proxmox replacement.
- HiveForge does not infer deployment behavior from Docker Compose.
- HiveForge does not manage components without manifests.

Proxmox or infrastructure provisioning may be supported later through explicit
adapters, but that is outside the first POC.

## Deployment Model

HiveForge runs on the target environment as a container.

Operators and AI agents connect to that environment through:

- UI
- MCP tools
- REST API

HiveForge then:

1. accepts a project selection from a project registry,
2. checks out an explicit git ref,
3. reads the root `hiveforge.yaml`,
4. reads component manifests listed by the root manifest,
5. validates requirements,
6. executes a declared action through a declared adapter,
7. records the operation in an append-only journal.

## Managed Component Rule

A component is HiveForge-managed only if both conditions are true:

1. The root project manifest lists the component.
2. The component has its own `hiveforge.yaml`.

Everything else is ignored, including services present in `docker-compose.yml`.

This avoids implicit `stack-managed` behavior. If a component is important enough
for HiveForge to operate, it gets a manifest and explicit actions.

## Static Resource Rule

For HiveWatch first, and PocketHive later:

If a Compose service requires static resources, it should become a managed
component with its own deployment action bundle.

Static resources include:

- named volumes,
- bind-mounted directories,
- config files,
- init scripts,
- provisioning directories,
- dashboards,
- certificate files,
- secret references,
- starter data.

The component action owns copying or preparing those resources. HiveForge does
not guess what to copy.

## Root Manifest Sketch

```yaml
project:
  name: hivewatch
  repository: https://github.com/sepa79/HiveWatch.git
  actions:
    - deploy
    - remove
    - update

components:
  - name: api
    manifest: components/api/hiveforge.yaml
  - name: ui
    manifest: components/ui/hiveforge.yaml
  - name: postgres
    manifest: components/postgres/hiveforge.yaml
```

## Component Manifest Sketch

```yaml
component:
  name: postgres
  project: hivewatch

deployment:
  adapter: ansible
  actions:
    deploy:
      playbook: ansible/deploy.yml
    remove:
      playbook: ansible/remove.yml
    update:
      playbook: ansible/update.yml

requirements:
  volumes:
    - hivewatch-postgres-data
  secrets:
    - hivewatch-postgres-password
  environment:
    - HIVEWATCH_POSTGRES_PORT
```

The root manifest uses explicit component manifest paths. HiveForge does not
derive component manifest locations from names.

## NFF Requirements

- No adapter fallback.
- No action fallback.
- No implicit deploy command generation.
- No automatic Compose service adoption.
- No checkout of arbitrary repositories outside the project registry.
- No secret values in logs, API responses, UI, or MCP output.
- Missing requirement means explicit validation failure.

## MVP Capabilities

REST:

- register or select project from project registry
- checkout explicit git ref
- inspect project manifest
- list managed components
- validate project/component
- run declared component action
- read operation journal

MCP:

- `list_projects`
- `list_environments`
- `list_deployments`
- `inspect_repository`
- `inspect_project`
- `validate_requirements`
- `start_action`
- `get_operation`
- `list_operations`
- `read_journal`

UI:

- environment connection view
- project selection
- ref selection
- managed component list
- validation report
- action runner
- operation journal

## Acceptance Criteria

1. HiveForge starts as a container on a target Docker/Swarm host.
2. HiveForge can checkout HiveWatch from a registered repository at an explicit
   branch, tag, or SHA.
3. HiveForge reads the HiveWatch root manifest.
4. HiveForge lists only components declared in the root manifest.
5. HiveForge rejects a listed component if its component manifest is missing.
6. HiveForge validates declared volumes, secrets, environment variables, and
   action files before deployment.
7. HiveForge runs a declared Ansible `deploy` action for one HiveWatch component.
8. HiveForge records start time, end time, target ref, action, result, and reason
   in an append-only journal.
9. API, UI, MCP output, and journal entries do not expose secret values.

## Later PocketHive Extension

PocketHive adopts the same pattern after HiveWatch validates the POC:

- root `hiveforge.yaml`,
- explicit component list,
- component manifests only for HF-managed components,
- Ansible action bundles next to component assets,
- no automatic treatment of unrelated Compose services.
