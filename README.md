# HiveForge

HiveForge is a deployment control plane for target Docker/Swarm environments.

It runs as a container on the target environment, lets a human or AI agent connect
through UI, MCP, or REST, validates registered projects, prepares managed files
under its own data root, and runs explicitly declared lifecycle actions.

HiveForge is a separate project from PocketHive. PocketHive and HiveWatch are
consumers: they carry manifests and deployment assets, while HiveForge provides
the deployment engine, validation surface, audit journal, UI, REST API, and MCP
tools.

## Current POC

The first POC target is HiveWatch. PocketHive comes later after the model is
proven on a smaller project.

POC flow:

1. HiveForge runs as a container on a target Docker/Swarm environment.
2. User connects to that environment through UI or MCP.
3. User selects a registered project, initially HiveWatch.
4. HiveForge checks out an explicit git ref.
5. HiveForge reads the project `hiveforge.yaml`.
6. HiveForge reads only component manifests listed by the project manifest.
7. User chooses a component lifecycle action exposed by the project.
8. HiveForge checks the current environment policy for the project, profile, and
   action.
9. HiveForge validates requirements.
10. HiveForge runs the declared Ansible playbook from the checked-out repo.
11. HiveForge writes the operation result to an append-only journal.
12. HiveForge exposes deployment inventory derived from journaled lifecycle
    actions.

The HiveWatch POC is still repo/ref-driven. The target v1 model for
PocketHive/HiveMind-style managed services is release-driven: deploy an
already-published release or registry-qualified image tag set, validate registry
artifacts, and use repository inspection as bootstrap/dev tooling rather than
the deployment source of truth. See [Release deployment](docs/specs/releases.md).

## How To Use

1. Install HiveForge on the target Docker/Swarm environment.

   For `docker compose up` on one manager node:

   ```bash
   mkdir -p /opt/hiveforge
   cd /opt/hiveforge
   curl -fsSLO https://raw.githubusercontent.com/sepa79/HiveForge/main/deploy/docker-compose.hiveforge.yml
   docker compose -f docker-compose.hiveforge.yml up -d
   cat /opt/hiveforge/auth-token
   ```

   The install templates default `HIVEFORGE_HOST_BASE_DIR` to `/opt/hiveforge`
   and `HIVEFORGE_HOST_DATA_ROOT` to `/opt/hiveforge/data`. Override both when
   HiveForge data lives elsewhere.

   For Portainer or `docker stack deploy`, use
   [deploy/docker-stack.hiveforge.yml](deploy/docker-stack.hiveforge.yml)
   instead. See [First Swarm quickstart](docs/quickstart/first-swarm.md).

2. Start the MCP server from your workstation.

   ```bash
   docker run --rm -i \
     -e HIVEFORGE_BASE_URL=http://<target-host>:3000 \
     -e HIVEFORGE_AUTH_TOKEN=<token> \
     ghcr.io/sepa79/hiveforge:latest \
     npm run hiveforge-mcp
   ```

3. Ask your agent to use HiveForge MCP tools in this order:

   ```text
   check_health
   get_hiveforge_info
   list_environments
   refresh_environment
   list_environment_nodes
   inspect_repository
   register_project
   set_environment_project_policy
   set_project_runtime_env
   inspect_project
   validate_requirements
   start_action
   get_operation
   read_journal
   ```

   `register_project` approves a repository/ref. `set_environment_project_policy`
   is a separate explicit operator decision that allows that registered project
   to run selected actions/profiles on the target environment.
   `set_project_runtime_env` is only for non-secret runtime values that must
   stay outside git; secrets are outside the current HiveForge contract.

4. Deploy only projects that carry HiveForge manifests.

   HiveWatch and HiveMind are external consumer repositories. They become
   deployable when their own repositories carry `hiveforge.yaml` manifests,
   component manifests, and declared action assets. The fixture under
   `examples/hivewatch/` is for HiveForge development, not the user-facing
   deployment example.

## Core Rule

HiveForge manages only components that are explicitly listed in the project
manifest and have their own component `hiveforge.yaml`.

Everything else in `docker-compose.yml` is outside HiveForge's scope.

No manifest means no visibility and no actions.

## Initial Sources

- [Project context](docs/ai/PROJECT_CONTEXT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [POC spec](docs/specs/hiveforge-poc.md)
- [Commands](docs/ai/COMMANDS.md)

## Development

The first implementation iteration uses Node.js 22+ and TypeScript for contract
validation and manifest loading.

```bash
npm install
npm run check
```

Run the REST server against one local base directory:

```bash
HIVEFORGE_AUTH_TOKEN=local-dev-token \
HIVEFORGE_BASE_DIR=tmp/hf \
npm run serve
```

Open `http://127.0.0.1:3000/` for the bundled operator console. The UI loads
without auth so the browser can render it, but API calls require the bearer
token.

Run the MCP server against the REST API over stdio:

```bash
HIVEFORGE_BASE_URL=http://127.0.0.1:3000 \
HIVEFORGE_AUTH_TOKEN="$(cat tmp/hf/auth-token)" \
npm run hiveforge-mcp
```

MCP connects to the REST server. It does not read `HIVEFORGE_BASE_DIR` or
runtime files directly.

## Install HiveForge

HiveForge can run as a Docker Compose service on a target Docker host.

Use [Docker Compose install](docs/install/docker-compose.md),
[first Swarm quickstart](docs/quickstart/first-swarm.md),
[deploy/docker-compose.assisted.example.yml](deploy/docker-compose.assisted.example.yml),
[deploy/docker-compose.hiveforge.yml](deploy/docker-compose.hiveforge.yml),
and [deploy/docker-stack.hiveforge.yml](deploy/docker-stack.hiveforge.yml)
as the installation source of truth.

The default Compose install uses one mounted base directory. HiveForge creates
missing runtime files there on first start and generates `auth-token` when an
operator-provided `HIVEFORGE_AUTH_TOKEN` is not set. Project deployment remains
blocked until project registry and environment policy entries are explicitly
configured.

## License

This project is licensed under the project's repository license. See `LICENSE`
in the root for details.
