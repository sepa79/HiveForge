# ADR-001 - Runtime Config Provisioning

## Status

Proposed

## Context

Some consumer projects, including SkippyBot, currently keep deploy-time
configuration in `.env` files. Those files can contain two different classes of
values:

- secret values, such as tokens, passwords, and API keys,
- private runtime config, such as ports, private URLs, feature flags, and
  environment-specific identifiers that should not be committed to git.

The current HiveForge POC contract validates declared Docker secrets and
environment variables before action execution, but it does not provision them.
That forces operators to create runtime inputs manually before deployment.

HiveForge must not become a secrets engine. It must not persist secret values,
return them through API/MCP/UI, include them in prompts, or write them to the
journal. At the same time, AI-assisted deployment should not require operators
to SSH into the target host and run ad-hoc `docker secret create` commands.

## Decision

Add a future runtime config provisioning feature. The feature lets an operator
or AI agent provide runtime config to the target HiveForge instance before a
normal deployment, without sending plaintext runtime values through the LLM or
ordinary MCP tool arguments.

The feature has two sensitivity classes:

- `secret` - values that must be provisioned as target runtime secrets, initially
  Docker secrets.
- `private` - non-secret but environment-local config that must not be committed
  to git or exposed in model context.

The source can be a local `.env` file, but `.env` is an input source only. It is
not a HiveForge contract, secret store, or source of deployment truth.

The intended MCP flow is:

1. Agent inspects the project and sees missing runtime requirements.
2. Agent asks HiveForge for a provisioning public key.
3. Agent calls a local helper/tool with an env file path and explicit mapping of
   env names to runtime targets.
4. The helper reads the env file locally, outside model context.
5. The helper encrypts all mapped values for the selected HiveForge target.
6. HiveForge decrypts values in memory and provisions target runtime resources.
7. HiveForge journals only names, target kinds, and statuses, never values.
8. Normal validation and deployment run after provisioning.

Example mapping shape:

```json
{
  "projectId": "skippybot",
  "envFilePath": "/operator/local/skippybot/.env",
  "items": [
    {
      "env": "DISCORD_TOKEN",
      "target": {
        "kind": "docker-secret",
        "name": "skippybot-discord-token"
      },
      "sensitivity": "secret"
    },
    {
      "env": "SKIPPYBOT_PUBLIC_URL",
      "target": {
        "kind": "runtime-env",
        "name": "SKIPPYBOT_PUBLIC_URL"
      },
      "sensitivity": "private"
    }
  ]
}
```

The mapping is safe for model context because it contains names and target
contracts only, not values.

## Security Rules

- Runtime values must never be MCP tool arguments visible to the model.
- Secret values must never be written to the journal, logs, API responses, MCP
  responses, UI, or generated docs.
- HiveForge must not provide a read-secret operation.
- HiveForge must not persist decrypted secret values.
- Initial secret provisioning should be create-only. If a target secret already
  exists, HiveForge should fail explicitly.
- Secret rotation is a separate contract because Docker secrets are immutable in
  normal Swarm usage.
- Private runtime config must be treated as non-public operational data. It may
  be persisted only in an explicit runtime config store or generated runtime
  file under HiveForge-managed data, with values redacted from product outputs.
- Env file parsing must be deterministic and explicit. Missing mapped env names
  are hard failures.
- HiveForge must not infer secret/config mappings from `.env` names, Compose
  files, or existing Docker resources.

## Contract Direction

Project manifests continue to declare requirements by name:

```yaml
requirements:
  secrets:
    - skippybot-discord-token
  environment:
    - SKIPPYBOT_PUBLIC_URL
```

Provisioning satisfies those requirements before deployment. It does not replace
the manifest contract.

The future REST/MCP contract should include separate operations for:

- fetching the target provisioning public key,
- validating a mapping without values,
- provisioning encrypted runtime config,
- listing provisioned runtime config metadata with redacted values only.

## Consequences

This reduces manual operator work and allows an agent to migrate a local `.env`
into target runtime inputs without seeing or transmitting plaintext secrets
through model-visible payloads.

It adds a new trust boundary: the local helper/tool that reads `.env` must be
trusted to handle secret values outside model context. The selected HiveForge
target must be authenticated before provisioning, and encrypted payloads must be
bound to that target key.

The first implementation should stay narrow: Docker secret creation plus one
private runtime env store or generated runtime env file. Rotation, deletion,
bulk import discovery, and cross-environment sync should remain out of scope
until the create-only flow is proven.

## Alternatives Considered

- Keep manual operator provisioning only. This is simple but creates too much
  deployment friction for projects that currently use `.env`.
- Send secret values directly as MCP tool arguments. Rejected because values can
  enter model context, logs, traces, or transcripts.
- Let HiveForge read `.env` from the checked-out repo. Rejected because runtime
  values should not be committed to git and HiveForge must not infer deployment
  inputs from incidental files.
- Store all secrets in HiveForge. Rejected because HiveForge is not a secrets
  engine.
