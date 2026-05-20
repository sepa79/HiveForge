# JSONL Journal Storage

## Status

POC storage choice.

## Rule

The first POC stores operation journal events as JSON Lines in
`operations.jsonl` under `HIVEFORGE_JOURNAL_DIR`.

Each line is one event that must validate against
`docs/specs/journal/event.schema.json` before it is appended.

## Future Backend

SQLite is the likely next backend once journal querying, concurrency, and
migration needs are clearer. Code must depend on the `Journal` interface rather
than JSONL-specific details so the storage backend can change explicitly later.

JSONL is acceptable for the POC and local smoke flows. It is not the intended
long-term backend for a persistent deployment control plane that needs indexed
queries by project, environment, component, ref, status, or operation time.
