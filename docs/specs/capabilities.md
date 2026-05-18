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
environment-local configuration and policy, not to project manifests.

## Runtime Capabilities

`runtime` is a list because one environment-local HiveForge service may expose
more than one runtime.

| Value | Meaning |
|---|---|
| `docker-single` | Single Docker engine runtime. |
| `docker-swarm` | Docker Swarm runtime. |

## Boolean Capabilities

| Value | Meaning |
|---|---|
| `registry` | The environment can reach the registry source required by release artifacts. Registry URL and auth remain environment-local. |
| `ingress` | The environment can expose service endpoints through its configured ingress model. |
| `placement` | The environment supports explicit runtime placement constraints. |
| `shared-runtime-root` | The environment exposes a HiveForge-managed root that is shared across the selected runtime nodes. |

## Managed Roots

`managedRoots` is a list of logical root names available to HiveForge in that
environment.

Managed root names are not paths. The environment-local HiveForge service maps a
logical root name to the actual mounted path. Projects may require roots such as
`scenarios-runtime` or `stack-root`, but must not declare `/mnt/...`,
`/opt/...`, EBS names, Proxmox storage names, or host-specific layouts.

HiveForge manages only roots that are explicitly reported by the environment.
It does not create arbitrary host directories or host mount points.

## Missing Capability Failure

Missing capabilities are explicit validation issues. HiveForge must not silently
switch profile, runtime, environment, registry source, or managed root.

Example issue:

```json
{
  "code": "managed-root-missing",
  "message": "Environment ProxmoxSwarm does not provide required managed root scenarios-runtime",
  "requirement": "managedRoots.scenarios-runtime"
}
```
