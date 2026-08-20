# HiveForge

HiveForge is a deployment control plane for Docker and Docker Swarm targets.
It gives a human or an AI agent one explicit surface—UI, MCP, or REST—to
inspect approved projects, validate their declared requirements, run their
declared lifecycle actions, and retain evidence for each deployment.

Current release: **0.5.10**.

HiveForge does not own application code or invent deployment behaviour.
Applications carry `hiveforge.yaml`, component manifests, and declared action
assets; HiveForge executes only that explicit contract.

## What It Does

For a registered repository and an explicit Git ref, HiveForge:

1. checks out the project and reads its root and listed component manifests;
2. checks the environment policy, profile, and declared requirements;
3. runs the declared lifecycle action, initially an Ansible playbook;
4. deploys the rendered Docker Compose/Swarm stack when the action declares it;
5. records a journal event, deployment state, rendered Compose artifact, and
   read-only runtime diagnostics.

It deliberately does not infer components from a Compose file, deploy arbitrary
repositories, manage secrets, choose a fallback adapter, or implement a build
action. Build, `git push`, and `docker push` remain visible steps outside the
current deployment action.

## Choose The Node Shape

| Shape | Includes | Use it for |
|---|---|---|
| **Lite** | HiveForge control plane, UI, MCP, REST, deployment evidence | Test/deploy targets that consume already-published artifacts. |
| **Full** | Lite plus a local Forgejo Git service and OCI registry | A trusted development lab that needs its own Git and Docker artifact endpoints. |

Full is not a repository catalog or a build system. It exposes one shared,
trusted-LAN `hiveforge` identity. A user or agent chooses the application path
and manually pushes its source and image; the ordinary HiveForge deploy flow
then selects an explicit image reference from the application's profile.

## Quick Start: Lite

Run this on the target Docker host or a Swarm manager:

```bash
mkdir -p /opt/hiveforge
cd /opt/hiveforge
curl -fsSLO https://raw.githubusercontent.com/sepa79/HiveForge/main/deploy/docker-compose.hiveforge.yml
docker compose -f docker-compose.hiveforge.yml up -d
cat /opt/hiveforge/auth-token
```

For Portainer or `docker stack deploy`, use the same base file. The complete
Compose/Swarm instructions, runtime-root behaviour, proxy settings, and token
options are in [Install HiveForge](docs/install/docker-compose.md).
The environment bootstrap fixes the runtime owner explicitly as either direct
Docker/Swarm mutation or Portainer-backed stack mutation; HiveForge does not
switch that executor implicitly later.

Check the public health endpoint:

```bash
curl -fsS http://<target-host>:3000/health
```

## Quick Start: Full

Full is one standalone Compose/Swarm stack containing HF, Forgejo, and the
gateway. Download `docker-compose.hiveforge-full.yml`, then follow
[the Full installation](docs/install/docker-compose.md#full-node-forgejo-git-and-oci-registry-lab-http).
Do not combine it with the Lite Compose file. Forgejo data belongs on local
storage of the selected node, never on NFS/EFS.

The shipped Full template uses placeholder Forgejo host values under `.invalid`.
Replace them with the real public Git/OCI host and port before using the node;
until then, Full discovery remains intentionally `incomplete`.

The gateway is the only public Forgejo endpoint. On the trusted lab network:

```bash
git push http://<forge-host>:3001/hiveforge/<app>.git <branch>
docker push <forge-host>:3001/hiveforge/<app>:<tag>
```

No Git credential helper or `docker login` is needed. This is intentionally
open to every client that reaches that trusted network; it is not suitable for
a public endpoint. Because the initial registry transport is HTTP, every Docker
engine that pushes or pulls must manually trust `<forge-host>:3001` through
Docker's `insecure-registries` setting. HiveForge never changes Docker daemon
configuration or claims that every node is ready.

## Use With An Agent

Run the local MCP stdio client from your workstation:

```bash
  docker run --rm -i \
  -e HIVEFORGE_BASE_URL=http://<target-host>:3000 \
  -e HIVEFORGE_AUTH_TOKEN=<token> \
  ghcr.io/sepa79/hiveforge:v0.5.10 \
  npm run hiveforge-mcp
```

MCP is a local stdio process that connects to HiveForge REST; do not expose the
REST endpoint as an MCP HTTP server. Client-specific setup is in
[Configure an MCP client](docs/install/mcp-clients.md).

A safe first agent flow is:

```text
check_health
get_hiveforge_info
list_environments
refresh_environment
diagnose_hiveforge_runtime
verify_managed_root_access       # manual diagnostic for host-bind deployments
get_managed_repositories_info   # Full only
list_projects
inspect_repository
register_project
set_environment_project_policy
set_project_runtime_env          # non-secret values only, when required
validate_requirements
start_action
diagnose_deployment
read_journal
```

`verify_managed_root_access` is deliberately manual: run it before the first
host-bind deployment and after a node or mount change. It does not run
automatically and does not block a deployment. `get_managed_repositories_info`
advertises Full's shared Git/OCI endpoints and their Docker prerequisite; it
never creates, lists, or tracks application repositories.

## Project Contract

A deployable application repository contains:

- a root `hiveforge.yaml` listing its managed components and supported actions;
- one component manifest for each managed component;
- action assets declared by those manifests;
- an explicit repository/ref registration and environment policy in HiveForge.

HiveWatch and HiveMind are consumer repositories, not built-in applications.
The `examples/hivewatch/` fixture exists for HiveForge development; use a
consumer repository's own manifest and profile for a real deployment.

## Evidence And Diagnostics

Every lifecycle attempt writes an append-only journal record. Successful deploys
also get a durable `deploymentId`, the recorded Compose artifact, and runtime
evidence. `diagnose_deployment` correlates the expected Compose services,
images, bind mounts, and placement constraints with the live Docker/Swarm
state. It does not re-render source or infer ownership from resource names.

## Documentation

- [Install with Docker Compose or Portainer](docs/install/docker-compose.md)
- [First Swarm quickstart](docs/quickstart/first-swarm.md)
- [MCP tool contract](docs/specs/mcp/tools.md)
- [REST API](docs/specs/api/openapi.yaml)
- [Architecture](docs/ARCHITECTURE.md)
- [0.5 delivery plan](docs/ai/HIVEFORGE_0_5_PLAN.md)

## Development

HiveForge uses Node.js 22+ and TypeScript.

```bash
npm install
npm run check
```

For local REST/MCP commands and the release gate, see
[canonical commands](docs/ai/COMMANDS.md).

## License

See [LICENSE](LICENSE).
