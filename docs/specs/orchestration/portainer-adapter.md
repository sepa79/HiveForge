# Portainer Deployment Executor

## Status

Draft contract. The first deploy/update/remove slice is implemented in `0.5.6`.

## Purpose

HiveForge separates project-owned render/preparation from the final
runtime-mutation step. For `portainer-stack` environments, that final step must
go through Portainer's API so Portainer remains the runtime owner of the stack.

This executor keeps the normal HiveForge flow:

1. checkout, inspect, validate, and prepare managed files,
2. run the declared lifecycle action as render/preparation,
3. validate the rendered Compose/Stack artifact,
4. deploy/update/remove through Portainer's API.

This is an explicit executor split, not a fallback chain. HiveForge must know
which runtime executor owns the environment and use exactly that executor.

## Environment Contract

Environment config selects the runtime owner explicitly:

```yaml
deployment:
  executor: portainer-stack
  portainer:
    baseUrl: https://portainer.example.com:9443/api
    endpointId: 3
    apiKey: ptr_xxxxx
    tlsInsecureSkipVerify: true
```

This contract is environment-owned, not project-owned. `portainer-stack`
requires a Swarm runtime. HiveForge must not auto-discover endpoints, prompt
for alternate credentials, or fall back to direct Docker mutation.

If the configured Portainer API uses a self-signed or otherwise untrusted TLS
certificate, the environment may opt in explicitly with
`tlsInsecureSkipVerify: true`. The default remains normal certificate
verification.

## Deployment Executor Boundary

HiveForge keeps one shared pre-executor preparation path. It must:

- allocate or reuse the durable `deploymentId` and `deploymentName`,
- inject `hiveforge.deployment=<deploymentId>` into the rendered Compose file,
- validate rendered bind sources,
- record the durable HiveForge deployment slot before runtime mutation.

Executors mutate runtime only. They must not silently skip or re-interpret
those shared checks.

The current executor boundary exposes:

- `executorKind`
- `deploy`
- `remove`

Restart is not implemented in this first Portainer slice.

## Durable Deployment State

HiveForge keeps its own durable deployment inventory regardless of executor.
Each deployment row stores:

- HiveForge `deploymentId`
- HiveForge `deploymentName`
- `executorKind`
- environment/project/component/profile state

For `portainer-stack`, HiveForge also stores:

- `portainer.endpointId`
- `portainer.stackId`
- `portainer.stackName`

`portainer.stackId` is the stable runtime identity after the first successful
create. HiveForge must use that id for later update/remove operations.
`portainer.stackName` is operator/debug metadata only.
`portainer.endpointId` is part of the active slot identity as well. HiveForge
must fail explicitly if an existing active slot is later pointed at a different
Portainer endpoint.

## Implemented Slice

`portainer-stack` currently supports:

- create of one Swarm stack through Portainer,
- update of an existing Portainer-managed stack by recorded `stackId`,
- remove by recorded `stackId`,
- explicit failure when the Portainer config, endpoint id, or recorded stack id
  is missing.

Portainer create reads the Swarm cluster id from the configured endpoint and
stores the returned stack identity in HiveForge state.

## Scope

In scope:

- Swarm stack deploy/update through Portainer API,
- remove through Portainer API,
- preserving HiveForge rendered Compose artifacts and deployment labels,
- explicit operator errors when Portainer auth, endpoint, or stack identity is
  missing.

Out of scope in this slice:

- automatic Portainer endpoint discovery,
- guessing stack ids/names from Docker labels,
- importing arbitrary pre-existing Docker resources into Portainer,
- mixed ownership where some actions use Portainer and others mutate Docker
  directly,
- changing a configured HiveForge install from `docker-direct` to
  `portainer-stack` or back,
- restart via Portainer API,
- Compose-editor parity beyond the generated stack payload HiveForge already
  owns.

## Acceptance

- A Portainer-managed environment can deploy through HiveForge without losing
  Portainer ownership of the stack.
- HiveForge still records one durable deployment inventory and rendered compose
  artifact for that deployment.
- HiveForge records the selected executor kind for every durable deployment and
  stores Portainer `stackId` for Portainer-owned deployments.
- Remove/update availability is explicit and matches the selected executor.
- An environment misconfigured for Portainer fails explicitly before runtime
  mutation starts.
- HiveForge never falls back from `portainer-stack` to direct Docker mutation.
