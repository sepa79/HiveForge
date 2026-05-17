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
- recent journal events.

## Actions

The first UI can run lifecycle actions through:

```text
POST /projects/{projectId}/actions/{component}/{action}
```

The UI sends the bearer token supplied by the user. Environment policy remains
server-side and is enforced before actions run.
