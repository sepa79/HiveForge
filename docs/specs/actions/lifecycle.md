# Deployment Lifecycle Actions

## Status

Draft POC contract.

## Rule

HiveForge has a canonical lifecycle action vocabulary:

- `deploy`
- `remove`
- `purge`
- `update`
- `upgrade`

Each project root manifest declares the subset of canonical lifecycle actions
the project exposes. Each managed component manifest then declares the component
implementation for that project action subset.

HiveForge does not infer aliases such as `start`, `stop`, `destroy`,
`redeploy`, or environment-specific suffixes. A request must name one of the
declared project lifecycle actions exactly.

For a project registry build to succeed, every managed component must implement
the project action subset exactly:

- missing project action on a component is a hard failure,
- extra component action outside the project action subset is a hard failure,
- action names remain limited to the canonical lifecycle vocabulary.

## Semantics

`deploy`

Create or reconcile runtime resources for the declared component version and
configuration. The action must not delete persistent data.

`remove`

Stop and remove runtime resources while preserving persistent data such as
volumes, external databases, and secrets.

`purge`

Remove runtime resources and persistent data owned by the component. This is a
destructive action and must require explicit operator intent in the action
implementation.

`update`

Refresh the same declared deployment line without changing lifecycle contract
or data ownership. For container-based deployments this usually means pulling
the currently declared image tags and reconciling the stack. The action must not
delete persistent data.

`upgrade`

Move the component to a newer declared release line where migrations,
configuration shape changes, or data compatibility risks may exist. This action
must require explicit operator intent in the action implementation.

## POC Notes

Requirements are currently declared at component scope, not per action. Until
action-scoped requirements exist, a component-level environment requirement is
validated for every lifecycle action.
