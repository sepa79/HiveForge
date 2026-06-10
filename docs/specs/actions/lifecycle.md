# Deployment Lifecycle Actions

## Status

Draft 0.5 contract.

## Rule

HiveForge has a canonical lifecycle action vocabulary:

- `deploy`
- `remove`
- `purge`
- `update`
- `upgrade`

Each project root manifest declares the canonical lifecycle vocabulary allowed
for the project. Each managed component manifest then declares the subset it
actually implements.

HiveForge does not infer aliases such as `start`, `stop`, `destroy`,
`redeploy`, or environment-specific suffixes. A request must name one of the
declared component lifecycle actions exactly.

For a project registry build to succeed:

- every component action must be part of the root manifest's allowed lifecycle
  vocabulary,
- components may implement different lifecycle action subsets,
- a run request for an action not declared by the selected component is a hard
  failure,
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
