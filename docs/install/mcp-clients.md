# Configure An MCP Client For HiveForge

This guide is for users and AI agents configuring HiveForge in an MCP-capable
client such as VS Code Copilot or Amazon Q Developer.

HiveForge currently exposes MCP as a local stdio process. The stdio process
connects to the installed HiveForge REST endpoint with `HIVEFORGE_BASE_URL` and
`HIVEFORGE_AUTH_TOKEN`.

Do not configure `http://<host>:3000` as a remote MCP HTTP server. That URL is
the HiveForge REST API. The MCP server is started by the client as a local
process.

## Values To Get From The Operator

Before changing the user's editor or agent configuration, collect:

- MCP client name and version, for example VS Code Copilot, Amazon Q IDE, or
  Amazon Q CLI,
- HiveForge base URL, for example `http://swarm-manager.example:3000`,
- HiveForge auth token,
- HiveForge image tag, for example `ghcr.io/sepa79/hiveforge:v0.5.1`,
- desired scope: user/global configuration or workspace/local configuration.

Prefer user/global scope for a non-technical workstation setup. Use workspace
or local scope only when the team intentionally wants the MCP server definition
stored with that project.

Do not ask the user to paste tokens into chat when the client supports a secret
prompt or a local environment variable. Do not commit tokens into workspace
files.

## Canonical Stdio Server

Every MCP client needs to start this foreground process, expressed in its own
configuration format:

```bash
docker run --rm -i \
  -e HIVEFORGE_BASE_URL=http://<host>:3000 \
  -e HIVEFORGE_AUTH_TOKEN=<token> \
  ghcr.io/sepa79/hiveforge:v0.5.1 \
  npm run hiveforge-mcp
```

Required details:

- command: `docker`,
- arguments: `run`, `--rm`, `-i`, environment variables, image tag, `npm`,
  `run`, `hiveforge-mcp`,
- do not add Docker `-d`; stdio MCP must stay in the foreground,
- `HIVEFORGE_BASE_URL` and `HIVEFORGE_AUTH_TOKEN` are required and fail fast
  when missing.

## VS Code Copilot

VS Code stores MCP configuration in `mcp.json`, either in the user profile or
in `.vscode/mcp.json`. It also provides Command Palette flows such as
`MCP: Open User Configuration`, `MCP: Add Server`, and `MCP: List Servers`.

For a non-technical user, ask them to open VS Code, run
`MCP: Open User Configuration`, and add a user-scoped server. This keeps the
setup available across workspaces and avoids committing local credentials.

Example VS Code `mcp.json`:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "hiveforge-token",
      "description": "HiveForge auth token",
      "password": true
    }
  ],
  "servers": {
    "hiveforge": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-e",
        "HIVEFORGE_BASE_URL=http://<host>:3000",
        "-e",
        "HIVEFORGE_AUTH_TOKEN=${input:hiveforge-token}",
        "ghcr.io/sepa79/hiveforge:v0.5.1",
        "npm",
        "run",
        "hiveforge-mcp"
      ]
    }
  }
}
```

After saving, run `MCP: List Servers`, start or restart `hiveforge`, confirm
trust when prompted, and enable the HiveForge tools in chat.

Official VS Code references:

- <https://code.visualstudio.com/docs/agent-customization/mcp-servers>
- <https://code.visualstudio.com/docs/agents/reference/mcp-configuration>

## Amazon Q Developer

Amazon Q Developer uses its own MCP setup flows. Do not assume VS Code
`mcp.json` is the right file.

For Amazon Q in an IDE, use the MCP configuration UI:

1. Open the Amazon Q MCP configuration UI.
2. Add a server.
3. Choose global or local scope.
4. Select `stdio`.
5. Set command to `docker`.
6. Add the canonical arguments from this guide.
7. Add environment variables if the UI separates env from arguments.
8. Save, then review and adjust tool permissions.

For Amazon Q CLI, use its MCP-specific commands or agent configuration. Confirm
the exact syntax with the installed CLI help before changing files, because Q's
CLI and IDE configuration locations are different.

Official Amazon Q references:

- <https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/mcp-ide.html>
- <https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line-mcp-config-CLI.html>

## Verification Prompt

After connecting, ask the agent to call these HiveForge tools:

```text
check_health
get_hiveforge_info
list_environments
list_projects
```

If these succeed, the MCP connection works. Deployment still requires explicit
project registration, environment policy, runtime env, and validation.

## Troubleshooting

`docker` is not found:

Install Docker Desktop or Docker Engine on the workstation running the MCP
client, then restart the editor or terminal so `docker` is on `PATH`.

Server starts and immediately exits:

Check the MCP server output. Confirm both `HIVEFORGE_BASE_URL` and
`HIVEFORGE_AUTH_TOKEN` are set and non-empty.

Cannot connect to HiveForge:

Open `http://<host>:3000/health` from the same workstation. If a corporate
proxy or VPN is required, configure it for the workstation-side MCP process.

Authentication fails:

Use the current token from the HiveForge install. If the token came from a
client prompt, clear the client-cached value or recreate the MCP server entry.

The client blocks or hides MCP:

Enterprise policy can disable or restrict MCP, tool usage, network access, or
local command execution. The user needs their IDE or security administrator to
enable the required MCP and Docker process access.

Tools are visible but disabled:

Enable the HiveForge server/tools in the client's tool picker or permissions
panel. Some clients require approval before the first tool call.
