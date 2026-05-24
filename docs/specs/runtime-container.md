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
- host mount, for example `./:/hf`

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
```

The generated `projects.yaml` contains:

```yaml
projects: []
```

The generated `environments.yaml` contains one Docker host environment with
`policy.projects: []`. This lets the server start, but no project can deploy
until an operator explicitly configures project registry and environment policy.

If `HIVEFORGE_AUTH_TOKEN` is not set, the server creates `auth-token` once and
uses that file as the bearer token source. It must not overwrite an existing
token file or print the token value in logs.

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
- `HIVEFORGE_DATA_ROOT` for HiveForge-managed deployment files.

The published runtime image starts the REST/UI server by default:

```text
npm run serve
```

It binds to `HIVEFORGE_BIND_HOST` and `HIVEFORGE_PORT`; the Docker image
defaults are `0.0.0.0` and `3000` so Compose or a reverse proxy can expose the
service explicitly.

Runtime paths must be configured through exactly one supported mode. Missing
writable directories are deployment configuration errors.

For the current POC, HiveForge manages only files under its own data root. The
project managed tree is:

```text
<HIVEFORGE_DATA_ROOT>/deployed/<projectId>/
```

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
