# Deployment Profiles

## Status

Draft POC contract.

## Rule

A project may declare deployment profiles in its root `hiveforge.yaml`.

Profiles describe explicit runtime shapes for the same project. They must not be
used as hidden fallbacks. A deployment implementation must fail when a requested
profile is missing, empty, or unsupported.

## HiveWatch POC Profiles

HiveWatch declares:

- `normal` - HiveWatch service plus its database,
- `test` - `normal` plus the example/dummy stack used for local validation.

For the current POC, HiveWatch Ansible actions read the selected profile from
`HIVEFORGE_PROFILE`. The value must be either `normal` or `test`.

## Contract Surface

Profiles are first-class request fields for REST, CLI, and MCP validation/action
calls. HiveForge normalizes the requested profile once, checks it against the
current environment policy, and passes it to action runners as
`HIVEFORGE_PROFILE`.
