# Operator Console UI

## Status

Draft POC contract.

## Rule

The operator console is a human-facing UI served by the HiveForge REST process.
It must use the same REST API and application services as external clients.
It must not implement separate deployment logic.

## Routes

- `/` serves the operator console HTML.
- `/ui/styles.css` serves UI styles.
- `/ui/app.js` serves UI behavior.

These routes are public so a browser can load the UI. REST API calls still
require the configured bearer token.

## Initial Views

- current environment summary,
- deployment inventory for the current environment,
- lifecycle action form,
- live operation status and logs,
- process-local operation history for inspect, register, and lifecycle attempts,
- recent journal events.

## Actions

The first UI can run lifecycle actions through:

```text
POST /operations/projects/{projectId}/actions/{component}/{action}
```

The UI polls `GET /operations/{operationId}` while the action runs. Completed
operation logs remain available from `GET /operations` and
`GET /operations/{operationId}` for as long as the HiveForge process is running.
The append-only journal remains the durable audit source.

Repository inspection, project registration, and registered-project inspection
also create process-local operation records. Failed pre-deploy attempts must be
visible in the operation history even when no deployment inventory row exists.

The UI sends the bearer token supplied by the user. Environment policy remains
server-side and is enforced before actions run.
