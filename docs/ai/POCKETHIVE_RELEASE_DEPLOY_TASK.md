# PocketHive Release Deploy Task

## Goal

Implement the HiveForge side of PocketHive release/test deployment so HiveForge
deploys already-built images from an explicit registry/tag set instead of
running PocketHive builds during deploy.

## Context

PocketHive now has a minimal HiveForge POC manifest:

- `/home/sepa/PocketHive/hiveforge.yaml`
- `/home/sepa/PocketHive/deploy/hiveforge/components/stack/hiveforge.yaml`
- `/home/sepa/PocketHive/deploy/hiveforge/components/stack/ansible/*.yml`
- `/home/sepa/PocketHive/docs/HIVEFORGE.md`

That POC supports only profile `local-full` and runs:

- `deploy` -> `./build-hive.sh --quick`
- `update` -> `./build-hive.sh --quick`
- `remove` -> `./build-hive.sh --clean`

This is intentionally only a compatibility bridge for the current repo/ref-driven
HiveForge POC. It is not the target deployment model for PocketHive.

The desired flow is:

1. PocketHive images are built outside HiveForge.
2. Images are pushed to an explicit registry, for example a Proxmox-local
   registry from WSL.
3. HiveForge receives explicit deployment inputs such as:
   - `imageRepository.project=192.168.88.54:5000/pockethive`
   - `release.imageTag=dev-20260521-1415-gd6819e34`
4. HiveForge validates and deploys those exact image refs.

GitHub/GHCR is only one possible registry source. The local Proxmox registry
workflow must be supported without GitHub CI.

PocketHive already has local registry build/push tooling:
`tools/docker/remote-images.sh`. Do not invent a parallel image build/push
interface in HiveForge. HiveForge consumes the registry/tag output of that
tooling.

## Scope

- Add a first release/image-tag-set deployment contract in HiveForge.
- Add an explicit MCP operator input for release deployment or image-tag-set
  deployment. REST may exist as internal transport behind MCP, and CLI may
  exist for maintainer/debug use, but users and AI operators must use MCP.
- Render deployment artifacts from explicit variables:
  - `imageRepository.project`
  - `release.imageTag`
  - `extRepository.docker`
  - `extRepository.ghcr`
- Validate that rendered application image refs are registry-qualified and do
  not rely on implicit `latest`.
- Scope the no-`latest` validation to PocketHive application images for the
  first release/test deploy path. PocketHive currently still has third-party
  infrastructure images with `latest` or no tag in `docker-compose.yml`; pinning
  or templating those is a separate PocketHive follow-up unless this task
  explicitly expands scope.
- Preserve environment capability + policy checks before deploy.
- Add tests using a PocketHive-like fixture.

## Non-scope

- Do not build PocketHive images inside HiveForge deploy actions.
- Do not push images from HiveForge.
- Do not infer tags from git branches, git refs, dirty state, or local Docker
  images.
- Do not add fallback from missing registry artifacts to local images.
- Do not silently select another profile/runtime/environment.

## Constraints

- Follow HiveForge `AGENTS.md`.
- NFF: missing vars, missing image refs, unsupported profile, or unsupported
  action must fail explicitly.
- SSOT: put schema/contract changes in the existing specs/schema structure.
- No implicit `latest` for the release/test deploy path.
- Existing repo/ref-driven HiveWatch POC behavior should remain explicit and
  tested; do not turn release deploy into a hidden fallback for it.

## Affected areas

- `docs/specs/releases.md`
- `docs/specs/deployment-artifacts.md`
- `docs/specs/manifest.schema.json`
- `docs/specs/api/openapi.yaml`
- `docs/specs/mcp/tools.md`
- `docs/ai/USE_HIVEFORGE.md`
- `docs/ai/PROMPTS.md`
- `src/cli/main.ts`
- `src/server/rest-api.ts`
- `src/mcp/server.ts`
- `src/operation/deploy-orchestrator.ts`
- new or existing artifact rendering/validation modules
- tests under `tests/contracts`, `tests/operation`, `tests/server`, `tests/mcp`

## Suggested Implementation Shape

Introduce a deploy request shape that can carry one of:

- `releaseRef` resolved to known artifacts later, or
- explicit `imageTagSet` / `release.imageTag` for the first implementation.

For the first useful PocketHive test path, support explicit vars:

```yaml
imageRepository.project: 192.168.88.54:5000/pockethive
release.imageTag: dev-20260521-1415-gd6819e34
extRepository.docker: docker.io
extRepository.ghcr: ghcr.io
```

PocketHive's current compose/env bridge expects `DOCKER_REGISTRY` with a
trailing slash and `POCKETHIVE_VERSION` as the image tag. If the first
implementation renders through PocketHive compose artifacts, map:

```text
DOCKER_REGISTRY={{ imageRepository.project }}/
POCKETHIVE_VERSION={{ release.imageTag }}
```

Do not rely on `${DOCKER_REGISTRY:-}` or `${POCKETHIVE_VERSION:-latest}`
defaults in the release/test deploy path.

Render image refs like:

```text
{{ imageRepository.project }}/orchestrator:{{ release.imageTag }}
{{ imageRepository.project }}/processor:{{ release.imageTag }}
{{ extRepository.docker }}/library/rabbitmq:3.13-management-alpine
{{ extRepository.ghcr }}/shopify/toxiproxy:2.11.0
```

Reject unresolved template variables and reject app image refs without an
explicit non-`latest` tag or digest.

Use PocketHive's real image set when creating fixtures or PocketHive follow-up
artifacts. The current source of truth is `/home/sepa/PocketHive/tools/docker/image-manifest.sh`,
which includes app/runtime images such as `auth-service`, `orchestrator`,
`scenario-manager`, `network-proxy-manager`, UI images, and worker images. Do
not hardcode only the illustrative examples above.

Clarify the template source in implementation before coding:

- Either release artifacts contain all deployment templates HiveForge needs, or
- release metadata explicitly points to the repository ref that contains those
  templates.

Do not silently use a branch/ref checkout as a fallback when release artifact
metadata is missing.

## PocketHive Follow-up After HiveForge

After HiveForge supports the release/test deploy contract, return to
`/home/sepa/PocketHive` and replace the POC `build-hive.sh --quick` HF action
with release artifacts/templates that HiveForge can render and deploy.

PocketHive already has local registry build/push tooling:

```bash
tools/docker/remote-images.sh \
  --registry 192.168.88.54:5000 \
  --namespace pockethive \
  --tag dev-YYYYMMDD-HHMM-g<sha> \
  --push
```

That tool rejects `--tag latest` and uses `tools/docker/image-manifest.sh` as
the image list source. PocketHive follow-up should reuse or extend that path,
not create a second build/push convention.

Also verify PocketHive's GHCR workflow before relying on GHCR for a full stack
release. At the time this task was written, `/home/sepa/PocketHive/.github/workflows/publish-images.yml`
published tag/manual builds. `docs/GHCR_SETUP.md` is stale: it describes
publish-on-main and an older image list.

## Risks

- Accidentally reintroducing `latest` as a hidden default.
- Blurring repo/ref POC deploy and release-driven deploy into one ambiguous
  path.
- Rendering compose files with missing vars instead of failing before action.
- Skipping environment policy/capability checks for release deploy.
- Treating third-party infrastructure image tags and PocketHive application
  image tags as one validation class before PocketHive has pinned/template
  coverage for both.
- Depending on the current `project.vars.imageRepository.project:
  ghcr.io/pockethive` default as if it were a verified GHCR path. The current
  PocketHive workflow publishes under `ghcr.io/<owner>/pockethive/...`.

## Acceptance Criteria

- A HiveForge user can request a PocketHive-like deploy from explicit registry
  and tag inputs without running a build.
- Missing `release.imageTag` or `imageRepository.project` fails before any
  deploy action runs.
- Rendered app image refs are explicit and registry-qualified.
- `latest` is rejected for PocketHive-style release/test deploy unless there is
  a documented explicit exception approved by a human.
- Existing HiveWatch POC tests still pass.
- New tests cover positive and negative PocketHive-like release deploy cases.

## Required Hats

- Architect
- Tester
- Reviewer
- Jester

## Evidence Required

- `npm run check`
- Contract/schema tests for new deploy input/artifact shape.
- MCP tool contract tests for the release deploy operator path.
- Operation tests proving no build command is invoked in release deploy.
- Negative tests for missing vars, implicit `latest`, and non-qualified image
  refs.
