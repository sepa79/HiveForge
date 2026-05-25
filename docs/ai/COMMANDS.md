# Commands — HiveForge

This file contains canonical commands for humans and AI agents.

Agents must prefer these commands over ad-hoc guesses.

## Requirements

Implementation stack:

- Docker/Swarm target environment,
- git,
- Ansible,
- Node.js 22+,
- npm.

## Install / bootstrap

```bash
npm install
```

## Build

```bash
npm run build
```

Build the deploy container:

```bash
docker build -t hiveforge:local .
```

Validate the Docker Compose install template:

```bash
docker compose -f deploy/docker-compose.hiveforge.yml config
```

## Test

```bash
npm test
```

## Focused test

```bash
npm test -- tests/contracts/manifest-schema.test.ts
```

```bash
npm test -- tests/workspace/workspace-manager.test.ts
```

## Lint / format / static checks

No lint or format command exists yet.

## Run locally

Run the REST API:

```bash
npm run build
HIVEFORGE_BASE_DIR=tmp/hf HIVEFORGE_AUTH_TOKEN=local-dev-token npm run serve
```

Open the bundled operator console:

```text
http://127.0.0.1:3000/
```

Check process health:

```bash
curl -fsS http://127.0.0.1:3000/health
```

Run the MCP server over stdio:

```bash
npm run build
HIVEFORGE_BASE_URL=http://127.0.0.1:3000 HIVEFORGE_AUTH_TOKEN="$(cat tmp/hf/auth-token)" npm run hiveforge-mcp
```

MCP connects to the REST endpoint and does not use `HIVEFORGE_BASE_DIR`.

User-facing operation goes through MCP. REST and local CLI commands are
development/debug surfaces for HiveForge maintainers, not user fallbacks.

Select a known HiveForge target and run MCP over stdio using that active
target:

```bash
npm run build
npm run hf-target -- --config known-hiveforges.local.yaml use small
HF_SMALL_TOKEN=local-dev-token npm run hiveforge-mcp-target
```

Inspect known and active targets:

```bash
npm run hf-target -- list
npm run hf-target -- current
```

Inspect a project:

```bash
npm run build
npm run hiveforge -- inspect --registry examples/hivewatch/projects.yaml --workspace tmp/workspace --journal tmp/journal --data-root tmp/data --project hivewatch --ref main
```

Use one mounted HiveForge base directory for CLI commands:

```bash
npm run build
npm run hiveforge -- read-journal --base-dir tmp/hf
```

`--base-dir` is mutually exclusive with explicit `--registry --workspace
--journal --data-root`.

Validate a project:

```bash
npm run build
npm run hiveforge -- validate --registry examples/hivewatch/projects.yaml --workspace tmp/workspace --journal tmp/journal --data-root tmp/data --project hivewatch --ref main
```

Run a declared action:

```bash
npm run build
HIVEWATCH_API_PORT=3000 npm run hiveforge -- run-action --registry examples/hivewatch/projects.yaml --workspace tmp/workspace --journal tmp/journal --data-root tmp/data --project hivewatch-local --ref main --component api --action deploy --profile test
```

Run the local Docker smoke flow against the explicit local fixture:

```bash
scripts/local-docker/run-hivewatch-smoke.sh
```

## Debug / inspect

Inspect project references and TODOs:

```bash
rg -n "HiveForge|hiveforge|TODO" .
```

## Package / release

No package or release command exists yet.

## Deployment

Run HiveForge with Docker Compose on a Docker host:

```bash
mkdir -p /opt/hiveforge
cd /opt/hiveforge
curl -fsSLO https://raw.githubusercontent.com/sepa79/HiveForge/main/deploy/docker-compose.hiveforge.yml
docker compose -f docker-compose.hiveforge.yml up -d
cat auth-token
```

See `docs/install/docker-compose.md`.

CI runs `npm run check` and Docker image build through GitHub Actions.
Tagged releases publish `ghcr.io/<owner>/hiveforge:<tag>` and `latest`.

## Known command caveats

- Add commands when new runnable surfaces are introduced.
- Do not invent commands in PRs; verify them locally first.

## Agent command rules

- Do not invent commands when this file is incomplete.
- If a command is missing, inspect the repo and add a `TODO:` with likely
  location only after checking the implementation layout.
- Capture command output in evidence when preparing PRs or reviews.
