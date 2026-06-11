# Portable Release Deployment Profiles

## Status

Draft target contract for PocketHive/HiveMind-style managed-service
deployments. This is the canonical design note for portable release deployment
profiles and environment capability matching.

## Goal

HiveForge should support deployable projects such as PocketHive through a
portable, release-driven contract.

PocketHive must not know anything about a concrete operator environment such as
Proxmox, lab IPs, SSH, host paths, or local mount layout. It declares that it is
HiveForge-compatible and exposes portable deployment profiles such as:

- `single-reduced`
- `single-full`
- `swarm-reduced`
- `swarm-full`

HiveForge decides where a project/profile can be deployed by matching profile
requirements against capabilities reported by environment-local HiveForge
services.

## Core Principles

- Release-driven v1: deploy already-published containers/release artifacts.
- No build or push in the HiveForge deploy flow.
- No implicit `latest`.
- No deriving image tags from git refs.
- Repository inspection/bootstrap is useful, but repo checkout is not the
  deployment source of truth.
- Project profiles are portable runtime shapes, not target environments.
- Environment/provider details stay inside environment-local HiveForge services.
- No SSH/Proxmox/host-specific assumptions in project contracts.
- No fallback mapping. A missing capability means explicit `not deployable here`.

## Project Profiles

Profiles are declared by the project root manifest and are portable runtime
shapes.

Example:

```yaml
profiles:
  - id: single-reduced
    runtime: docker-single
    serviceSet: reduced
    requires:
      managedRoot:
        required: true
        shared: false
        node: docker-single-1

  - id: swarm-reduced
    runtime: docker-swarm
    serviceSet: reduced
    requires:
      managedRoot:
        required: true
        shared: true
      capabilities:
        - placement
```

Profiles must not include:

- Proxmox names,
- IP addresses,
- SSH users or keys,
- concrete mount paths,
- environment-specific registry URLs.

## Environment Capability Reports

Environment-local HiveForge services report concrete capabilities.

Example:

```json
{
  "environmentId": "ProxmoxSwarm",
  "capabilities": {
    "runtime": ["docker-swarm"],
    "managedRoot": {
      "shared": true
    },
    "placement": true
  }
}
```

Another operator can expose a different environment id and implementation while
keeping the project contract unchanged:

```json
{
  "environmentId": "NFT_TOOLS_AWS",
  "capabilities": {
    "runtime": ["docker-swarm"],
    "managedRoot": {
      "shared": true
    },
    "placement": true
  }
}
```

The project contract stays identical.

## Matching Rule

HiveForge computes deployment eligibility as:

```text
profile requirements subset-of environment capabilities
```

Do not hardcode:

```text
ProxmoxSwarm -> swarm-reduced
```

Instead match:

```text
swarm-reduced requires docker-swarm + shared managedRoot + placement
environment reports those capabilities
therefore deployment is eligible
```

For the current v1 contract, registry and ingress are not profile capabilities.
Registry locations are deployment vars. Service exposure is handled by the
selected Compose/template/runtime shape.

If a capability is missing, return structured validation issues explaining
exactly what is missing.

Eligibility is not authorization. A deployment is allowed only when:

```text
requirements subset-of capabilities
AND environment policy allows project/profile/action/release
```

## Release Deployment Input

A release deploy request names:

- project id,
- environment id,
- profile,
- release ref or explicit image tag set,
- component,
- action.

Release inputs point to already-published artifacts.

HiveForge validates:

- image tag shape,
- registry-qualified image refs,
- resolved image references after variable rendering,
- profile requirements against environment capabilities,
- environment policy for project/profile/action/release.

HiveForge must not:

- build images,
- push images,
- use local images as fallback,
- infer tags from branch names,
- silently switch environment, runtime, or profile.

## Registry Variable Overlay

Release artifact templates may use registry aliases instead of hardcoded image
prefixes.

Project defaults:

```yaml
project:
  vars:
    imageRepository.project: ghcr.io/pockethive
    extRepository.docker: docker.io
    extRepository.ghcr: ghcr.io
```

Example template usage:

```yaml
services:
  rabbitmq:
    image: "{{ extRepository.docker }}/library/rabbitmq:3.13-management-alpine"

  toxiproxy:
    image: "{{ extRepository.ghcr }}/shopify/toxiproxy:2.11.0"

  orchestrator:
    image: "{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}"
```

Environment override for a local Proxmox lab:

```yaml
vars:
  imageRepository.project: registry.lan:5000/pockethive
```

Environment override for a corporate proxy registry:

```yaml
vars:
  imageRepository.project: company-cache.example.com/pockethive
  extRepository.docker: company-cache.example.com/dockerhub
  extRepository.ghcr: company-cache.example.com/ghcr
```

Merge order:

```text
project vars + environment vars + release vars
```

Later sources override earlier sources. A template variable with no resolved
value is a hard failure. HiveForge must not silently fall back to `docker.io`,
`ghcr.io`, local images, or any other registry source.

## API And MCP Contract Direction

The current POC API/MCP surface can list environments and run generic lifecycle
actions. The release-driven v1 surface needs explicit operations:

- list environment capability reports,
- match project profiles to environments,
- deploy or upgrade a selected component/action to an explicit release ref or
  image tag set.

The profile matching response must include both eligible and ineligible results.
Ineligible results must carry structured missing-capability issues, not a single
free-form string.

Sketch:

```json
{
  "projectId": "pockethive",
  "matches": [
    {
      "environmentId": "ProxmoxSwarm",
      "profile": "swarm-reduced",
      "eligible": true,
      "issues": []
    },
    {
      "environmentId": "ProxmoxSingle",
      "profile": "swarm-reduced",
      "eligible": false,
      "issues": [
        {
          "code": "runtime-missing",
          "requirement": "runtime.docker-swarm",
          "message": "Environment ProxmoxSingle does not provide required runtime docker-swarm"
        }
      ]
    }
  ]
}
```

## Actions Model

HiveForge has canonical lifecycle action names:

- `deploy`
- `remove`
- `purge`
- `update`
- `upgrade`

The project root manifest declares the subset it exposes. Managed components
implement that exact project action subset. Missing or extra component actions
fail project registry/manifest validation.

## PocketHive Use Case

PocketHive should declare portable profiles such as:

- `single-reduced`: reduced single-node runtime shape,
- `single-full`: full single-node runtime shape,
- `swarm-reduced`: reduced Swarm runtime,
- `swarm-full`: full Swarm runtime with managed root and placement.

In one dev lab, environment-local HiveForge services may be named
`ProxmoxSingle` and `ProxmoxSwarm`. In another operator setup, they may be
`NFT_TOOLS_OnPrem` and `NFT_TOOLS_AWS`.

PocketHive must not change. HiveForge matches PocketHive profiles to whichever
environments report compatible capabilities.

## Test Slice Assumptions

The next Proxmox smoke slice should test the simplified contract:

- one HiveForge-managed root derived from the runtime root as `data/`,
- portable profile matching on `runtime`, `managedRoot.shared`,
  `managedRoot.nodes`, and optionally `placement`,
- registry aliases as deployment vars, not capabilities,
- explicit release/image tag input,
- managed file preparation under the HiveForge data root,
- action execution and journal recording.

The smoke slice should not test:

- multiple managed roots,
- per-node agents,
- automatic image build or push,
- implicit `latest`,
- fallback from missing registry aliases to public registries,
- provider-specific profile names.

## Future Agent Per Node

A future per-node HiveForge agent may report additional node-local roots, such
as a dedicated ClickHouse root mounted on one Swarm node. Those roots are still
policy-controlled environment resources. They are not project-declared host
paths.

This is not part of the current slice.

## Non-Goals

- Do not implement provider-specific Proxmox logic in project profiles.
- Do not require SSH as part of the HiveForge project contract.
- Do not make HiveForge infer topology from Docker Compose.
- Do not add fallback behavior for missing images, missing capabilities, or
  unsupported profiles.
