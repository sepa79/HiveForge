# Capability Vocabulary

## Status

Draft target contract for portable profile matching.

## Rule

Capability names are HiveForge contract values, not environment names.

Projects declare profile requirements with this vocabulary. Environment-local
HiveForge services report available capabilities with the same vocabulary.
HiveForge decides whether a profile is deployable by matching requirements
against reported capabilities.

Do not encode provider details in this vocabulary. `ProxmoxSwarm`,
`NFT_TOOLS_AWS`, host paths, SSH users, node names, and registry URLs belong to
environment-local configuration, deployment vars, and policy, not to
profile requirements.

## Runtime Capabilities

`runtime` is a list because one environment-local HiveForge service may expose
more than one runtime.

| Value | Meaning |
|---|---|
| `docker-single` | Single Docker engine runtime. |
| `docker-swarm` | Docker Swarm runtime. |

## Capability Fields

| Value | Meaning |
|---|---|
| `managedRoot.shared` | Whether the configured HiveForge managed data root is shared across every runtime node that may run the selected profile. Container paths come from `HIVEFORGE_DATA_ROOT`; host-visible bind paths come from `HIVEFORGE_HOST_DATA_ROOT` when configured. Project profiles never declare those paths. |
| `managedRoot.nodes` | Explicit node names where a non-shared managed root is available. Required when `managedRoot.shared` is `false`. |
| `placement` | The environment supports explicit runtime placement constraints. |

## Managed Root

The current contract has exactly one HiveForge-managed root per environment. The
container root is configured as `HIVEFORGE_DATA_ROOT` for the HiveForge service.
When Docker bind mounts need host-visible paths, the matching host root is
configured explicitly as `HIVEFORGE_HOST_DATA_ROOT`.

Projects may require a shared root:

```yaml
requires:
  managedRoot:
    required: true
    shared: true
```

Projects may also require a non-shared root on an explicit node:

```yaml
requires:
  managedRoot:
    required: true
    shared: false
    node: docker-swarm-mgr-1
```

Profiles must not declare `/mnt/...`, `/opt/...`, EBS names, Proxmox storage
names, or host-specific layouts. HiveForge manages only its configured root. It
does not create arbitrary host directories or host mount points.

HiveForge must not silently pin a profile to a node. If a profile requires a
non-shared managed root, the profile must declare the node explicitly and the
environment must report that root on the same node.

Future per-node agents may introduce additional named roots. That is outside the
current contract.

## Registry Vars

Registry locations are not capabilities. They are deployment vars used when
rendering release artifacts such as Compose templates.

Project manifests may provide defaults:

```yaml
vars:
  imageRepository.project: ghcr.io/pockethive
  extRepository.docker: docker.io
  extRepository.ghcr: ghcr.io
```

Environment config may override them:

```yaml
vars:
  imageRepository.project: registry.lan:5000/pockethive
  extRepository.docker: company-cache.example.com/dockerhub
  extRepository.ghcr: company-cache.example.com/ghcr
```

Template rendering uses the merged vars. Missing vars are explicit
errors. HiveForge must not fall back to original registries when an environment
override is configured.

## Missing Capability Failure

Missing capabilities are explicit validation issues. HiveForge must not silently
switch profile, runtime, environment, or managed root.

Example issue:

```json
{
  "code": "managed-root-missing",
  "message": "Environment ProxmoxSwarm does not provide required HiveForge managed root",
  "requirement": "managedRoot"
}
```
