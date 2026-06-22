# MCP Tool Contract

## Status

Draft POC contract.

## Rule

MCP tools call the HiveForge REST API with an explicit bearer token. MCP must
not add alternate deployment logic, action fallbacks, or manifest discovery.

For users and AI operators, MCP is the only supported HiveForge operation
interface. REST is the internal transport behind MCP and a maintainer
development/debug surface; it is not a user fallback.

## Configuration

The MCP process fails fast unless both variables are set:

- `HIVEFORGE_BASE_URL`
- `HIVEFORGE_AUTH_TOKEN`

For the default Docker Compose / Portainer install, `HIVEFORGE_AUTH_TOKEN` can
be read from the generated runtime-root token file:

```bash
HIVEFORGE_BASE_URL=http://<host>:3000 \
HIVEFORGE_AUTH_TOKEN="$(cat /opt/hiveforge/auth-token)" \
npm run hiveforge-mcp
```

MCP does not read runtime files directly. Only the HiveForge REST server owns
the runtime root and runtime files.

The optional client-side target launcher reads the selected endpoint from a
local known-targets file instead of requiring those variables directly:

```bash
npm run hf-target -- use small
npm run hiveforge-mcp-target
```

`hiveforge-mcp-target` resolves the active target, reads the token from the
target's configured environment variable, and then starts the same MCP tool
server against that one HiveForge endpoint.

## Endpoint Selection

HiveForge MCP connects to one HiveForge REST endpoint. That endpoint is the
operator for one concrete environment. The MCP client may keep a local list of
known HiveForge endpoints, but that list is only connection metadata:

```yaml
knownHiveForges:
  - id: small
    name: Small Docker
    baseUrl: http://192.0.2.10:3100
    authTokenEnv: HF_SMALL_TOKEN
  - id: big
    name: Big Swarm
    baseUrl: http://192.0.2.20:3100
    authTokenEnv: HF_BIG_TOKEN
```

The client-side `id` and `name` are not deployment facts and must not be used
to infer runtime, placement, storage, registry mirrors, or project eligibility.
After connecting, clients must ask the selected HiveForge endpoint for its
current environment and capabilities with `list_environments`.

Use `check_health` to verify that the currently connected HiveForge endpoint is
serving HTTP before running operator workflows. To check another configured
target, switch the active target with `hf-target use <target-id>` and start MCP
for that target.

The HiveForge service response is the source of truth for:

- reported environment id and kind,
- runtime capabilities,
- managed root availability and whether it is shared,
- placement capabilities and node vocabulary,
- environment policy,
- current deployment inventory.

To operate another Docker host or Swarm, the user connects to another
environment-local HiveForge endpoint. Deployment tools do not accept a Docker
target, `DOCKER_HOST`, or environment id that redirects execution to another
environment. Any implementation detail such as Docker context, SSH target, or
provider credentials belongs to the environment-local HiveForge service.

If the friendly name or cached client metadata disagrees with the reported
environment, the reported environment wins. Clients should display both the
friendly connection name and the reported environment before destructive or
state-changing actions.

## Tools

### `check_health`

Input: none.

Output: connected endpoint health from `GET /health`, including `status` and
HiveForge service metadata.

This checks only the currently connected HiveForge endpoint. It does not fan
out to every client-side known target.

### `get_hiveforge_info`

Input: none.

Output: HiveForge service name and version for the connected target.

### `list_projects`

Input: none.

Output: registered project IDs, names, repositories, and approved refs.

### `list_environments`

Input: none.

Output: current environment and known environment metadata/capabilities.
When configured, environment metadata includes project policy for allowed
project/profile/action combinations.
The human-facing `name` and optional `description` come from `environments.yaml`
and should be shown by clients when identifying the connected target.

Capabilities are structured as described in `docs/specs/capabilities.md`. For
release deployment, clients must treat them as reported environment facts, not
as provider-specific target mappings.

When a connected HiveForge instance reports Swarm node inventory, each node
entry contains Docker node id, hostname, role, availability, status, and labels.
Node inventory does not include host mount discovery.

`list_environments` reads the current stored inventory. It does not refresh
Docker/Swarm labels implicitly.

### `refresh_environment`

Input: none.

Output: refreshed current environment and known environment metadata.

Behavior: explicitly re-run local environment detection for the current
HiveForge target. On Swarm managers this refreshes node inventory and node
labels, then rewrites `environments.yaml`. The refresh fails if detection
reports a different current environment id.

### `list_environment_nodes`

Input: none.

Output: current environment id, current environment name, and current node
inventory. Each node includes Docker node id, hostname, role, availability,
status, and labels.

Behavior: read-only. This tool does not refresh the environment. Use
`refresh_environment` first when Docker node labels or node membership changed.

### `list_deployments`

Input: none.

Output: deployment inventory for the current environment, read from HiveForge
state DB. Each deployment includes `deploymentId`, `deploymentName`, project,
component, profile, current status, last action, operation id, and update
timestamp.

### `diagnose_hiveforge_runtime`

Input: none.

Output: read-only diagnostics for the connected HiveForge service:

- fixed HiveForge runtime root and derived paths,
- derived registry, environment, workspace, journal, data, and runtime-env
  paths with local read/write status,
- current environment id/name/kind,
- managed-root mapping from control-plane path to node-visible path when
  configured,
- `configured` vs `unknown` visibility status for runtime-node bind-source
  access,
- action contract path names exposed to project actions.

This does not verify every Swarm node can access `managedRoot.bindSourceRoot`; active
per-node probing is a separate runtime diagnostics slice.

### `check_deployment_runtime_status`

Input:

```json
{
  "deploymentId": "deployment-..."
}
```

Preferred input is `deploymentId` from `list_deployments`. As a convenience,
clients may provide `projectId` plus `component`, and optional `profile`; the
connected HiveForge target resolves that selector through its state DB.

Output: live Docker runtime status for objects matching the exact HiveForge
deployment label:

- `hiveforge.deployment=<deploymentId>`.

The result includes the deployment id, project/component/profile resolved from
state DB, required label map, matching containers, matching Swarm services when
the connected environment has Docker Swarm capability, and a summary of
`running`, `unhealthy`, `exited`, `missing`, or `unknown`. Container entries may
include Docker inspect hints such as restart count, exit code, Docker state
error, and start/finish timestamps. Swarm task entries include node, current
state, desired state, and Docker task error when available.

Behavior: read-only. This tool does not infer ownership from container names,
service names, stack names, or compose file names. If no labelled Docker objects
match, the result is an explicit `missing` status with a reason.

### `diagnose_deployment`

Input:

```json
{
  "deploymentId": "deployment-..."
}
```

Preferred input is `deploymentId` from `list_deployments`. As with
`check_deployment_runtime_status`, the REST transport can resolve `projectId`
plus `component`, and optional `profile`; the MCP tool requires `deploymentId`
so agents use the explicit deployment inventory object.

Output: one read-only deployment debug view containing:

- HiveForge deployment state from SQLite,
- live Docker runtime status selected only by `hiveforge.deployment=<deploymentId>`,
- recorded rendered Compose/Stack artifact for the deployment's last operation,
- bind-source validation for that recorded Compose artifact,
- HiveForge runtime path and managed-root diagnostics,
- an `analysis` section that correlates expected rendered Compose services,
  images, bind mounts, and placement constraints with actual Docker
  containers/services/tasks.

The `analysis.findings` list reports actionable issues such as:

- missing labelled Docker resources,
- service replica mismatch,
- Swarm placement mismatch such as `no suitable node`,
- bind mount errors tied to the rendered service, source path, target path, and
  node when Docker exposes that evidence,
- container restart loops from Docker inspect,
- repeated failed Swarm tasks and last-exit hints from Swarm task state.

Behavior: read-only. This tool does not re-render Compose, does not infer
ownership from Docker object names, does not run project actions, and does not
fetch full container logs.

### `get_deployment_compose`

Input:

```json
{
  "operationId": "op-..."
}
```

Output: the rendered Compose/Stack artifact recorded for a completed lifecycle
operation. The response includes artifact path, recorded digest/size, current
digest/size, whether the current digest still matches the journal, redacted
content when the artifact is readable, and an explicit `missing` result when no
artifact was recorded or the recorded file is no longer readable.

Behavior: read-only. HiveForge returns only the artifact recorded by the action
journal. It does not re-render Compose from the current checkout and does not
guess artifact paths. Secret-looking lines are redacted before content is
returned through MCP.

### `list_operations`

Input: none.

Output: process-local lifecycle operations retained by the running HiveForge
server.

### `get_operation`

Input:

```json
{
  "operationId": "uiop-..."
}
```

Output: operation status and logs.

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
run project actions. Supported repository inputs are explicit GitHub HTTPS URLs,
explicit `file:///` Git URLs, and explicit LAN/internal `http://` Git URLs whose
path ends in `.git`.

Output: deployability result, project metadata, component names, lifecycle
actions, and an explicit reason when not deployable.

### `register_project`

Input:

```json
{
  "repository": "https://github.com/sepa79/HiveWatch.git",
  "gitRef": "main",
  "registrationKind": "official"
}
```

Behavior: run read-only repository inspection. If the repository/ref is
deployable, register the project and approve the inspected ref.
`registrationKind` is optional and defaults to `official`, which uses the
project id from the manifest. `development` registers the same manifest as a
separate `<project>-development` project id so an internal development
repository can coexist with the official repository explicitly.

Output: registered project metadata and `deployable: true`.

### `set_environment_project_policy`

Input:

```json
{
  "environmentId": "docker",
  "projectId": "hivewatch",
  "profiles": ["normal", "test"],
  "actions": ["deploy", "remove", "update"]
}
```

Behavior: explicitly allow one registered project on one known environment for
the provided lifecycle actions and optional profiles. This updates environment
policy only. It does not register repositories, create runtime resources,
provision secrets, infer profiles, or run project actions.

Output: environment id and the saved project policy.

### `list_project_runtime_env`

Input:

```json
{
  "projectId": "hivewatch"
}
```

Behavior: list non-secret runtime env entries stored outside the project
repository for one registered project. Values are returned because this is not a
secret store.

Output: project id and scoped runtime env entries.

### `set_project_runtime_env`

Input:

```json
{
  "projectId": "hivewatch",
  "profile": "test",
  "values": {
    "IMAGE_TAG": "latest",
    "PUBLIC_URL": "http://192.0.2.10:18180"
  }
}
```

Behavior: set or update non-secret runtime env values for the exact
project/profile scope. `profile` is optional. Keys must be uppercase env names
and must not start with `HIVEFORGE_`.

Call this before `validate_requirements` and `start_action` when a project or
profile needs non-secret runtime values. The values are used by future
validation/action calls only. Changes are not retroactive, do not re-render
recorded deployment artifacts, and do not update an already deployed service.

Output: updated entry values and changed key names.

### `unset_project_runtime_env`

Input:

```json
{
  "projectId": "hivewatch",
  "profile": "test",
  "keys": ["IMAGE_TAG"]
}
```

Behavior: remove non-secret runtime env keys from the exact project/profile
scope.

Output: remaining entry values and removed key names.

### `inspect_project`

Input:

```json
{
  "projectId": "hivewatch",
  "gitRef": "main"
}
```

Behavior: checkout registered ref and load root/component manifests.

Output: operation ID, project metadata, and managed components.

### `validate_requirements`

Input:

```json
{
  "projectId": "hivewatch",
  "gitRef": "main"
}
```

Behavior: checkout, inspect, and validate the selected profile against the
current HiveForge environment, then validate declared requirements.
Resolved runtime env for the selected project/profile can satisfy manifest
`requirements.environment` entries.

Output: operation ID, `ok`, and validation issues. Ineligible profiles are
explicit validation failures; for example a `docker-swarm` profile is rejected
on a `docker-single` environment before an action can start.

### `explain_deploy_prerequisites`

Input:

```json
{
  "projectId": "pockethive",
  "gitRef": "v1.2.3",
  "component": "stack",
  "action": "deploy",
  "profile": "swarm-reduced",
  "deploymentMode": "release"
}
```

Behavior: return a read-only checklist before calling `start_action` or
`prepare_release_deploy`. This tool does not create Docker labels, secrets,
volumes, runtime env values, managed files, or mounts.

The first 0.5 slice reports:

- project registration and approved ref status,
- project manifest load status,
- component and component action declaration status,
- environment policy status,
- profile eligibility status,
- missing Docker volumes and secrets by name only,
- missing non-secret runtime env keys,
- release-mode presence checks for `release.imageTag`,
  `imageRepository.project`, and image/artifact templates.

Output:

```json
{
  "ready": false,
  "manualPrerequisites": [],
  "hiveforgePrerequisites": [],
  "releasePrerequisites": []
}
```

`deploymentMode` defaults to `action`. Use `deploymentMode: "release"` when the
next operation is `prepare_release_deploy`.

### `start_action`

Input:

```json
{
  "projectId": "hivewatch",
  "gitRef": "main",
  "component": "api",
  "action": "deploy",
  "profile": "test",
  "deploymentName": "hivewatch-canary"
}
```

Behavior: start checkout, inspect, validate, then run the declared action.
`action` must be one of `deploy`, `remove`, `purge`, `update`, or `upgrade`.
`profile` is optional at the tool contract level, but projects may declare it as
a required environment variable. Environment policy may also require and limit
profiles.
Resolved runtime env for the selected project/profile is passed into validation
and the declared action process.
`deploymentName` is optional. When omitted for a new deployment slot, HiveForge
uses the project id as the Docker Compose project name or Docker Swarm stack
name. When supplied, it must be a Docker-safe lower-case name. Existing slots
keep their stored deployment name and cannot be silently renamed by a later
request.

Output: operation ID, status, and current logs. Use `get_operation` to poll live
logs and final stdout/stderr. If the underlying action command fails, the
operation error includes the failed command, exit status, and working directory;
operation logs also include redacted stdout/stderr tails when the command
captured output.

### `prepare_release_deploy`

Input:

```json
{
  "projectId": "pockethive",
  "gitRef": "v1.2.3",
  "component": "stack",
  "action": "deploy",
  "profile": "swarm-reduced",
  "vars": {
    "imageRepository.project": "192.168.88.54:5000/pockethive"
  },
  "releaseVars": {
    "release.imageTag": "dev-20260521-1415-gabc1234"
  },
  "artifact": {
    "env": {
      "DOCKER_REGISTRY": "{{ imageRepository.project }}/",
      "POCKETHIVE_VERSION": "{{ release.imageTag }}"
    },
    "images": [
      {
        "name": "orchestrator",
        "image": "{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}",
        "application": true
      }
    ]
  },
  "requiredFiles": [
    "artifacts/runtime/compose/docker-compose.yml"
  ]
}
```

Behavior: validate and prepare a release/image-tag deployment plan. This tool
does not build images, push images, infer `latest`, infer tags from branches, or
execute deployment actions. When `gitRef` is supplied, HiveForge checks out the
project, prepares declared `artifacts.managedPaths` into the managed project
root, writes the release vars file under the managed artifacts tree, and
validates `requiredFiles` before returning the plan. When `gitRef` is omitted,
callers must provide explicit `project` metadata for pure plan preparation.

Output: resolved release deployment plan, including merged vars and rendered
image refs. When `artifact.env` is supplied, output also includes rendered env
values such as `DOCKER_REGISTRY` and `POCKETHIVE_VERSION`. Checkout-backed
output also includes managed project root metadata and `HIVEFORGE_RELEASE_VARS_FILE`.

### `read_journal`

Input: none.

Output: journal events validated by `docs/specs/journal/event.schema.json`.

## Failure Handling

Failures are explicit tool errors and are also recorded in the journal by the
underlying services where operation context exists. Secret values must not be
returned.

## Release Deployment Gap

The POC exposes generic lifecycle actions through `start_action`. The target
managed-service v1 contract is release-driven and is defined in
`docs/specs/releases.md`. HiveMind/PocketHive deployment needs an explicit tool
for deploying or upgrading a project/component to a selected release or image
tag set, with the release carried as a typed field instead of hidden inside
generic action parameters.

Target MCP additions:

- `list_environment_capabilities` - return environment-local capability reports
  using the structured capability contract.
- `match_project_profiles` - return eligible and ineligible profile/environment
  pairs with explicit missing capability issues.
- `prepare_release_deploy` - currently validates and prepares an explicit
  release/image tag set. Action execution is intentionally deferred until
  release artifact rendering is explicit. This tool must not build, push, infer
  `latest`, infer tags from branches, or select fallback profiles.
