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
