# Install HiveForge With Docker Compose

This is the self-install path for a fresh clone or a newly published image.

## Required Inputs

Ask for these values before generating a host-specific compose file:

- target host DNS name or IP, for example `XYZ.com`,
- public port or reverse proxy route,
- HiveForge image tag, default `ghcr.io/sepa79/hiveforge:latest`,
- bearer token source, provided as `HIVEFORGE_AUTH_TOKEN`,
- project registry content,
- environment policy content,
- whether HiveForge should access `/var/run/docker.sock` on the target host.

Do not invent the token, project registry, or environment policy. Missing values
are installation blockers.

## Files

Copy these files to one directory on the target host:

```text
docker-compose.yml
projects.yaml
environments.yaml
```

Use [deploy/docker-compose.hiveforge.yml](../../deploy/docker-compose.hiveforge.yml)
as `docker-compose.yml`. Use
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

## Docker Access

The compose file mounts `/var/run/docker.sock` because the current HiveForge POC
validates Docker requirements and runs deployment actions that target Docker or
Swarm. This gives the HiveForge container Docker control on the host. If that is
not acceptable, do not install this compose file as-is.

## Host-Specific Prompt Contract

A useful agent prompt can be:

```text
Create a Docker Compose installation for HiveForge on Docker host XYZ.com.
Use this repository's deploy/docker-compose.hiveforge.yml as the base.
Ask for any missing token, image tag, project registry, or environment policy.
Do not invent secrets or registry entries.
```

Expected agent behavior:

- keep the HiveForge image explicit,
- keep `HIVEFORGE_AUTH_TOKEN` external,
- mount explicit `projects.yaml` and `environments.yaml`,
- publish only the requested host port,
- document Docker socket access,
- fail the plan if required config is missing.
