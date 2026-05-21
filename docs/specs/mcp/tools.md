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

Capabilities are structured as described in `docs/specs/capabilities.md`. For
release deployment, clients must treat them as reported environment facts, not
as provider-specific target mappings.

### `list_deployments`

Input: none.

Output: deployment inventory for the current environment, derived from
succeeded lifecycle actions in the journal.

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
run project actions.

Output: deployability result, project metadata, component names, lifecycle
actions, and an explicit reason when not deployable.

### `register_project`

Input:

```json
{
  "repository": "https://github.com/sepa79/HiveWatch.git",
  "gitRef": "main"
}
```

Behavior: run read-only repository inspection. If the repository/ref is
deployable, register the project and approve the inspected ref.

Output: registered project metadata and `deployable: true`.

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

Behavior: checkout, inspect, and validate declared requirements.

Output: operation ID, `ok`, and validation issues.

### `start_action`

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

Behavior: start checkout, inspect, validate, then run the declared action.
`action` must be one of `deploy`, `remove`, `purge`, `update`, or `upgrade`.
`profile` is optional at the tool contract level, but projects may declare it as
a required environment variable. Environment policy may also require and limit
profiles.

Output: operation ID, status, and current logs. Use `get_operation` to poll live
logs and final stdout/stderr.

### `deploy_release`

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
    "artifacts/pockethive-runtime/compose/docker-compose.yml"
  ]
}
```

Behavior: validate and prepare a release/image-tag deployment plan. This tool
does not build images, push images, infer `latest`, infer tags from branches, or
execute deployment actions. When `gitRef` is supplied, HiveForge checks out the
project, prepares declared `artifacts.managedPaths` into the managed project
root, writes `HIVEFORGE_ARTIFACTS_DIR/release-vars.json`, and validates
`requiredFiles` before returning the plan. When `gitRef` is omitted, callers must
provide explicit `project` metadata for pure plan preparation.

Output: resolved release deployment plan, including merged vars and rendered
image refs. When `artifact.env` is supplied, output also includes rendered env
values such as `DOCKER_REGISTRY` and `POCKETHIVE_VERSION`. Checkout-backed
output also includes managed root env values and `HIVEFORGE_RELEASE_VARS_FILE`.

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
- `deploy_release` - currently validates and prepares an explicit release/image
  tag set. Action execution is intentionally deferred until release artifact
  rendering is explicit. This tool must not build, push, infer `latest`, infer
  tags from branches, or select fallback profiles.
