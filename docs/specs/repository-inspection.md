# Repository Inspection

## Status

Draft POC contract.

## Rule

Repository inspection is a read-only bootstrap path. It may inspect a repository
that is not yet deploy-registered, but it must not run project actions.

HiveForge clones the requested repository/ref to an isolated temporary
workspace, loads `hiveforge.yaml`, validates listed component manifests, and
checks that declared action files exist.

Supported repository sources are explicit GitHub HTTPS URLs, explicit
`file:///` Git URLs, and explicit LAN/internal `http://` Git URLs whose path ends
in `.git`. Inspection does not discover alternate repository URLs.

## Output

The result reports whether the repository is deployable by HiveForge:

- `deployable: true` with project, profiles, components, and lifecycle actions,
- `deployable: false` with an explicit reason.

## Boundary

Inspection is not deployment authorization. Deployment still requires the repo
and ref to be present in the project registry for the target environment.
