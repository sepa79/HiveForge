# Deploy Flow Orchestration

## Status

Draft POC contract.

This file describes the current HiveWatch POC deploy flow. It is repo/ref-driven
because the POC uses a local HiveWatch-shaped repository fixture. The target v1
managed service flow is release-driven and is defined in
`docs/specs/releases.md`.

## Flow

The 0.5 deploy flow is:

1. sparse checkout only `hiveforge.yaml` and `deploy/hiveforge/` from the
   registered project ref,
2. validate that the root project manifest declares HiveForge contract
   `version: "0.5"`,
3. checkout the full registered project ref,
4. inspect root and component manifests,
5. resolve non-secret runtime env for the selected project/profile,
6. validate selected profile eligibility for the current environment and
   declared runtime requirements,
7. prepare managed project files under HiveForge data and expose that project
   root to the action helper as `/hf`,
8. for active deploy actions, run the declared component lifecycle action as the
   render/preparation phase,
9. for active deploy actions, allocate or reuse the durable HiveForge
   `deploymentId` and runtime `deploymentName` for the deployment slot,
   reconciling the slot to `gone` first if HiveForge proves the recorded
   runtime disappeared outside HiveForge,
10. inject HiveForge deployment metadata into the rendered Compose/Stack file,
11. validate rendered bind sources,
12. run the selected HiveForge deployment executor.

Each step is explicit. A failed step stops the flow; later steps do not run.
The action journal records the lifecycle operation outcome. The SQLite state DB
records the current deployment slot status, stable `deploymentId`, selected
`executorKind`, runtime deployment name, and any executor-owned runtime ids such
as a Portainer stack id.
Docker Compose project names and Docker Swarm stack names use a runtime
deployment name. The default deployment name is the project id, for example
`hivewatch`. REST and MCP callers may pass an explicit `deploymentName` when
they need a separate runtime name, for example `hivewatch-canary`. Existing
deployment slots keep their stored deployment name; HiveForge rejects attempts
to silently rename an existing slot. The stable `deploymentId` is not used in
Docker project/stack names; Docker ownership is selected by the injected
`hiveforge.deployment=<deploymentId>` label.

The contract version gate runs before full checkout and before any project
action. A missing or unsupported root `version` is a breaking-change failure,
not a compatibility path.

Rendered Compose/Stack validation rejects Docker bind sources unless the source
is under `HIVEFORGE_BIND_SOURCE_DIR`, is an explicit system allowlist path such
as `/var/run/docker.sock`, or is listed in environment
`capabilities.bindSources.allowed`. HiveForge internal paths such as `/hf/...`
are never valid Docker bind sources.

For inactive lifecycle actions (`remove` and `purge`), HiveForge verifies that
the component declares the requested action, then removes the recorded runtime
through the selected deployment executor. It does not refresh managed files
before removal because those files may still be mounted by the running
workload.

If a recorded deployment slot is in `deployed` state and no longer has any
runtime objects with the exact `hiveforge.deployment=<deploymentId>` label,
HiveForge marks that slot `gone` instead of keeping it as an active blocker. A
later deploy may then reuse the slot with a new explicit deployment name or
executor owner. Slots in `preparing` or `failed` state are not auto-reconciled
to `gone`.

`docker-direct` Swarm removal runs `docker stack rm` for the recorded
deployment name and then waits until no services or containers remain with the
recorded `hiveforge.deployment` label. `docker-direct` single-host removal
removes containers and networks carrying the exact
`com.docker.compose.project` label for the recorded deployment name; it does
not guess or re-render a Compose file during removal. `portainer-stack` removal
uses the recorded Portainer `stackId`; it does not guess that id from stack
names or Docker labels.

## Non-goals

- No action fallback.
- No validation bypass.
- No implicit component discovery.
- No automatic resource creation during validation.
- No Docker access from project Ansible actions.
