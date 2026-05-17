# Review Checks — HiveForge

Use this before preparing or reviewing a PR/change.

## General checks

- Scope is clear and not wider than requested.
- No unrelated refactors.
- Naming is understandable.
- Code follows project style.
- Behavior changes are documented.
- Tests cover meaningful behavior.
- Failure paths are considered.
- Logs/metrics/errors are useful.
- No secrets or personal data are added.
- No hidden fallback or compatibility shim is introduced.
- Contracts/specs are updated before or with implementation changes.

## Tech-stack-specific checks

Node/TypeScript:
- Keep TypeScript strict.
- Keep package scripts in `docs/ai/COMMANDS.md`.
- Contract validation must load canonical schemas from `docs/specs/`.
- Do not duplicate schema shapes in DTOs without documenting why.
- Keep ESM imports explicit and compatible with `NodeNext`.
- Tests should cover explicit failure paths, not only valid fixtures.

## Contract/spec checks

- Public API or message changes have a matching spec update.
- Config/env changes are documented.
- Breaking changes are explicit.
- Idempotency is considered for create/append/publish operations.

## Evidence expected

- Commands run.
- Tests passed/failed.
- Manual checks performed.
- Risks/TODOs left behind.
