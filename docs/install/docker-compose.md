# Install HiveForge With Docker Compose Or Portainer

Lite installs from one Docker Compose file:

```text
deploy/docker-compose.hiveforge.yml
```

The same file is supported for:

- `docker compose up` on a Docker or Swarm manager host,
- Portainer as a Swarm stack,
- `docker stack deploy` on a Swarm manager.

The file includes ordinary Compose settings for local `docker compose up` and
`deploy.placement` for Portainer/Swarm. It keeps `version: "3.8"` so older stack
deploy implementations accept the placement section.

HiveForge mounts one operator-owned runtime directory at `/hf`; the HiveForge
server always uses `/hf` as its container runtime root and initializes missing
runtime files there on first start.

## Lite: Docker Compose

Run this on the target Docker host or on one Swarm manager:

```bash
mkdir -p /opt/hiveforge
cd /opt/hiveforge
curl -fsSLO https://raw.githubusercontent.com/sepa79/HiveForge/main/deploy/docker-compose.hiveforge.yml
docker compose -f docker-compose.hiveforge.yml up -d
cat /opt/hiveforge/auth-token
```

## Lite: Portainer Or Swarm Stack

For Portainer, paste the same `deploy/docker-compose.hiveforge.yml` file as a
Swarm stack.

For CLI stack deploy, run this on a Swarm manager:

```bash
mkdir -p /opt/hiveforge
cd /opt/hiveforge
curl -fsSLO https://raw.githubusercontent.com/sepa79/HiveForge/main/deploy/docker-compose.hiveforge.yml
docker stack deploy -c docker-compose.hiveforge.yml hiveforge
cat /opt/hiveforge/auth-token
```

The service is constrained to manager nodes because it mounts
`/var/run/docker.sock`. If the host path is not `/opt/hiveforge`, edit the `/hf`
bind source in the Compose file before deploy.

Read the generated token from the running task when host access is inconvenient:

```bash
docker ps --filter label=com.docker.swarm.service.name=hiveforge_hiveforge
docker exec <container-id> cat /hf/auth-token
```

After first start, the runtime directory contains:

```text
auth-token
data/
environments.yaml
journal/
  operations.jsonl
projects.yaml
workspace/
```

API and MCP clients use the token as a bearer token. The UI shell loads without
auth, but its API requests require the same token.

The public process health endpoint is:

```text
http://<host>:3000/health
```

It does not require the bearer token.

## Full Node: Forgejo Git And OCI Registry (Lab HTTP)

A Full node is one standalone Compose/Swarm stack containing HiveForge, Forgejo
Git, and its OCI package registry. Use `deploy/docker-compose.hiveforge-full.yml`
instead of the Lite file; do not combine the two files:

```bash
mkdir -p /opt/hiveforge/forgejo
cd /opt/hiveforge
curl -fsSLO https://raw.githubusercontent.com/sepa79/HiveForge/main/deploy/docker-compose.hiveforge-full.yml
docker compose -f docker-compose.hiveforge-full.yml up -d
```

For Swarm, run the equivalent on a manager:

```bash
docker stack deploy -c docker-compose.hiveforge-full.yml hiveforge
```

Set the public host and URL directly in the Compose file when its defaults do
not match the installation. They must use the exact host or IP and port
reachable from Git and Docker clients. Before a Swarm deployment, replace both
`CHANGE-ME-SWARM-MANAGER-HOSTNAME` constraints with the manager that owns
Forgejo's SQLite `/data` bind. Keep `/opt/hiveforge/forgejo` on that node's
local filesystem, never under the shared HiveForge managed root or on NFS; back
it up separately.

The shipped defaults `forgejo-change-me.invalid` and
`http://forgejo-change-me.invalid:3001/` are intentional placeholders. Full is
not ready for Git or OCI use until you replace them with the real public host
or IP and port for that lab node. Until then, HiveForge reports Full discovery
as `incomplete`, not `configured`.

Full exposes only `forgejo-gateway` on that address. The raw Forgejo
service stays on a private network. The gateway supplies a single fixed
Forgejo identity, `hiveforge`, so normal clients use no credentials:

```bash
git push http://10.0.0.54:3001/hiveforge/my-app.git main
docker push 10.0.0.54:3001/hiveforge/my-app:1.0.0
```

The first push creates the repository under that namespace. This is deliberately
a trusted development-LAN hub: anyone who can reach the gateway can read,
create, or overwrite content in `hiveforge`. Do not expose it beyond that
trusted network. Forgejo's installer remains locked; a Forgejo administrator is
only needed to operate the Forgejo UI itself, not for normal Git or OCI use.

This initial Full mode uses **plain HTTP** for the isolated lab. Before any
Docker engine can push or pull, its own operator must manually configure this
exact registry address, here `10.0.0.54:3001`, in Docker
`insecure-registries`, then restart Docker using that environment's normal
procedure. Repeat that on every push/pull engine, including relevant Swarm
nodes. HiveForge does not write Docker daemon configuration, perform that
restart, or prove that every node was configured.

HiveForge discovers the sibling Forgejo service through the current Docker
Compose project or Swarm stack labels, then reads its configured root URL. An
agent calls `get_managed_repositories_info` to receive the shared Git service,
OCI registry address, the fixed `hiveforge` owner namespace, and the manual
registry prerequisite. No additional HiveForge environment variables or
descriptor file are required. It does not list, create, or track application
repositories or image paths.

For a project stored there, its `hiveforge.yaml` may declare that exact
internal HTTP Git URL (ending in `.git`), for example
`http://10.0.0.54:3001/hiveforge/my-app.git`. Register the same URL and explicit
Git ref as a development project before deployment. Arbitrary external HTTP
Git URLs remain invalid.

This does not add a build action: the user or agent continues to build, `git
push`, and `docker push` manually, then uses the existing HiveForge deployment
workflow with an explicit image reference accepted by that project's profile.
The same manual artifact flow may also be used during HiveForge maintainer
development on that Full node: push Git changes, build and push a development
image to the local OCI registry, then update the HiveForge service manually.

## MCP

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
  ghcr.io/sepa79/hiveforge:v0.5.9 \
  npm run hiveforge-mcp
```

MCP connects to the HiveForge REST endpoint. It does not read `projects.yaml`,
`environments.yaml`, `workspace/`, `journal/`, or `data/` directly.
Do not configure `http://<host>:3000` as a remote MCP HTTP server; it is the
REST endpoint used by the local stdio MCP process.

MCP clients configure stdio servers differently. Use
[Configure an MCP client for HiveForge](mcp-clients.md) for VS Code Copilot,
Amazon Q Developer, and agent-facing setup guidance.

## Operator-Provided Token

For `docker compose up`, put the token in `.env` before starting:

```bash
printf 'HIVEFORGE_AUTH_TOKEN=%s\n' 'replace-me' > .env
docker compose -f docker-compose.hiveforge.yml up -d
```

For Portainer or `docker stack deploy`, set `HIVEFORGE_AUTH_TOKEN` as a stack
environment variable before deploying.

If `HIVEFORGE_AUTH_TOKEN` is set, HiveForge uses it and does not create
`auth-token`.

If `auth-token` already exists from an earlier start and you later set
`HIVEFORGE_AUTH_TOKEN`, the environment token wins. HiveForge keeps the old file
in place, logs `HiveForge auth token source: environment`, and logs that the
runtime-root token file is ignored without printing either token value.

## Environment Display Metadata

On first start, HiveForge creates `/hf/environments.yaml` when it is missing.
The Compose file can seed the human-facing environment label and description
for that generated file. It also seeds the managed-root bind source from
`HIVEFORGE_MANAGED_ROOT_BIND_SOURCE_ROOT`; the install template defaults this to
`/opt/hiveforge` and uses the same value as the host bind mounted to `/hf`.
When that variable is not present, HiveForge tries to read the actual host bind
source for `/hf` from Docker inspect of its own running container before
creating a new `environments.yaml`.

```bash
cat >> .env <<'EOF'
HIVEFORGE_ENVIRONMENT_NAME=Marax HomeLab Swarm
HIVEFORGE_ENVIRONMENT_DESCRIPTION=Home lab Docker Swarm on 192.168.88.50 using /mnt/shared_nfs/hiveforge.
HIVEFORGE_MANAGED_ROOT_BIND_SOURCE_ROOT=/mnt/shared_nfs/hiveforge
EOF
docker compose -f docker-compose.hiveforge.yml up -d
```

For Portainer or `docker stack deploy`, provide the same values as stack
environment variables before deploying.

After `environments.yaml` exists, edit `name`, `description`, and
`capabilities.managedRoot.bindSourceRoot` there. HiveForge does not overwrite
existing environment metadata or managed-root configuration on restart,
redeploy, or node inventory refresh.

For an existing install that already has `environments.yaml` without
`capabilities.managedRoot.bindSourceRoot`, add the field manually under the
current environment's `capabilities.managedRoot` block. The value must be the
host-side path mounted into the HiveForge container as `/hf`.

## Corporate Proxy

HiveForge clones registered repositories from inside the HiveForge container.
If that container needs a corporate HTTP proxy to reach GitHub or another Git
host, configure the proxy on the HiveForge service itself. The same container
proxy settings are used by the `Update HF` button when it checks GitHub
Releases.

For `docker compose up`, put the standard proxy variables in `.env` next to the
Compose file:

```bash
cat >> .env <<'EOF'
HTTPS_PROXY=http://proxy.example.internal:8080
HTTP_PROXY=http://proxy.example.internal:8080
NO_PROXY=localhost,127.0.0.1,.internal,<target-host>
EOF

docker compose -f docker-compose.hiveforge.yml up -d
```

For Portainer or `docker stack deploy`, provide the same `HTTP_PROXY`,
`HTTPS_PROXY`, and `NO_PROXY` values as stack environment variables before the
stack is deployed. The Compose file passes uppercase and lowercase proxy
variable names through to the HiveForge container when those values are set.
`git clone` and declared lifecycle action processes inherit that container
environment.

Verify outbound GitHub access from the running HiveForge container with:

```bash
docker exec <container-id> curl -fsS https://api.github.com/repos/sepa79/HiveForge/releases/latest
```

For Swarm, identify the task container first:

```bash
docker ps --filter label=com.docker.swarm.service.name=hiveforge_hiveforge
```

If this curl command fails, the `Update HF` button cannot check releases from
that environment. Set the proxy variables on the stack/service and redeploy or
restart HiveForge.

Docker image pulling is a separate host Docker daemon concern. If the GitHub
release check succeeds but the later service image update cannot pull from
GHCR, configure the Docker daemon's registry/proxy access on the Swarm nodes.

MCP proxy configuration on the workstation is separate. It only affects the MCP
client process connecting to the HiveForge REST endpoint; it does not affect
repository checkout performed by the HiveForge container.

## Runtime Files

HiveForge creates missing runtime files, but does not overwrite existing files:

- `projects.yaml` starts as `projects: []`,
- `environments.yaml` starts with `policy.projects: []`; server startup writes
  a Docker host environment on standalone Docker, or a Swarm environment with
  detected node inventory when Docker reports active Swarm manager mode,
- `workspace/` stores checked-out repositories,
- `journal/operations.jsonl` stores operation history,
- `data/` stores HiveForge-managed deployment files and
  `runtime-env.json` non-secret runtime env config, and the latest non-secret
  `managed-root-verification.json` probe evidence,
- `auth-token` is created only when no `HIVEFORGE_AUTH_TOKEN` is supplied.

No project can be deployed until an operator explicitly registers or configures
project registry and environment policy entries.

Non-secret project runtime env is stored in `data/runtime-env.json` and is
managed through REST/MCP. Do not put secrets in this file.

The generated environment derives the HiveForge container's managed root
internally as `/hf/data`. When project deployments need Docker bind sources, set
`capabilities.managedRoot.bindSourceRoot` to the host-side runtime root as seen
by the target Docker node, for example `/opt/hiveforge` or
`/mnt/shared_nfs/hiveforge`. HiveForge reports this mapping through runtime
diagnostics; it does not infer or repair host mount points.

After an environment refresh, the manual MCP tool
`verify_managed_root_access` is available to confirm a host bind mount before
the first deploy or after a node or mount change. It obtains the image of the
currently running HiveForge container through Docker inspect and uses that same
image for a short-lived read-only mount of `<bindSourceRoot>/data`. On Swarm it
creates and removes one global probe service across active ready nodes, allowing
up to two minutes for a cold image pull. No additional probe-image configuration
is required. The probe never runs automatically and does not block deployment.
If the current container cannot be identified through Docker, the result is
explicitly `inconclusive`. Ordinary runtime diagnostics stay read-only.

## Docker Access

The Compose file mounts `/var/run/docker.sock` because HiveForge validates
Docker requirements and runs the Docker deployment executor against the target
Docker or Swarm environment. This gives the HiveForge container Docker control
on the host. If that is not acceptable, do not install this file as-is.

On a Swarm worker, HiveForge startup fails when creating a new runtime-root
environment file. Run HiveForge on a manager node or provide an explicit
`environments.yaml`.

## Image Override And Public Port

The default image is `ghcr.io/sepa79/hiveforge:latest`. Pin a release with:

```bash
HIVEFORGE_IMAGE=ghcr.io/sepa79/hiveforge:v0.5.9 docker compose -f docker-compose.hiveforge.yml up -d
```

For Portainer or `docker stack deploy`, set `HIVEFORGE_IMAGE` before deploy or
edit the image in the Compose file.

The public port is explicitly `3000` in both the Lite and Full Compose files.
To use a different port, edit `published: 3000` in the file you deploy before
starting the stack.

## Self-Update From The UI

After HiveForge is running, the operator UI top bar exposes `Update HF` when an
API token is set. The button calls GitHub Releases, compares the running
HiveForge version with the latest release tag, and starts an update only when a
newer release exists.

When no GitHub Release exists yet, HiveForge reports that no published release
was found and does not run Docker update commands.

The update target is the concrete release image tag such as
`ghcr.io/sepa79/hiveforge:v0.5.9`; it does not update to floating `latest`.
`Update HF` is for published official releases only; it is not the path for
deploying development images built against the local Full-node registry.

For Docker Compose installs, HiveForge uses the running container's Compose
labels and `/hf` mount to start a helper container that runs the same Compose
file with the new image. For Portainer/Swarm installs, HiveForge uses the
running service label and performs a Docker service image update so existing
stack environment, mounts, ports, and placement are preserved.
