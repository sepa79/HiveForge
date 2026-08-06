# Deployment Diagnostics Report

Status: draft semantic contract. The exact REST payload is canonical in
[`api/openapi.yaml`](api/openapi.yaml) as `DeploymentDiagnosticsResult`; this
document defines the meaning, sources, and failure rules for that payload.

## Purpose

`diagnose_deployment` answers one post-deploy question:

```text
What did HiveForge expect this deployment to create, what does Docker/Swarm
currently expose for it, and what concrete evidence explains a problem?
```

It is a read-only diagnostic for a durable HiveForge deployment record. It is
not a deployment action, a Docker log reader, a re-render operation, or a
pre-deploy readiness check.

## Identity and scope

`deploymentId` is the canonical identity. It is the value returned by
`list_deployments` and is the only selector accepted by the MCP tool.

REST may resolve `projectId`, `component`, and optional `profile` through the
current environment's deployment-state store for the operator UI. That is a
lookup convenience only: it must never infer a deployment from Docker object,
Compose, stack, or container names. A selector that resolves no deployment
returns explicit `state.status: missing` and diagnostic `missing` status.

Pre-deploy readiness remains the separate `explain_deploy_prerequisites`
contract. It requires a git ref and lifecycle action, may inspect a registered
project, and answers a different question: whether an action should start.
`diagnose_deployment` must not invoke it implicitly or create a checkout while
an operator is debugging a deployed instance.

## Evidence model

The report joins these independently-owned evidence sources:

| Section | Authority | Rule |
|---|---|---|
| `state` | SQLite deployment state | Resolves identity, project/ref/component/profile, last action, and recorded operation. |
| `runtime` | Docker/Swarm queried only by `hiveforge.deployment=<deploymentId>` | No ownership inference from names. |
| `compose` | Compose/Stack artifact recorded on the deployment operation | Never re-render or substitute a current checkout. |
| `composeValidation` | Parsed recorded artifact plus configured bind-source policy | Valid only when the recorded artifact is readable. |
| `hiveforge` | HiveForge runtime-path and managed-root diagnostics | Managed-root verification remains manual and non-blocking. |
| `analysis` | Pure correlation of the evidence above | Produces expected resources, actual resources, and actionable findings. |

`analysis.expected` comes only from the recorded artifact. `analysis.actual`
comes only from Docker/Swarm label-selected objects. If either source is
unavailable, the report must say so explicitly; it must not reconstruct the
missing side from names or current project source.

## Status and findings

`analysis.summary` has these meanings:

- `ok`: labelled runtime evidence is healthy and no warning/error finding was
  produced.
- `degraded`: known runtime or artifact evidence contains a warning or error.
- `missing`: HiveForge state or the label-selected runtime object is missing.
- `unknown`: a required diagnostic source could not establish the current
  result. This is never rendered as healthy.

Each finding carries a stable `type`, severity, human-readable message, and
only the optional fields supported by evidence: rendered service, Docker
resource, node, bind source/target, and redacted evidence lines. Docker/Swarm
messages such as `no suitable node` and bind-source failures are retained when
safe to expose. Secret-looking values are redacted before they enter any report
field.

When Docker/Swarm status cannot be read, the report returns explicit `unknown`
runtime evidence and an `unknown_ownership` finding with the redacted reason.
It does not turn a diagnostic transport failure into a successful report, and
it does not attempt a second adapter or hostname-based lookup.

## Operator presentation

UI, REST, and MCP consume the same report. The deployment detail view presents
it in this order:

1. summary and selected deployment identity;
2. actual Docker/Swarm runtime evidence;
3. findings, including service/node/path correlation and safe evidence;
4. expected services and bind-source/placement evidence from the recorded
   artifact;
5. recorded Compose artifact status/content, including digest and redaction;
6. HiveForge runtime-path and managed-root state.

The UI may summarize long lists, but it must not discard a finding, convert
`unknown` to green, or hide an artifact/digest mismatch. It must not display
secret values, full inspect payloads, or full container logs.

## Non-goals

- Automatically running `verify_managed_root_access`.
- Creating labels, mounts, secrets, policy, or runtime environment values.
- Re-running project actions or fetching full logs.
- Treating an Ansible exit code as proof that Docker/Swarm converged.
- Reconstructing expected resources from Docker names when recorded evidence is
  absent.

## Acceptance

- A Swarm placement failure identifies the label-selected service, rendered
  placement constraints, and Docker's safe error text.
- A bind-source failure identifies the rendered service, source, target, and
  node when Docker supplies it.
- Restart loops, failed task repetition, exit hints, missing state/resources,
  unavailable Docker diagnostics, unreadable artifacts, and digest mismatch are
  distinguishable.
- All report paths are covered by service, REST/MCP contract, and UI rendering
  tests; no transport adds a second diagnostic interpretation.
