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

The preferred container install uses one mounted HiveForge base directory:

- `HIVEFORGE_BASE_DIR=/hf`
- host mount, for example `/opt/hiveforge:/hf`
- `HIVEFORGE_HOST_DATA_ROOT=/opt/hiveforge/data` when actions need
  host-visible managed paths for Docker bind mounts

For Swarm stack and Portainer installs, the base directory should be backed by a
host bind or shared filesystem mounted at `/hf`. Relative host bind mounts such
as `./:/hf` are only for `docker compose up` on one known manager node and do
not provide a portable host-visible path contract.

This mode is mutually exclusive with explicit runtime paths. HiveForge
initializes missing runtime files and directories under the base directory:

```text
<base-dir>/
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
base dir on an active Docker Swarm manager, it detects Swarm nodes through the
Docker CLI and writes one Swarm environment with `docker-swarm`, `placement`,
and node inventory fields. If Docker reports active Swarm mode but the current
node is not a manager, startup fails instead of silently writing a single-host
Docker environment.

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
base-dir `auth-token` file also exists, the environment token wins and HiveForge
logs that the file is ignored without printing either token value.

If files already exist, HiveForge derives those same paths and uses them. It
must not overwrite existing `projects.yaml`, `environments.yaml`, or
`auth-token`, create `.env`, create `secrets/`, or create runtime project data
outside its own `data/` directory. A non-writable base directory is a deployment
configuration error.

Explicit runtime path mode remains supported for advanced installs:

- `HIVEFORGE_PROJECT_REGISTRY_PATH` for registered project config,
- `HIVEFORGE_ENVIRONMENTS_PATH` for environment policy config,
- `HIVEFORGE_WORKSPACE_DIR` for checked-out repositories,
- `HIVEFORGE_JOURNAL_DIR` for operation journal data.
- `HIVEFORGE_DATA_ROOT` for HiveForge-managed deployment files and non-secret
  runtime env config.
- `HIVEFORGE_HOST_DATA_ROOT` for the same managed data root as seen by the
  target Docker daemon. This is required only for actions that render bind
  mounts into Docker Compose or Stack files.

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

For the current POC, HiveForge manages only files under its own data root. The
project managed tree is:

```text
<HIVEFORGE_DATA_ROOT>/deployed/<projectId>/
```

When `HIVEFORGE_HOST_DATA_ROOT` is configured, the host-visible equivalent is:

```text
<HIVEFORGE_HOST_DATA_ROOT>/deployed/<projectId>/
```

HiveForge passes both forms to actions. It does not infer one from the other.
If an action needs host bind sources and no host data root is configured, the
action must fail rather than substituting the container path.

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
