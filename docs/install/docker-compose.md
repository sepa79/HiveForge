# Install HiveForge With Docker Compose Or Swarm

HiveForge installs into one operator-owned directory. The container mounts that
directory at `/hf` and initializes missing runtime files there on first start.

## Docker Compose On One Swarm Manager

```bash
mkdir -p /opt/hiveforge
cd /opt/hiveforge
curl -fsSLO https://raw.githubusercontent.com/sepa79/HiveForge/main/deploy/docker-compose.hiveforge.yml
docker compose -f docker-compose.hiveforge.yml up -d
```

Use this mode when you SSH to one Docker or Swarm manager node and want
HiveForge runtime files directly under `/opt/hiveforge`.

## Swarm Stack / Portainer

Use `deploy/docker-stack.hiveforge.yml` when you want to paste a stack into
Portainer or run `docker stack deploy`. This variant uses a named volume instead
of `./:/hf`, because relative bind mounts are not portable in Swarm stacks.

```bash
curl -fsSLO https://raw.githubusercontent.com/sepa79/HiveForge/main/deploy/docker-stack.hiveforge.yml
docker stack deploy -c docker-stack.hiveforge.yml hiveforge
```

For Portainer, paste the contents of
`deploy/docker-stack.hiveforge.yml` as a Swarm stack. The service is constrained
to manager nodes because it mounts `/var/run/docker.sock`.

Read the generated token from the running task:

```bash
docker ps --filter label=com.docker.swarm.service.name=hiveforge_hiveforge
docker exec <container-id> cat /hf/auth-token
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

For Swarm stack installs, the token is inside the `hiveforge-data` named volume.
Use the `docker exec` command above unless you intentionally provide
`HIVEFORGE_AUTH_TOKEN`.

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

If you do not have a local HiveForge checkout, run the MCP stdio server from
the published image on your workstation:

```bash
docker run --rm -i \
  -e HIVEFORGE_BASE_URL=http://<host>:3000 \
  -e HIVEFORGE_AUTH_TOKEN=<token> \
  ghcr.io/sepa79/hiveforge:v0.4.4 \
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

## Corporate Proxy

HiveForge clones registered repositories from inside the HiveForge container.
If that container needs a corporate HTTP proxy to reach GitHub or another Git
host, configure the proxy on the HiveForge service itself.

For Docker Compose installs, put the standard proxy variables in the same
operator-owned directory as `docker-compose.hiveforge.yml`:

```bash
cat >> .env <<'EOF'
HTTPS_PROXY=http://proxy.example.internal:8080
HTTP_PROXY=http://proxy.example.internal:8080
NO_PROXY=localhost,127.0.0.1,.internal,<target-host>
EOF

docker compose -f docker-compose.hiveforge.yml up -d
```

For Swarm stack or Portainer installs, provide the same `HTTP_PROXY`,
`HTTPS_PROXY`, and `NO_PROXY` values as stack environment variables before the
stack is deployed. The Compose and Stack templates pass uppercase and lowercase
proxy variable names through to the HiveForge container when those values are
set. `git clone` and declared lifecycle action processes inherit that container
environment.

MCP proxy configuration on the workstation is separate. It only affects the MCP
client process connecting to the HiveForge REST endpoint; it does not affect
repository checkout performed by the HiveForge container.

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
HIVEFORGE_IMAGE=ghcr.io/sepa79/hiveforge:v0.4.4 docker compose -f docker-compose.hiveforge.yml up -d
```

The default public bind is `0.0.0.0:3000`. Override it with:

```bash
HIVEFORGE_HTTP_BIND=127.0.0.1:3000 docker compose -f docker-compose.hiveforge.yml up -d
```
