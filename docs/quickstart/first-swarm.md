# First Swarm Quickstart

## Status

Draft operator quickstart.

## Scope

This guide is for a new operator who wants to:

1. install HiveForge on a Docker Swarm manager,
2. connect an MCP client from their workstation,
3. register an external HiveForge-ready project such as HiveWatch or HiveMind,
4. allow that project on the selected environment,
5. validate and deploy through MCP.

HiveWatch and HiveMind are external consumer projects. Their repositories own
their `hiveforge.yaml` manifests and deployment assets. The development fixture
under `examples/hivewatch/` in this repository is not the user-facing example
deployment.

## Install On A Swarm Manager

Run this on a Swarm manager node. The current install mounts the manager's
Docker socket, so HiveForge can validate Docker resources and run its Docker
deploy executor against that environment.

```bash
mkdir -p /opt/hiveforge
cd /opt/hiveforge
curl -fsSLO https://raw.githubusercontent.com/sepa79/HiveForge/main/deploy/docker-compose.hiveforge.yml
docker stack deploy -c docker-compose.hiveforge.yml hiveforge
cat /opt/hiveforge/auth-token
docker ps --filter label=com.docker.swarm.service.name=hiveforge_hiveforge
```

The Compose file uses an absolute host bind at `/opt/hiveforge` by default,
uses a Compose v3 file version for older stack deploy implementations, and
constrains HiveForge to manager nodes when used as a Swarm stack. For Portainer,
paste the same file as a Swarm stack.

Check process health:

```bash
curl -fsS http://<swarm-manager-host>:3000/health
```

## Start MCP From A Workstation

The MCP server is a stdio client-side process. If you do not have a local
HiveForge checkout, run it from the published image:

```bash
docker run --rm -i \
  -e HIVEFORGE_BASE_URL=http://<swarm-manager-host>:3000 \
  -e HIVEFORGE_AUTH_TOKEN=<token-from-/opt/hiveforge/auth-token> \
  ghcr.io/sepa79/hiveforge:v0.5.2 \
  npm run hiveforge-mcp
```

Configure your MCP client to run that command as a foreground stdio server.
Different clients use different MCP configuration surfaces. For VS Code
Copilot, Amazon Q Developer, and agent-facing setup guidance, see
[Configure an MCP client for HiveForge](../install/mcp-clients.md).

After connection, the agent should call:

1. `check_health`,
2. `get_hiveforge_info`,
3. `list_environments`,
4. `list_projects`.

## Register An External Example Project

Use the external project repository URL and ref. For HiveWatch, use the
HiveWatch repository once its HiveForge manifests are published:

```text
inspect_repository(repository="https://github.com/sepa79/HiveWatch.git", gitRef="main")
register_project(repository="https://github.com/sepa79/HiveWatch.git", gitRef="main")
```

For HiveMind, use the HiveMind repository URL and release/ref that carries its
HiveForge manifests:

```text
inspect_repository(repository="<HiveMind repository URL>", gitRef="<ref>")
register_project(repository="<HiveMind repository URL>", gitRef="<ref>")
```

Registration approves the repository/ref. It does not grant environment
permission.

## Allow The Project On The Environment

Read the current environment id from `list_environments`, then set policy
explicitly:

```text
set_environment_project_policy(
  environmentId="docker",
  projectId="hivewatch",
  profiles=["normal", "test"],
  actions=["deploy", "remove", "update"]
)
```

Do the same for HiveMind with its documented profiles and lifecycle actions.
Do not guess profiles or actions; use the project manifest and operator intent.

## Configure Non-Secret Runtime Env

If the project requires environment variables that are not secrets and should
not be committed to git, set them before validation:

```text
set_project_runtime_env(
  projectId="hivewatch",
  profile="normal",
  values={
    "IMAGE_TAG": "latest"
  }
)
```

Do not use runtime env for passwords, API tokens, private keys, or other secret
values. Secrets are outside the current HiveForge contract.

## Validate And Deploy

Inspect and validate before any action:

```text
inspect_project(projectId="hivewatch", gitRef="main")
validate_requirements(projectId="hivewatch", gitRef="main", profile="normal")
```

If validation reports missing Docker volumes, secrets, environment variables, or
files, stop and provision them explicitly. HiveForge does not create missing
runtime requirements during validation.

For the current repo/ref lifecycle path:

```text
start_action(
  projectId="hivewatch",
  gitRef="main",
  component="<component>",
  action="deploy",
  profile="normal"
)
```

For release-driven managed-service projects such as HiveMind, use
`prepare_release_deploy` only where the project contract says release
preparation is sufficient. The current `prepare_release_deploy` tool prepares
and validates a release plan; execution of release deploy/upgrade actions is
still a separate contract gap.

## Current Gaps

- Runtime env supports non-secret values only; secret provisioning is not
  implemented.
- `prepare_release_deploy` prepares release plans but does not execute release
  actions.
- External HiveWatch/HiveMind repositories must carry their own HiveForge
  manifests before they can be deployed by this flow.
