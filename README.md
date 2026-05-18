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

The REST server requires an explicit bearer token:

```bash
HIVEFORGE_PROJECT_REGISTRY_PATH=examples/hivewatch/projects.yaml \
HIVEFORGE_ENVIRONMENTS_PATH=examples/hivewatch/environments.yaml \
HIVEFORGE_AUTH_TOKEN=local-dev-token \
HIVEFORGE_WORKSPACE_DIR=tmp/workspace \
HIVEFORGE_JOURNAL_DIR=tmp/journal \
HIVEFORGE_DATA_ROOT=tmp/data \
HIVEWATCH_API_PORT=3000 \
npm run serve
```

Open `http://127.0.0.1:3000/` for the bundled operator console. The UI loads
without auth so the browser can render it, but API calls require the bearer
token.

Run the MCP server against the REST API over stdio:

```bash
HIVEFORGE_BASE_URL=http://127.0.0.1:3000 \
HIVEFORGE_AUTH_TOKEN=local-dev-token \
npm run hiveforge-mcp
```
