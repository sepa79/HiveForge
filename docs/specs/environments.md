# Environments

## Status

Draft contract.

## Rule

An environment is a concrete deployment target known to HiveForge. Environment
configuration is explicit and loaded from `HIVEFORGE_ENVIRONMENTS_PATH` in the
current POC.

The current POC exposes environments through REST so UI and MCP clients can
discover where operations are running. Deployment authorization comes from the
project registry plus environment-scoped project policy.

For the target managed-service contract, an environment is represented by an
environment-local HiveForge service. That service reports capabilities for its
own runtime/provider implementation. Project manifests stay portable.

Client-side endpoint lists are not environment configuration. A CLI, UI, or MCP
client may remember known HiveForge endpoints by friendly name and URL, but
after connecting it must treat the environment-local HiveForge response as the
source of truth for capabilities, policy, deployment inventory, and current
environment identity.

Users switch between a small Docker host and a larger Docker Swarm by choosing
which HiveForge endpoint to connect to. They do not pass an environment id that
makes one HiveForge instance deploy into another environment.

## Shape

Environment config is validated by `docs/specs/config/environments.schema.json`.

Each environment declares:

- `id`
- `name`
- `kind`
- `capabilities`
- `nodes`, when the environment reports runtime node inventory
- `policy.projects`

Capabilities use the vocabulary in `docs/specs/capabilities.md`.

Example:

```yaml
capabilities:
  runtime:
    - docker-swarm
  managedRoot:
    shared: false
    bindSourceRoot: /mnt/shared_nfs/hiveforge
    nodes:
      - docker-swarm-mgr-1
  placement: true
nodes:
  - id: hbx9486iqq0g5obsnhre9zx4f
    hostname: docker-swarm-mgr-1
    role: manager
    availability: active
    status: ready
    labels:
      pockethive.postgres: "true"
```

`managedRoot` means the environment-local HiveForge service has one configured
managed data root. HiveForge derives its own control-plane path internally,
normally `/hf/data`. `bindSourceRoot` is the host-side runtime root Docker sees
for the same mount, such as `/opt/hiveforge` for `/opt/hiveforge:/hf`.
HiveForge derives managed project bind sources under `<bindSourceRoot>/data`.
Project manifests do not declare those paths. HiveForge does not create
arbitrary host mount points.

`managedRoot.shared: true` means the root is available to every node that may
run the selected profile. `managedRoot.shared: false` means only listed nodes
have that root. HiveForge does not pick a node automatically; profiles that use
a non-shared root must declare the target node explicitly.

`nodes` is runtime node inventory. For Docker Swarm autodetection it records
Docker node id, hostname, role, availability, status, and labels. It is exposed
through REST/MCP/UI as environment metadata. It is not mount inventory:
HiveForge does not discover, infer, create, or repair external host mount
points from this field.

Node inventory is not refreshed implicitly while the server is running.
Operators can request an explicit refresh through `POST /environments/refresh`
or the UI Overview node inventory action. The refresh re-runs the local provider
detection, updates the current environment runtime fields such as Swarm nodes
and labels, and preserves operator-owned `capabilities.managedRoot`,
`policy.projects`, and `vars` for the same environment id. If autodetection
reports a different environment id, the refresh fails explicitly instead of
switching environments silently.

Environment config may also declare deployment var overrides:

```yaml
vars:
  imageRepository.project: registry.lan:5000/pockethive
  extRepository.docker: company-cache.example.com/dockerhub
  extRepository.ghcr: company-cache.example.com/ghcr
```

Vars are not capabilities. They are explicit inputs for rendering release
artifacts and image references.

## Private Environment Files

Operator-specific environment files may contain private node names, registry
aliases, project policies, and local paths. Keep those files outside the
repository or use ignored `*.local.yaml` / `*.local.yml` files.

Public examples should use placeholder-safe values only. Do not commit private
IP addresses, hostnames, registry mirrors, storage paths, or credentials.

Example local workflow:

```bash
cp examples/hivewatch/environments.yaml tmp/environments.local.yaml
HIVEFORGE_ENVIRONMENTS_PATH=tmp/environments.local.yaml \
  HIVEFORGE_PROJECT_REGISTRY_PATH=examples/hivewatch/projects.yaml \
  HIVEFORGE_AUTH_TOKEN=local-dev-token \
  npm run serve
```

## Policy

Policy is required for configured environments and is enforced before lifecycle
actions run. The first POC policy supports:

- registered project ids,
- allowed profiles per project,
- allowed lifecycle actions per project.

Repository refs remain controlled by the project registry. Repository inspection is
read-only and does not authorize deployment.

## Eligibility

Profile eligibility is computed before lifecycle action execution:

```text
profile requirements subset-of environment capabilities
```

Missing capabilities produce structured validation issues. Missing capabilities
must not trigger fallback profile selection, runtime switching, or
provider-specific inference.
