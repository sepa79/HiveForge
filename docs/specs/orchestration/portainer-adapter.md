# Portainer Deployment Adapter Plan

## Status

Planned after `0.5.5`.

## Purpose

HiveForge currently owns the final deployment step through direct Docker CLI
execution. That works for Docker Compose and Swarm, but it bypasses Portainer's
stack ownership model. A Portainer-managed environment then loses the normal
Portainer stack controls for the resources HiveForge deployed directly.

The target change is an explicit Portainer deployment adapter that keeps this
flow:

1. HiveForge checkout, inspection, validation, and managed-file preparation,
2. declared lifecycle action render/preparation,
3. rendered Compose/Stack validation,
4. final deploy/remove/restart/upgrade through Portainer's API instead of
   direct Docker mutation.

This is an adapter split, not a fallback chain. HiveForge must know which
runtime executor owns the environment and use exactly that executor.

## Current Baseline

Today the active deploy path ends in `DockerDeploymentService`, which:

- injects the `hiveforge.deployment=<deploymentId>` label into the rendered
  Compose file,
- validates bind sources,
- runs either `docker compose up -d` or `docker stack deploy`,
- removes Docker-owned deployments directly for inactive lifecycle actions.

That means HiveForge is the runtime owner whenever the final step runs. It also
means a future `restart` operation can be implemented directly only for
HiveForge-owned Docker deployments.

## Problem Statement

For environments where operators use Portainer as the stack control plane:

- HiveForge deploys outside Portainer ownership,
- Portainer cannot reliably manage those stacks as Portainer deployments,
- HiveForge cannot honestly expose one generic restart/remove/update behavior
  without knowing whether Docker or Portainer owns the deployment,
- deployment history and durable `deploymentId` data stay in HiveForge, but the
  runtime owner contract is ambiguous.

## Target Model

HiveForge should separate:

- action adapter: project-owned render/preparation, currently `ansible`,
- deployment executor: HiveForge-owned final runtime mutation.

The deployment executor must be explicit per environment. Planned executor ids:

- `docker-direct`
- `portainer-stack`

HiveForge must not silently try one and then the other.

## Planned Contract Changes

### 1. Environment configuration

Add one explicit environment-owned deployment executor setting. The exact field
name should be finalized in the environment config/schema work, but the shape
must distinguish:

- executor kind: `docker-direct` or `portainer-stack`,
- Portainer endpoint base URL when `portainer-stack` is selected,
- Portainer stack identity needed for update/restart/remove,
- authentication source for Portainer API access.

This must live in HiveForge-owned environment configuration, not in project
manifests.

### 2. Final deploy executor boundary

Replace the current implicit `DockerDeploymentService` dependency in the
orchestrator with one typed deployment-executor boundary.

Minimum executor operations:

- `deployRenderedCompose`
- `removeDeployment`
- `restartDeployment`
- `deploymentOwner`

`deploymentOwner` is needed so UI, REST, and MCP can expose only the operations
that the selected executor actually owns.

### 3. Durable deployment state

HiveForge must keep its own `deploymentId`, deployment name, project/component,
profile, environment id, and recorded rendered artifact regardless of executor.

Portainer ownership must not replace HiveForge's durable deployment inventory.
It only changes who performs the runtime mutation.

### 4. Restart semantics

Restart must become an explicit HiveForge operation with executor-specific
behavior:

- `docker-direct`: restart/update through direct Docker control of the
  HiveForge-owned runtime resources,
- `portainer-stack`: restart through Portainer's stack/container/service
  operation surface,
- unavailable when the selected executor cannot honestly implement it.

No synthetic fallback such as "try Portainer, then Docker" is allowed.

## Portainer Adapter Scope

The first Portainer slice should support only environments where HiveForge can
name one existing Portainer stack target explicitly.

In scope:

- Swarm stack deploy/update through Portainer API,
- remove through Portainer API,
- restart through Portainer API when Portainer exposes a concrete stack/service
  operation that maps cleanly,
- preserving HiveForge's rendered Compose artifact and deployment labels,
- explicit operator errors when Portainer auth, endpoint, or stack identity is
  missing.

Out of scope for the first slice:

- automatic Portainer endpoint discovery,
- guessing stack ids/names from Docker labels,
- importing arbitrary pre-existing Docker resources into Portainer,
- mixed ownership where some actions use Portainer and others mutate Docker
  directly,
- Compose-editor parity beyond the generated stack payload HiveForge already
  owns.

## Proposed Delivery Order

1. Define the environment config/schema for explicit executor selection.
2. Extract the deployment executor interface from the current Docker-only
   deploy/remove path.
3. Rename the current implementation conceptually to `docker-direct`.
4. Add a Portainer-backed executor for deploy/remove first.
5. Add restart as a new operation only after ownership is explicit.
6. Expose executor ownership and restart availability in REST, MCP, and UI.

## Acceptance

- A Portainer-managed environment can deploy through HiveForge without losing
  Portainer ownership of the stack.
- HiveForge still records one durable deployment inventory and rendered compose
  artifact for that deployment.
- Restart/remove/update availability is explicit and matches the selected
  executor.
- An environment misconfigured for Portainer fails explicitly before runtime
  mutation starts.
- HiveForge never falls back from `portainer-stack` to direct Docker mutation.
