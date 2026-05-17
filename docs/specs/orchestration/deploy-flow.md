# Deploy Flow Orchestration

## Status

Draft POC contract.

## Flow

The POC deploy flow is:

1. checkout allowlisted project ref,
2. inspect root and component manifests,
3. validate declared runtime requirements,
4. run the declared component lifecycle action.

Each step is explicit and journaled by its service. A failed step stops the flow;
later steps do not run.

## Non-goals

- No action fallback.
- No validation bypass.
- No implicit component discovery.
- No automatic resource creation during validation.
