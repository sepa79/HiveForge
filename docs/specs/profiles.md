# Deployment Profiles

## Status

Draft contract.

## Rule

A project may declare deployment profiles in its root `hiveforge.yaml`.

Profiles describe portable runtime shapes for the same project. They declare
requirements, not concrete target environments.

Profiles must not be used as hidden fallbacks. A deployment implementation must
fail when a requested profile is missing, empty, unsupported, or not matched by
the selected environment capabilities.

## Shape

Root manifest profiles use this shape:

```yaml
profiles:
  - id: swarm-reduced
    runtime: docker-swarm
    serviceSet: reduced
    requires:
      managedRoot:
        required: true
        shared: true
      capabilities:
        - placement
```

Fields:

- `id` - portable profile name used in REST, CLI, MCP, UI, and policy.
- `runtime` - runtime requirement from `docs/specs/capabilities.md`.
- `serviceSet` - project-defined service shape, such as `reduced` or `full`.
- `requires.managedRoot.required` - whether the profile requires the configured
  HiveForge data root.
- `requires.managedRoot.shared` - when `true`, the profile requires a shared
  root. When `false`, the profile must also declare `node`.
- `requires.managedRoot.node` - explicit runtime node for a non-shared root.
- `requires.capabilities` - additional named capabilities from the capability
  vocabulary.

Profiles must not include provider names, IPs, SSH details, concrete host paths,
or environment-specific registry URLs.

## Matching

HiveForge computes eligibility by checking that profile requirements are a
subset of environment capabilities.

```text
profile requirements subset-of environment capabilities
```

Missing requirements are structured validation issues. HiveForge must not
silently select another profile, runtime, or environment.

HiveForge must not silently choose placement for a non-shared root. If a profile
requires `managedRoot.shared: false`, it must declare `managedRoot.node`, and
the environment must report that node under `managedRoot.nodes`.

Eligibility is separate from policy. Deployment is allowed only when the profile
matches environment capabilities and the environment policy allows the selected
project/profile/action/release.

## HiveWatch POC Profiles

HiveWatch may declare POC profiles:

- `normal` - HiveWatch service plus its database,
- `test` - `normal` plus the example/dummy stack used for local validation.

For the current POC, HiveWatch Ansible actions read the selected profile from
`HIVEFORGE_PROFILE`. The value must be either `normal` or `test`.

These POC profiles still use the portable object shape. They are not target
environment names.

## Contract Surface

Profiles are first-class request fields for REST, CLI, and MCP validation/action
calls. HiveForge normalizes the requested profile once, checks it against the
current environment policy and capabilities, and passes it to action runners as
`HIVEFORGE_PROFILE` for the POC action runner.
