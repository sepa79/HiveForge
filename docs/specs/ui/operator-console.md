# Operator Console UI

## Status

Draft POC contract.

## Rule

The operator console is a human-facing UI served by the HiveForge REST process.
It must use the same REST API and application services as external clients.
It must not implement separate deployment logic.

## Routes

- `/` serves the operator console HTML.
- `/ui`, `/ui/overview`, `/ui/deployments`, `/ui/actions`, and `/ui/activity`
  serve copyable operator-console view URLs.
- `/ui/styles.css` serves UI styles.
- `/ui/app.js` serves UI behavior.

These routes are public so a browser can load the UI. REST API calls still
require the configured bearer token.
REST API paths such as `/deployments` remain API endpoints and must not be made
public UI aliases.

## Initial Views

- current environment summary,
- runtime-first deployment inventory for the current environment,
- lifecycle action form,
- live operation status and logs,
- unified activity view for process-local operations and durable journal events.

## Actions

The first UI can run lifecycle actions through:

```text
POST /operations/projects/{projectId}/actions/{component}/{action}
```

The UI polls `GET /operations/{operationId}` while the action runs. Completed
operation logs remain available from `GET /operations` and
`GET /operations/{operationId}` for as long as the HiveForge process is running.
The append-only journal remains the durable audit source.

The human-facing Activity view combines `/operations` and `/journal` into one
master-detail screen. The list should prioritize operator meaning over raw
identifiers: action, target project/component, status, ref, profile, relative
time, duration, and the failure/success reason. Raw operation ids, journal event
ids, full timestamps, stdout, stderr, and other debug metadata belong in the
selected activity detail.

Activity correlation must be explicit. The UI may merge records that share the
same `operationId`, and it may merge a lifecycle wrapper operation with the
durable `run_action` journal event referenced by
`operation.result.actionOperationId`. It must not infer correlation by matching
timestamps, project names, refs, or message text.

The Activity list must be bounded with explicit pagination controls. It must not
render an unbounded/infinite operation or journal list into the page. Page
changes should keep the list and selected detail in sync.

Repository inspection, project registration, and registered-project inspection
also create process-local operation records. Failed pre-deploy attempts must be
visible in Activity even when no deployment inventory row exists.

The UI sends the bearer token supplied by the user. Environment policy remains
server-side and is enforced before actions run.

Before an operator runs a selected lifecycle action, the Actions view provides
an explicit **Check prerequisites** control. It calls:

```text
POST /projects/{projectId}/deploy-prerequisites
```

with the selected git ref, component, action, and optional profile. The result
is the same `DeployPrerequisitesReport` used by REST and MCP; the UI must not
recalculate readiness, parse failure text, or infer missing resources itself.

The panel groups HiveForge-managed, manual, and release prerequisites. Every
item renders its `present`, `missing`, `unknown`, or `not_applicable` status,
required name when supplied, and backend reason. A placement-label item renders
the required labels and the evidence for every active ready node, showing each
node's value for the required keys and whether it satisfies all labels.

Changing project, ref, component, action, or profile clears the old report.
Responses for an earlier selection must be discarded rather than displayed for
the new selection. The check remains explicit and read-only; it does not create
labels, mounts, secrets, policy, runtime env values, or managed files. A
successful report does not replace the server-side validation performed when
the action starts.

## Deployments View

The Deployments view is the operator's answer to "what is deployed and is it
running?". The primary status shown in the list must come from deployment
runtime evidence, not from HiveForge's recorded state table.

The list uses `/deployments` as the inventory source and
`/deployments/runtime-status` to show the runtime status for each deployment.
Each deployment row also shows the recorded HiveForge executor ownership
(`docker-direct` or `portainer-stack`) so the operator can see which runtime
owner controls that slot.
The default filter is `Active`, which hides `removed` and `gone` deployments
but keeps runtime problems visible. `Missing`, `Unhealthy`, `Exited`,
`Unknown`, and runtime-status lookup failures are active problems, not
historical entries.

The detail pane for a selected deployment uses `/deployments/diagnostics` and
renders the one canonical post-deploy report in this order:

1. summary and selected deployment identity;
2. actual runtime evidence;
3. diagnostics findings, including rendered service, runtime resource, node,
   bind source/target, and safe evidence when present;
4. expected services, bind mounts, and placement constraints derived only from
   the recorded Compose/Stack artifact;
5. recorded Compose artifact status and content, including digest/redaction;
6. HiveForge managed-root visibility state and reason.

The Overview screen also shows the current environment contract, including the
selected runtime owner and any non-secret Portainer endpoint metadata exposed
by the REST contract.

If runtime diagnostics are unavailable, the UI shows the explicit
`unknown` report state and redacted reason. It must not replace it with a name
lookup, a green status, or a different runtime adapter. HiveForge recorded
state, operation ids, deployment ids, labels, and compose source metadata are
debug/context fields, not the primary status.

Runtime summaries must stay scan-friendly. When many services report the same
replica state, the UI should summarize that repeated state instead of rendering
a long comma-separated replica list. Long service names, image references, task
names, operation ids, and compose snippets must stay inside their panel bounds.
Asynchronous runtime and diagnostics refreshes must not reset the operator's
scroll position while they are reading the Deployments view.

The UI must not infer Docker ownership from names. Runtime lookup and
diagnostics must use the explicit HiveForge deployment selector/label contract
implemented by the REST API.
