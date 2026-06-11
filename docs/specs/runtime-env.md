# Runtime Environment Config

## Status

Draft POC contract.

## Rule

Runtime environment config is for non-secret deployment/runtime values that are
needed by declared HiveForge actions but must not be committed to a consumer
project repository.

It is not a secret store. Operators must not put passwords, API tokens,
private keys, or other secret values in runtime environment config. Secrets must
be provided outside this contract, for example through Docker secrets,
operator-prepared files, Portainer-managed values, or a future HiveForge secret
store.

## Storage

The canonical file format is `docs/specs/config/runtime-env.schema.json`.

The default runtime container stores the file under the derived runtime data
root:

```text
<runtime-root>/data/runtime-env.json
```

For the default runtime-root install this resolves to:

```text
/hf/data/runtime-env.json
```

HiveForge initializes a missing file with:

```json
{
  "version": 1,
  "entries": []
}
```

HiveForge must not create `.env` files in project repositories, read consumer
project `.env` files automatically, or infer values from Compose files.

## Scope

Each entry is scoped by:

- `projectId` - required,
- `profile` - optional.

Resolution order is explicit:

1. project-level values,
2. profile-level values for the selected profile.

Profile-level values override project-level values with the same key. If no
profile is selected, only project-level values are applied.

## Variable Names

Runtime env keys must match:

```text
^(?!HIVEFORGE_)[A-Z][A-Z0-9_]*$
```

`HIVEFORGE_*` is reserved for HiveForge-managed values such as
`HIVEFORGE_PROFILE`, `HIVEFORGE_RENDERED_COMPOSE_FILE`, and
`HIVEFORGE_BIND_SOURCE_DIR`.

Values are strings. Empty strings are allowed when a project explicitly needs an
empty runtime value.

## API/MCP Behavior

Operators can list, set, and unset runtime env through REST/MCP. Values are
returned by list/set/unset because this contract is non-secret.

Setting values updates only the exact scope provided by the request. Unsetting
keys removes only those keys from the exact scope.

## Deployment Behavior

Before `validate_requirements` and `start_action`, HiveForge resolves runtime
env for the requested project/profile and passes it to requirement validation
and the declared action process.

The action process environment is assembled in this order:

1. inherited HiveForge container process environment,
2. resolved runtime env,
3. HiveForge-managed action env such as managed file paths,
4. `HIVEFORGE_PROFILE` when a profile is selected.

Runtime env can satisfy component manifest `requirements.environment` entries.
Missing runtime env remains an explicit validation failure.

## Non-goals

- No secret encryption.
- No secret masking guarantees for these values.
- No automatic `.env` ingestion.
- No fallback from missing variables to Compose defaults.
- No component-level scoping in the POC slice.
