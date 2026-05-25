# Install HiveForge With Docker Compose

HiveForge installs into one operator-owned directory. The container mounts that
directory at `/hf` and initializes missing runtime files there on first start.

## Minimal Start

```bash
mkdir -p /opt/hiveforge
cd /opt/hiveforge
curl -fsSLO https://raw.githubusercontent.com/sepa79/HiveForge/main/deploy/docker-compose.hiveforge.yml
docker compose -f docker-compose.hiveforge.yml up -d
```

After first start, the directory contains:

```text
auth-token
data/
docker-compose.hiveforge.yml
environments.yaml
journal/
  operations.jsonl
projects.yaml
workspace/
```

Read the generated token on the host:

```bash
cat /opt/hiveforge/auth-token
```

API and MCP clients use it as a bearer token. The UI shell loads without auth,
but its API requests require the same token.

The public process health endpoint is:

```text
http://<host>:3000/health
```

It does not require the bearer token.

Start MCP against the installed HiveForge endpoint with:

```bash
HIVEFORGE_BASE_URL=http://<host>:3000 \
HIVEFORGE_AUTH_TOKEN="$(cat /opt/hiveforge/auth-token)" \
npm run hiveforge-mcp
```

MCP connects to the HiveForge REST endpoint. It does not use
`HIVEFORGE_BASE_DIR` and does not read `projects.yaml`, `environments.yaml`,
`workspace/`, `journal/`, or `data/` directly.

## Operator-Provided Token

To provide the token yourself, create `.env` before starting Compose:

```bash
printf 'HIVEFORGE_AUTH_TOKEN=%s\n' 'replace-me' > .env
docker compose -f docker-compose.hiveforge.yml up -d
```

If `HIVEFORGE_AUTH_TOKEN` is set, HiveForge uses it and does not create
`auth-token`.

## Runtime Files

HiveForge creates missing runtime files, but does not overwrite existing files:

- `projects.yaml` starts as `projects: []`,
- `environments.yaml` starts with one Docker host environment and
  `policy.projects: []`,
- `workspace/` stores checked-out repositories,
- `journal/operations.jsonl` stores operation history,
- `data/` stores HiveForge-managed deployment files,
- `auth-token` is created only when no `HIVEFORGE_AUTH_TOKEN` is supplied.

No project can be deployed until an operator explicitly registers or configures
project registry and environment policy entries.

## Docker Access

The Compose file mounts `/var/run/docker.sock` because the current HiveForge POC
validates Docker requirements and runs declared actions that target Docker or
Swarm. This gives the HiveForge container Docker control on the host. If that is
not acceptable, do not install this Compose file as-is.

## Image And Port Overrides

The default image is `ghcr.io/sepa79/hiveforge:latest`. Pin a release with:

```bash
HIVEFORGE_IMAGE=ghcr.io/sepa79/hiveforge:v0.4.2 docker compose -f docker-compose.hiveforge.yml up -d
```

The default public bind is `0.0.0.0:3000`. Override it with:

```bash
HIVEFORGE_HTTP_BIND=127.0.0.1:3000 docker compose -f docker-compose.hiveforge.yml up -d
```
