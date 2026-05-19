# HiveForge Control Plane Vision

## Status

Direction-setting draft.

## Goal

HiveForge is the control plane a human or AI agent uses to bootstrap and operate
deployable projects across known environments.

## User Story

A user has a new project repository. They already have access to HiveForge MCP.
The agent uses HiveForge to inspect the repository, determine whether it is
deployable, bootstrap missing HiveForge files when needed, and then deploy the
project only to explicitly known environments.

A user can also open the HiveForge UI for one environment, see what is deployed
there, and run lifecycle actions such as deploy, update, upgrade, remove, and
purge.

## Core Concepts

- `Environment` - a known deployment target with explicit capabilities.
- `Project` - a repository with HiveForge manifests and declared components.
- `Profile` - an explicit runtime shape of a project.
- `Deployment` - a project/component/ref/profile currently known on an
  environment.
- `Operation` - a journaled lifecycle or inspection action.

## Boundary

Repository inspection is not deployment authorization.

HiveForge may inspect a user-provided repository in read-only mode to determine
whether it contains valid HiveForge manifests. Deployment still requires the
repository/ref/action/profile to be allowed for the target environment.

## Current Iteration

Implemented now:

- known environment config,
- REST environment listing,
- environment-scoped project/profile/action policy,
- read-only repository inspection,
- profile passed in action/validation requests,
- per-operation profile environment passed to Ansible,
- first deployment inventory derived from the operation journal,
- bundled POC operator console,
- explicit REST bearer token,
- POC MCP stdio server backed by the REST API.

Client and MCP endpoint selection:

- a HiveForge service instance is environment-local,
- clients may keep a friendly list of known HiveForge URLs,
- after connection, the selected HiveForge reports the actual environment and
  capabilities,
- deployment actions run in that selected HiveForge environment only,
- client-side friendly names and cached endpoint metadata never infer runtime,
  placement, root sharing, registry mirrors, or eligibility.

Still pending:

- durable client-side known-HiveForge endpoint configuration,
- MCP client UX for selecting one known HiveForge endpoint and then displaying
  the reported environment/capabilities,
- repository bootstrap tools,
- richer UI action history and repository bootstrap workflows.

## Future Direction: Per-Node Agent

The current deployment model assumes HiveForge runs on the target environment
and manages files under its own mounted root. That keeps file lifecycle work
simple: checkout, render/copy into the managed root, then run declared
lifecycle actions.

A future extension may add a per-node HiveForge agent for resources that must
live on a specific Docker/Swarm node. Example: a ClickHouse component may
require a dedicated `HF_EBS` mount on `Master 2`. In that model, the node agent
would expose that mount as an explicit named managed root. Project/component
manifests would reference the named root and placement constraints.

This is not part of the current POC. The rule remains: HiveForge manages only
explicitly configured roots and manifest-declared contents. It does not create
arbitrary host mounts or replace Docker/Swarm.
