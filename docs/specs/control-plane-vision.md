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
- explicit REST bearer token.

Still pending:

- MCP server implementation,
- richer UI action history and repository bootstrap workflows.
