# Known Problems - HiveForge

Status: living triage document for production pain that is not yet fully
captured by canonical specs or tests.

This file is not a contract. When a problem becomes implementation work, promote
the accepted behavior into the relevant `docs/specs/` document and tests.

## Rules For Fixes

- No silent fallbacks.
- No automatic creation of missing Docker labels, mounts, secrets, or policy.
- No guessing deployment requirements from names.
- Project/profile requirements must be explicit and visible before deploy.
- Rendered artifacts used for Docker/Swarm must be inspectable after deploy.

## HF-PROBLEM-001: Swarm Placement Labels Are Not Validated

Severity: high.

Observed failure: PocketHive deploy can complete from HiveForge's point of view
while Swarm leaves services unscheduled with `no suitable node`. A concrete
case is a `swarm-full` stateful service whose dedicated data root is constrained
to a labelled node, for example:

```text
node.labels.pockethive.redis == true
```

The home lab works when the test swarm has the required labels, for example:

```text
docker-swarm-mgr-1 pockethive.redis=true
```

The same profile fails on an environment where no node has that label.

Current HiveForge gap:

- The component manifest currently validates declared environment variables and
  broad profile capabilities.
- The existing `placement` capability only says the environment supports
  placement. It does not prove that a concrete node label required by the
  selected project/profile exists.
- A lifecycle action can render and deploy a valid stack file, then Docker Swarm
  can fail placement later. HiveForge reports action success but the runtime is
  degraded.

Required behavior:

- Before deploy, HiveForge must be able to show and validate concrete
  project/profile placement requirements against the current environment node
  inventory.
- Missing label requirements must fail explicitly before deployment, with the
  exact missing key/value and the selected project/profile/action.
- HiveForge must not create the missing labels automatically.
- `refresh_environment` must be part of the operator/agent path when node labels
  may have changed.

Contract work needed:

- Extend the profile or deployment-artifact contract with explicit node-label
  requirements. Do not rely on broad `capabilities.placement` as sufficient.
- Decide whether rendered Compose constraint parsing is diagnostic evidence only
  or part of a declared restricted-deploy validation flow. If parsing is used,
  document it as such and keep the result visible to the operator.
- Update `validate_requirements` / deploy-prerequisite output so agents and UI
  can report missing labels before `start_action`.

Test work needed:

- Add a regression test where a Swarm profile requires a concrete stateful
  placement label such as `pockethive.redis=true`, the environment has
  `placement: true`, but no node has the label. Validation must fail before
  deploy.
- Add an e2e/smoke check that fails when the stack contains Swarm placement
  constraints not satisfied by the refreshed environment inventory.

## HF-PROBLEM-002: UI Does Not Show What A Project/Profile Requires

Severity: high.

Current operator pain: the UI lets an operator select a project/profile/action,
but does not give a complete, readable answer to:

```text
What does this selected project/profile need from this environment before deploy?
```

The operator should not need to inspect repo files, compose YAML, journal JSON,
or MCP output to discover missing labels, runtime env keys, policy, managed-root
constraints, or manual infrastructure prerequisites.

Required behavior:

- The project/profile UI must show declared requirements for the selected
  project, component, action, and profile.
- The UI must show current environment evidence next to each requirement:
  satisfied, missing, unknown, or not applicable.
- For Swarm placement, the UI must list required labels and the nodes that
  currently have or miss them.
- Unknown must stay visible as `unknown`; it must not be rendered as healthy.
- Copyable remediation snippets are acceptable only when generated explicitly by
  backend prerequisite output.

Contract work needed:

- Promote the project-centered operator view requirements from
  `docs/ai/HIVEFORGE_0_5_PLAN.md` into `docs/specs/ui/operator-console.md`.
- Ensure the UI uses the same prerequisite/validation services as REST and MCP.
- Define one backend shape for prerequisite results so UI, REST, and MCP do not
  drift.

Test work needed:

- UI tests for missing label, missing runtime env, and unknown diagnostic states.
- Server/API tests proving project/profile prerequisite data includes concrete
  node-label evidence when placement requirements exist.

## HF-PROBLEM-003: Rendered Compose/Stack Is Not Visible In UI

Severity: high.

Current operator pain: after an action renders or uses a Compose/Stack artifact,
the UI does not expose that artifact clearly enough for troubleshooting.

HiveForge already has API/MCP direction for recorded rendered Compose artifacts:
`get_deployment_compose` reads the artifact recorded in the action journal and
does not re-render or guess paths. The human UI needs the same visibility.

Required behavior:

- For each deployment operation that records a Compose/Stack artifact, the UI
  must show a clear link or panel for the recorded artifact.
- The view must include artifact path, digest/size, whether the current file
  still matches the recorded journal evidence, and redacted content when
  readable.
- The UI must show an explicit missing state when no artifact was recorded or
  the recorded file is no longer readable.
- The UI should expose parsed bind sources and placement-relevant constraints as
  diagnostics, without turning diagnostics into hidden compatibility behavior.

Contract work needed:

- Promote the rendered artifact UI behavior into
  `docs/specs/ui/operator-console.md`.
- Keep artifact retrieval tied to recorded operation evidence. Do not re-render
  Compose from the current checkout as a fallback.

Test work needed:

- UI/API tests for present, missing, unreadable, digest-changed, and redacted
  Compose artifact states.
- Regression test that an action failure after writing the artifact still leaves
  the recorded artifact discoverable.
