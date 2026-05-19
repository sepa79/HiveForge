# Runtime Requirement Validation

## Status

Draft POC contract.

## Rule

Before running a declared action, HiveForge validates requirements declared in
the component manifest:

- Docker volumes,
- Docker secrets,
- environment variables,
- declared action files.

Missing requirements are explicit failures. HiveForge does not create missing
resources during validation and does not fall back to alternate names or adapter
behavior.

## Docker Probe

The POC Docker probe checks the target environment through explicit Docker CLI
inspect commands:

- `docker volume inspect <name>`
- `docker secret inspect <name>`

The probe reports only existence. Secret values are never read or returned.

## Journal

Validation outcomes are recorded as `validate_requirements` journal events.

## Known Gaps

The POC validation contract is not sufficient for deploying HiveMind or another
long-running production service. Before HiveForge is used for that class of
deployment, the validation contract needs explicit checks for:

- image tag shape and presence,
- resolved image references after deployment var rendering,
- referenced Compose or stack files,
- Docker networks,
- published port conflicts or policy,
- bind mounts and required host paths,

These checks must be declared in the manifest contract before implementation.
HiveForge must fail explicitly when a declared requirement is missing or cannot
be verified.

External host mounts are validation-only unless they are exposed as an explicit
HiveForge-managed root. HiveForge must not create those mounts. A future
per-node agent may expose a node-local managed root, but it must be configured
explicitly and validated like the main HiveForge root.

## Managed Files

Root manifests may declare `artifacts.managedPaths`. Before running a lifecycle
action, HiveForge prepares each managed path under:

```text
<HIVEFORGE_DATA_ROOT>/deployed/<projectId>/
```

For the current contract, each managed path uses `mode: replace`: HiveForge
removes the target path inside the project managed tree and copies the declared
source path from the checked-out repository. Sources and targets are explicit
relative paths. Missing sources, path traversal, absolute paths, duplicate
targets, and nested target collisions are hard failures.
