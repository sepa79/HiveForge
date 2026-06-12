# PocketHive Release Deploy Slices

## Goal

Add the HiveForge side of PocketHive release/test deployment without turning the
current repo/ref POC into a hidden release mechanism.

The target operator path is MCP. REST may exist only as internal transport
behind MCP, and CLI may exist only for maintainer/debug use.

## Current State

- HiveForge currently supports repo/ref lifecycle actions through `start_action`.
- `docs/specs/releases.md` and `docs/specs/deployment-artifacts.md` define the
  release-driven target model.
- The broader 0.5.1 direction splits deployment execution into explicit trust
  modes. PocketHive release deploy belongs to `restricted` mode: project actions
  may prepare/render artifacts, but HiveForge owns Docker deploy/remove/purge.
  This does not remove `trusted` project-owned Ansible actions for consumers
  such as SkippyBot.
- The broader 0.5.1 direction also separates `admin` from `operator`: admins
  register projects, edit policy, and approve risky mounts; operators deploy
  already-approved project/profile/action/trustMode combinations.
- `src/config/deployment-vars.ts` already has explicit project/environment/release
  var overlay helpers.
- PocketHive currently has a HiveForge POC action that runs `build-hive.sh
  --quick`; this must remain separate from release deploy.

## Slice 0 - Plan And Contracts

Status: done.

Deliverables:

- Keep this slice plan in `docs/ai/`.
- Keep the detailed task in `docs/ai/POCKETHIVE_RELEASE_DEPLOY_TASK.md`.
- Update MCP/API/spec docs only where the first implementation actually adds a
  runnable surface.

Done when:

- HiveForge has a written implementation slice plan.
- PocketHive has a separate continuation handoff doc.

## Slice 1 - Release Input And Image Validation

Purpose: add the contract-level guardrails before any deploy action exists.

Deliverables:

- Add a typed release deploy input shape.
- Support explicit image tag set input with:
  - `projectId`
  - `component`
  - `action`
  - `profile`
  - `imageRepository.project`
  - `release.imageTag`
  - optional `extRepository.docker`
  - optional `extRepository.ghcr`
- Add validation helpers for PocketHive-style app image refs:
  - registry-qualified ref required,
  - explicit non-`latest` tag or digest required,
  - unresolved template vars rejected,
  - missing `imageRepository.project` / `release.imageTag` rejected.
- Add tests under `tests/config` or `tests/release`.

Non-goals:

- No action execution.
- No Docker registry probing.
- No compose rendering.
- No REST/MCP route yet unless needed for test shape.

Done when:

- Unit tests prove positive and negative image-tag-set validation.
- `npm run check` passes.

## Slice 2 - Release Operation Service

Purpose: wire release validation into a HiveForge operation without running
PocketHive builds.

Status: implemented as an internal prepare service. It validates and returns a
resolved release plan; it does not execute actions yet.

Deliverables:

- Add a release deploy service/orchestrator separate from the repo/ref
  `DeployOrchestrator.deploy` path.
- Preserve environment policy checks for project/profile/action.
- Preserve profile capability checks.
- Return a clear operation/result shape with resolved vars and app image refs.
- Fail before action execution when release inputs are invalid.

Decision for the first implementation: release deploy validates and renders a
release plan only. Action execution is deferred until artifact rendering and
MCP/REST transport are explicit.

Do not silently checkout a repo ref as template source unless release metadata
explicitly names that ref.

Done when:

- Operation tests prove invalid inputs fail before actions.
- Operation tests prove no build command is invoked.

## Slice 3 - MCP Tool

Purpose: expose the operator path.

Status: implemented as prepare-only `prepare_release_deploy`.

Deliverables:

- Add `prepare_release_deploy` to `docs/specs/mcp/tools.md`.
- Add MCP runtime/client/server support for `prepare_release_deploy`.
- Add MCP tests proving the tool name and request shape.
- Keep REST documented as internal transport only.

Done when:

- MCP tests prove `prepare_release_deploy` is registered and calls the release
  endpoint.
- User-facing docs instruct MCP, not REST.

## Slice 4 - Internal REST Transport

Purpose: give MCP a stable internal endpoint.

Status: implemented as prepare-only internal transport.

Deliverables:

- Add an internal REST route:
  `POST /operations/projects/:projectId/releases/:component/:action`
- Accept typed release input in the body.
- Return the resolved release prepare plan.
- Update OpenAPI as internal transport contract.

Done when:

- REST tests prove bad requests return explicit 400 errors.
- REST tests prove valid requests reach release service.

## Slice 5 - Artifact Rendering

Purpose: render deployment artifacts from explicit vars.

Status: implemented for prepare-only release artifacts with image templates and
env templates.

Deliverables:

- Add a minimal template renderer or use an existing structured rendering path.
- Render vars from:

```text
project vars + environment vars + release vars
```

- Reject unresolved vars.
- For PocketHive compose compatibility, support explicit mapping:

```text
DOCKER_REGISTRY={{ imageRepository.project }}/
POCKETHIVE_VERSION={{ release.imageTag }}
```

Done when:

- Tests prove missing vars fail.
- Tests prove no `${POCKETHIVE_VERSION:-latest}` fallback is relied on.

## Slice 6 - PocketHive Fixture

Purpose: keep behavior grounded in the real consumer shape without importing
PocketHive internals into HiveForge.

Status: implemented as a PocketHive-like release artifact unit fixture.

Deliverables:

- Add a PocketHive-like test fixture with multiple app images:
  - `auth-service`
  - `orchestrator`
  - `scenario-manager`
  - `network-proxy-manager`
  - `ui-v2`
  - one worker such as `processor`
- Validate app images only in this first slice.
- Leave third-party infra image pinning to PocketHive follow-up unless scope is
  explicitly expanded.

Done when:

- Positive fixture passes with `registry.lan:5000/pockethive` and a dev tag.
- Negative fixtures fail for `latest`, unqualified refs, and missing vars.

## Slice 7 - Managed Runtime Files

Purpose: wire existing `artifacts.managedPaths` preparation into the release
deploy pipeline so checked-out runtime files are copied to the HiveForge-managed
project root before stack deployment.

Status: implemented for prepare-only `prepare_release_deploy` with `gitRef`,
`managedPaths`, release vars file output, and required runtime file validation.
Separate async operation/progress tracking remains for the execution slice.

This slice is implemented in HiveForge.

Deliverables:

- Checkout and inspect the requested PocketHive ref.
- Prepare declared `artifacts.managedPaths` into the project action root `/hf`.
- Write explicit release vars in a documented file under `/hf/artifacts`.
- Validate required runtime files before stack deployment.
- Journal/progress managed file preparation separately from deploy in the later
  action execution slice.

Done when:

- A test proves checkout -> managed files -> release validation sequencing.
- Missing managed path sources fail through `ManagedFilesService` before
  deployment.
- Missing required runtime files fail before deployment.

## Slice 8 - PocketHive Integration

Purpose: switch PocketHive from compatibility bridge to restricted release
artifacts and managed runtime files.

For the broader HiveForge 0.5.x MCP/readiness plan, including the breaking
`prepare_release_deploy` rename, deploy prerequisites
reporting, and workspace cleanup planning, see
`docs/ai/HIVEFORGE_0_5_PLAN.md`.

This slice is implemented in `/home/sepa/PocketHive`, not HiveForge.

Deliverables:

- Replace HiveForge POC action that runs `build-hive.sh --quick`.
- Add PocketHive release artifacts/templates that HiveForge can render.
- Add explicit `artifacts.managedPaths` for runtime compose/config/scenario
  files.
- Reuse `tools/docker/remote-images.sh` for local registry image publication.
- Fix stale GHCR docs.
- Declare PocketHive's HiveForge release path as `restricted`, not `trusted`.
- Surface an operator approval warning when the rendered PocketHive artifact
  mounts `/var/run/docker.sock` into an application service. That warning does
  not grant Docker access to the action runner.
- Require admin approval for that risky-mount approval. Normal operators may
  deploy only after the project/ref/profile/action/trustMode and any required
  risky-mount approval are already in policy.

Done when:

- A PocketHive dev tag pushed to local registry can be selected in HiveForge MCP.
- Deploy path does not build or push images.
- Runtime files are copied from checkout into the HiveForge-managed project
  root, not loaded from committed ZIPs or hidden local state.
- Docker changes are applied by HiveForge's restricted executor, not by
  PocketHive repo/ref Ansible actions.

## Hard Rules Across All Slices

- No hidden fallback from release deploy to repo/ref action deploy.
- No hidden fallback from restricted release deploy to trusted project-owned
  Ansible.
- No normal operator path for registering PocketHive, widening policy, enabling
  trusted mode, or approving `/var/run/docker.sock` mounts.
- No deriving tags from branch names, git refs, dirty state, or local images.
- No implicit `latest`.
- No Docker host/SSH/Proxmox details in PocketHive project contracts.
- Missing config fails explicitly before action execution.
