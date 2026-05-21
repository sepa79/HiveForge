# Install HiveForge With Docker Compose

This is the assisted self-install path for a fresh clone or a newly published
image. The expected output is a host-specific Compose file, config files, and
operator instructions. Agents should not perform the installation unless the
operator explicitly asks them to run commands on that host.

## Required Inputs

Ask for these values before generating a host-specific compose file:

- target host DNS name or IP, for example `XYZ.com`,
- public port or reverse proxy route,
- HiveForge image tag, default `ghcr.io/sepa79/hiveforge:latest`,
- bearer token source, provided as `HIVEFORGE_AUTH_TOKEN`,
- project registry content,
- environment policy content,
- whether HiveForge should access `/var/run/docker.sock` on the target host,
- durable host paths for workspace, journal, and HiveForge managed data root.

Do not invent the token, project registry, or environment policy. Missing values
are installation blockers.

## Files

Copy these files to one directory on the target host:

```text
docker-compose.yml
projects.yaml
environments.yaml
```

Use one of these templates:

- [deploy/docker-compose.assisted.example.yml](../../deploy/docker-compose.assisted.example.yml)
  when an AI assistant is preparing a host-specific Compose file for a human to
  review.
- [deploy/docker-compose.hiveforge.yml](../../deploy/docker-compose.hiveforge.yml)
  for env-driven local validation or simple installs.

Use
[deploy/projects.example.yaml](../../deploy/projects.example.yaml) and
[deploy/environments.example.yaml](../../deploy/environments.example.yaml) as
starting points only.

By default, Compose reads `./projects.yaml` and `./environments.yaml` next to
the compose file. Override those paths with `HIVEFORGE_PROJECTS_FILE` and
`HIVEFORGE_ENVIRONMENTS_FILE` when needed. Absolute paths are safest. Relative
override values must start with `./` and are resolved relative to the compose
file directory.

## Minimal Start

```bash
cp deploy/docker-compose.hiveforge.yml docker-compose.yml
cp deploy/projects.example.yaml projects.yaml
cp deploy/environments.example.yaml environments.yaml
export HIVEFORGE_AUTH_TOKEN='replace-me'
docker compose up -d
```

Open:

```text
http://XYZ.com:3000/
```

API calls require the bearer token. The UI shell loads without auth, but its API
requests must use the token.

## Host-Specific Compose Guidance

For a human-reviewed host install, prefer the assisted template:

```bash
cp deploy/docker-compose.assisted.example.yml docker-compose.yml
```

Then replace the TODOs:

- image tag: pin the exact `ghcr.io/sepa79/hiveforge:<tag>` you want,
- port binding: default is `3000:3000`; change it only if the host needs a
  different public port or reverse proxy binding,
- token: provide `HIVEFORGE_AUTH_TOKEN` through an operator-owned `.env` file or
  shell export,
- workspace path: durable checkout cache, for example `/opt/hiveforge/workspace`,
- journal path: durable audit log location, for example `/opt/hiveforge/journal`,
- data root: durable managed artifact root, for example `/opt/hiveforge/data`,
- project registry: `projects.yaml`,
- environment policy: `environments.yaml`.

Do not use anonymous or temporary paths for `journal` or `data` on a real host.

The image already defaults to:

```text
HIVEFORGE_PROJECT_REGISTRY_PATH=/config/projects.yaml
HIVEFORGE_ENVIRONMENTS_PATH=/config/environments.yaml
HIVEFORGE_WORKSPACE_DIR=/var/lib/hiveforge/workspace
HIVEFORGE_JOURNAL_DIR=/var/lib/hiveforge/journal
HIVEFORGE_DATA_ROOT=/var/lib/hiveforge/data
HIVEFORGE_BIND_HOST=0.0.0.0
HIVEFORGE_PORT=3000
```

Do not put those values in a normal Compose file unless you intentionally need
to override the image contract.

## Docker Access

The compose file mounts `/var/run/docker.sock` because the current HiveForge POC
validates Docker requirements and runs deployment actions that target Docker or
Swarm. This gives the HiveForge container Docker control on the host. If that is
not acceptable, do not install this compose file as-is.

## Host-Specific Prompt Contract

A useful agent prompt can be:

```text
Help me prepare a Docker Compose installation for HiveForge on Docker host XYZ.com.
Use deploy/docker-compose.assisted.example.yml as the base.
Generate docker-compose.yml, projects.yaml, environments.yaml, and a short runbook.
Ask for missing host paths, token source, image tag, project registry, or environment policy.
Do not invent secrets, registry entries, profiles, or actions.
Do not run the installation unless I explicitly ask you to.
```

Expected agent behavior:

- keep the HiveForge image explicit,
- keep `HIVEFORGE_AUTH_TOKEN` external,
- mount explicit `projects.yaml` and `environments.yaml`,
- use durable host paths for workspace, journal, and managed data,
- publish only the requested host port,
- document Docker socket access,
- fail the plan if required config is missing,
- output reviewable files and commands for the operator.
