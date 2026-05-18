# Release Deployment Contract

## Status

Draft target contract for PocketHive/HiveMind-style deployments. This is the
desired v1 deployment model for managed services, not the current HiveWatch POC
implementation.

## Rule

Production-like project deployment is release-driven, not repo-driven.

A deploy request for this contract names:

- project id,
- environment id,
- profile,
- release ref or image tag set,
- component/action.

The release inputs point to already-published deployment artifacts. HiveForge
does not build or push container images in this contract.

## Image Artifacts

Projects declare the images they need and how release inputs map to those
images. Images must be registry-qualified before deployment.

`releaseRef` and `imageTagSet` are different inputs:

- `releaseRef` names a published project release that HiveForge resolves to
  declared artifacts.
- `imageTagSet` carries explicit registry-qualified image refs for the selected
  deployment.

HiveForge must not derive either value from a git branch, git ref, local Docker
image, or implicit `latest`.

HiveForge validates:

- image tag shape,
- registry-qualified image references,
- registry reachability,
- image presence for the selected release,
- profile requirements against environment capabilities,
- environment policy for the selected project/profile/action/release.

Missing or unreachable images are explicit failures.

## Managed Files

Project repositories may still provide manifests, compose templates, Grafana
dashboards, scenarios, layouts, and other managed files. Those files are copied
or rendered into the HiveForge managed project tree under
`HIVEFORGE_DATA_ROOT`.

Managed files are deployment inputs, but the deployable runtime version is the
selected release or image tag set. HiveForge must not silently use a branch name
as an image tag.

## Repository Inspection

Repository inspection remains useful for bootstrap and validation:

- inspect a candidate repository,
- verify HiveForge manifests and managed files,
- register a deployable project,
- help agents create or repair BasePOC/ManagedService files.

Repository checkout is not required for a release deployment once HiveForge has
the registered project metadata and release artifact contract it needs. If a
deployment needs managed files from a repository, the required repository ref is
explicit release metadata, not an implicit deploy source.

## Local Git

`local-git` project sources are development and smoke-test tooling. They are not
the PocketHive/HiveMind v1 managed service deployment contract.

## Profile Eligibility

Release deployment uses portable profiles from `docs/specs/profiles.md` and
capability reports from `docs/specs/environments.md`.

HiveForge must reject a release deployment when the selected environment does
not report every capability required by the selected profile. The rejection must
identify missing runtime, registry, ingress, managed root, or named capability
requirements.

Capability eligibility does not replace policy. Environment policy still decides
which project/profile/action/release combinations are allowed after capability
matching succeeds.

## Non-Goals

- No image build.
- No image push.
- No implicit `latest`.
- No deriving release identity from a git branch by convention.
- No fallback from missing registry artifacts to local images.
