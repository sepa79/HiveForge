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

The container uses explicit directories:

- `HIVEFORGE_PROJECT_REGISTRY_PATH` for registered project config,
- `HIVEFORGE_ENVIRONMENTS_PATH` for environment policy config,
- `HIVEFORGE_WORKSPACE_DIR` for checked-out repositories,
- `HIVEFORGE_JOURNAL_DIR` for operation journal data.
- `HIVEFORGE_DATA_ROOT` for HiveForge-managed deployment files.

The CLI also supports a single mounted base directory through `--base-dir`.
This mode is mutually exclusive with `--registry`, `--workspace`, `--journal`,
and `--data-root`. When the base directory is empty, HiveForge initializes only
this minimal structure:

```text
<base-dir>/
  projects.yaml
  workspace/
  journal/
    operations.jsonl
  data/
```

The generated `projects.yaml` contains:

```yaml
projects: []
```

If the structure already exists, HiveForge derives those same paths and uses
them. It must not overwrite an existing `projects.yaml`, create `.env`, create
`secrets/`, or create runtime project data outside its own `data/` directory.
A non-writable base directory is a deployment configuration error.

The published runtime image starts the REST/UI server by default:

```text
npm run serve
```

It binds to `HIVEFORGE_BIND_HOST` and `HIVEFORGE_PORT`; the Docker image
defaults are `0.0.0.0` and `3000` so Compose or a reverse proxy can expose the
service explicitly.

Runtime paths must be configured through exactly one supported mode or use the
image defaults. Missing writable directories are deployment configuration
errors.

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
