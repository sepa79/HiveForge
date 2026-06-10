# Runtime Container Contract

## Status

Draft contract for the HiveForge POC deploy container.

## Rule

The HiveForge deploy container is self-contained for the first POC runtime. It
contains:

- Node.js runtime for HiveForge,
- git for registered repository checkout,
- Ansible for declared `ansible` adapter actions,
- Docker CLI for target Docker/Swarm requirement checks,
- SSH client and CA certificates for repository access.

The target host must provide Docker/Swarm control access required by the
checked-out playbooks, but it must not be required to provide Ansible.

## Required paths

The preferred container install uses one mounted HiveForge runtime root:

- fixed container path `/hf`
- host bind mount, for example `/opt/hiveforge:/hf`

For Swarm stack and Portainer installs, the runtime root should be backed by a
host bind or shared filesystem mounted at `/hf`. Relative host bind mounts such
as `./:/hf` are only for `docker compose up` on one known manager node and do
not provide a portable host-visible path contract.

This mode is mutually exclusive with explicit runtime paths. HiveForge
initializes missing runtime files and directories under the runtime root:

```text
<runtime-root>/
  auth-token
  projects.yaml
  environments.yaml
  workspace/
  journal/
    operations.jsonl
  data/
    runtime-env.json
```

The generated `projects.yaml` contains:

```yaml
projects: []
```

The generated `environments.yaml` contains `policy.projects: []`. On a Docker
host it contains one Docker host environment. When the server initializes a new
runtime root on an active Docker Swarm manager, it detects Swarm nodes through
the Docker CLI and writes one Swarm environment with `docker-swarm`,
`placement`, and node inventory fields. HiveForge derives its control-plane
managed root internally from `/hf/data`. If Docker reports active Swarm mode but
the current node is not a manager, startup fails instead of silently writing a
single-host Docker environment.

Detected Swarm node inventory records Docker node id, hostname, role,
availability, status, and labels. It does not include mount inventory, host path
discovery, or host path templating.

HiveForge does not refresh this node inventory implicitly while the server is
running. Operators can refresh it explicitly through `POST
/environments/refresh` or the UI Overview node inventory action. Refresh
preserves existing managed-root configuration, environment policy, and vars for
the same current environment id, then rewrites the detected runtime fields and
node labels in `environments.yaml`.

This lets the server start, but no project can deploy until an operator
explicitly configures project registry and environment policy.

If `HIVEFORGE_AUTH_TOKEN` is not set, the server creates `auth-token` once and
uses that file as the bearer token source. It must not overwrite an existing
token file or print the token value in logs.

On startup HiveForge logs only the selected token source:
`environment`, `file`, or `generated`. When `HIVEFORGE_AUTH_TOKEN` is set and a
runtime-root `auth-token` file also exists, the environment token wins and HiveForge
logs that the file is ignored without printing either token value.

If files already exist, HiveForge derives those same paths and uses them. It
must not overwrite existing `projects.yaml`, `environments.yaml`, or
`auth-token`, create `.env`, create `secrets/`, or create runtime project data
outside its own `data/` directory. A non-writable runtime root is a deployment
configuration error.

Explicit runtime path mode remains supported for advanced installs:

- `HIVEFORGE_PROJECT_REGISTRY_PATH` for registered project config,
- `HIVEFORGE_ENVIRONMENTS_PATH` for environment policy config,
- `HIVEFORGE_WORKSPACE_DIR` for checked-out repositories,
- `HIVEFORGE_JOURNAL_DIR` for operation journal data.
- `HIVEFORGE_DATA_ROOT` for HiveForge-managed deployment files and non-secret
  runtime env config.

Explicit path mode is for maintainers and unusual packaging only. Normal Docker
and Swarm installs should use the fixed `/hf` container root and configure the
host/node-visible managed root through environment capabilities, not through a
process environment variable.

The published runtime image starts the REST/UI server by default:

```text
npm run serve
```

It binds to `HIVEFORGE_BIND_HOST` and `HIVEFORGE_PORT`; the Docker image
defaults are `0.0.0.0` and `3000` so Compose or a reverse proxy can expose the
service explicitly.

If the target environment requires an outbound HTTP proxy, the runtime service
may be configured with the standard `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`,
`http_proxy`, `https_proxy`, and `no_proxy` environment variables. HiveForge
does not interpret those values itself; child processes such as `git clone` and
declared lifecycle action commands inherit the container environment.

Runtime paths must be configured through exactly one supported mode. Missing
writable directories are deployment configuration errors.

For the current POC, HiveForge manages only files under its own data root. With
the normal runtime-root install, the project managed tree is:

```text
<runtime-root>/data/deployed/<projectId>/
```

The environment capability records the Docker bind source root for managed
project files:

```yaml
capabilities:
  managedRoot:
    shared: true
    bindSourceRoot: /mnt/shared_nfs/hiveforge
```

HiveForge derives the control-plane path internally, normally `/hf/data`.
`bindSourceRoot` is the host-side runtime root Docker nodes use as the base for
rendered Compose or Stack bind sources. HiveForge derives managed project bind
sources under `<bindSourceRoot>/data`. If an action needs host bind sources and
no bind source root is configured, the action must fail rather than
substituting the container path.

Managed artifact targets are always relative to that project directory.
HiveForge does not create or repair host mount points outside its configured
data root.

## Future Per-Node Agent

A later architecture may run a lightweight HiveForge agent on selected Docker or
Swarm nodes. That agent could expose additional node-local managed roots, for
example a dedicated `HF_EBS` mount on `Master 2` for ClickHouse data.

In that future model, node-local roots are treated like the main HiveForge root:
explicitly configured, named, validated, and referenced by manifests. HiveForge
still must not invent paths, create arbitrary host mounts, or become a second
container runtime.

## Non-goals

- The image does not install project-specific Python collections or roles
  dynamically.
- The image does not guess host tools.
- The image does not run undeclared playbooks.
- The image does not create unmanaged host mount points.
