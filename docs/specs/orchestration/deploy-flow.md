# Deploy Flow Orchestration

## Status

Draft POC contract.

This file describes the current HiveWatch POC deploy flow. It is repo/ref-driven
because the POC uses a local HiveWatch-shaped repository fixture. The target v1
managed service flow is release-driven and is defined in
`docs/specs/releases.md`.

## Flow

The 0.5 deploy flow is:

1. checkout registered project ref,
2. inspect root and component manifests,
3. resolve non-secret runtime env for the selected project/profile,
4. validate selected profile eligibility for the current environment and
   declared runtime requirements,
5. run the declared component lifecycle action as the render/preparation phase,
6. for active deploy actions, inject HiveForge deployment metadata into the
   rendered Compose/Stack file,
7. validate rendered bind sources,
8. run the Docker deployment through HiveForge.

Each step is explicit. A failed step stops the flow; later steps do not run.
The action journal records the lifecycle operation outcome. The SQLite state DB
records the current deployment slot status and stable `deploymentId`.

Rendered Compose/Stack validation rejects Docker bind sources unless the source
is under `HIVEFORGE_BIND_SOURCE_DIR` or is an explicit system allowlist path such
as `/var/run/docker.sock`. HiveForge internal paths such as `/hf/...` are never
valid Docker bind sources.

## Non-goals

- No action fallback.
- No validation bypass.
- No implicit component discovery.
- No automatic resource creation during validation.
- No Docker access from project Ansible actions.
