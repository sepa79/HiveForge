# PocketHive Post-Checkout Runtime Files Task

## Goal

Add HiveForge release-deploy support for preparing runtime files from the
checked-out repository into the HiveForge-managed project root before release
deployment.

PocketHive should not commit magic ZIP bundles. HiveForge already has a managed
files contract: project-declared `artifacts.managedPaths` are copied from the
checked-out repository into the managed project tree under
the derived runtime data root.

The missing piece is wiring that existing managed file preparation into the
release deploy pipeline.

## Context

PocketHive will keep build/push outside HiveForge:

```bash
tools/docker/remote-images.sh \
  --registry 192.168.88.54:5000 \
  --namespace pockethive \
  --tag dev-YYYYMMDD-HHMM-g<sha> \
  --push
```

HiveForge release deploy then consumes explicit vars:

```text
imageRepository.project=192.168.88.54:5000/pockethive
release.imageTag=dev-YYYYMMDD-HHMM-g<sha>
```

The missing piece is runtime file preparation: compose/stack templates,
scenarios, WireMock files, TCP mock mappings, RabbitMQ/Grafana/Prometheus/Loki
config, and any files that must be present under the target shared project root.

The user preference is explicit:

- do not rely on prebuilt ZIPs committed to PocketHive,
- do not create hidden local state,
- copy only files declared by the project manifest,
- keep output under the HiveForge-managed project root.

## Desired Flow

```text
HiveForge receives deploy request
HiveForge checks out PocketHive ref
HiveForge validates project and profile
HiveForge prepares declared managed paths into shared project root
HiveForge validates required runtime files under the managed project root
HiveForge deploys rendered stack from explicit image vars
HiveForge journals each step
```

## Required Capability

HiveForge needs release-deploy orchestration support for the existing
project-declared managed paths.

PocketHive should declare managed paths in the root manifest:

```yaml
artifacts:
  managedPaths:
    - name: runtime-compose
      source: deploy/hiveforge/runtime/compose
      target: artifacts/pockethive-runtime/compose
      mode: replace
    - name: runtime-config
      source: deploy/hiveforge/runtime/config
      target: artifacts/pockethive-runtime/config
      mode: replace
    - name: runtime-scenarios
      source: scenarios
      target: artifacts/pockethive-runtime/scenarios
      mode: replace
```

Release deployment orchestration should be able to run:

```text
checkout -> inspect manifests -> prepare managedPaths -> validate runtime files -> stack deploy-release
```

Do not introduce action dependencies or an implicit `package` action for this
slice. Managed file preparation is already a HiveForge-owned step, not a
project action.

## Environment Contract For Release Deploy

When HiveForge later calls a release deploy action, it must pass explicit
managed root environment variables. The existing managed files service already
returns:

```text
HIVEFORGE_PROJECT_DIR
HIVEFORGE_STACK_DIR
HIVEFORGE_ARTIFACTS_DIR
```

For release/test deploy, also pass release vars in a documented form. Prefer a
single JSON file over dotted shell variables:

```text
HIVEFORGE_RELEASE_VARS_FILE=<HIVEFORGE_ARTIFACTS_DIR>/release-vars.json
```

The JSON file should contain the resolved deployment vars used by
`prepare_release_deploy`, for example:

```json
{
  "imageRepository.project": "192.168.88.54:5000/pockethive",
  "release.imageTag": "dev-YYYYMMDD-HHMM-g<sha>",
  "extRepository.docker": "docker.io",
  "extRepository.ghcr": "ghcr.io"
}
```

Do not rely on unstructured ambient shell variables for dotted variable names.

## Expected Managed Files Output

Managed paths are copied under `HIVEFORGE_PROJECT_DIR`, usually below
`HIVEFORGE_ARTIFACTS_DIR`, for example:

```text
HIVEFORGE_ARTIFACTS_DIR/pockethive-runtime/
  compose/
    docker-compose.yml
    compose.swarm.yml
    compose.reduced.yml
  config/
    rabbitmq/
    prometheus/
    grafana/
    loki/
    clickhouse/
    nginx/
  scenarios/
  wiremock/
  tcp-mock/
```

PocketHive may initially copy legacy source files such as
`deploy/compose.proxmox-swarm.yml`, but the output path and artifact names
should be environment-neutral.

HiveForge should validate that the expected output exists before deploy.

## Scope

- Wire managed file preparation into release deploy orchestration.
- Use explicit `artifacts.managedPaths`; do not infer paths from repository
  layout.
- Pass managed root env vars to later release deploy actions.
- Add required-output validation for PocketHive-like runtime files.
- Journal/progress managed file preparation separately from deploy.
- Add tests proving managed file preparation happens after checkout and before
  release deploy.
- Add negative tests for missing managed path sources and missing required
  runtime files.

## Non-Scope

- Do not build PocketHive images in HiveForge.
- Do not push images from HiveForge.
- Do not SSH to Proxmox from PocketHive scripts.
- Do not require committed ZIP artifacts.
- Do not introduce a `package` action by convention.
- Do not run project-declared Ansible just to copy files that HiveForge can copy
  through `managedPaths`.

## PocketHive Follow-Up

After HiveForge supports this release pipeline, PocketHive should add explicit
managed paths to `hiveforge.yaml`, pointing at reviewable runtime files such as:

```text
deploy/hiveforge/runtime/compose/
deploy/hiveforge/runtime/config/
scenarios/
wiremock/
tcp-mock/
```

The existing PocketHive POC bridge:

```text
deploy/hiveforge/components/stack/ansible/deploy.yml -> build-hive.sh --quick
```

should remain unchanged until HiveForge has the release deploy pipeline.

## Acceptance Criteria

- HiveForge can prepare declared PocketHive-like runtime files after checkout.
- Release deploy receives explicit managed root/artifact env vars.
- Release deploy fails before stack deploy if required runtime files are
  missing.
- No hidden fallback to committed ZIPs, local images, `latest`, or branch-derived
  tags exists.
- Managed file preparation and deploy are separately visible in journal/progress.
- Existing HiveWatch POC behavior remains explicit and tested.

## Required Hats

- Architect
- Tester
- Reviewer
- Jester

## Evidence Required

- `npm run check`
- Unit/operation tests for checkout -> managed files -> release validation
  sequencing.
- Negative tests for missing managed path source and missing required runtime
  output.
- MCP/REST contract updates only if release deploy exposes managed file
  selection.
