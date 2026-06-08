# Ansible Action Runner

## Status

Draft POC contract.

## Rule

HiveForge runs only actions declared in a managed component manifest.

For the POC, the only supported adapter is `ansible`. A run request must name:

- project,
- git ref,
- component,
- action.

HiveForge resolves the component and action from the loaded manifest registry.
If the component is unmanaged or the action is undeclared, HiveForge fails before
calling `ansible-playbook`.

Action names are the canonical lifecycle names defined in
`docs/specs/actions/lifecycle.md`.

## Command

The runner executes:

```bash
ansible-playbook <declared playbook>
```

The working directory is the component manifest directory. The playbook path is
the exact relative path declared by the component manifest.

When `ansible-playbook` exits non-zero, HiveForge surfaces the command, exit
status, working directory, and redacted stdout/stderr tails through operation
logs. Secret-looking values such as password, token, and secret assignments are
redacted before they are stored or returned.

## Variable Contract

The POC runner inherits the HiveForge process environment and receives resolved
non-secret runtime env from `docs/specs/runtime-env.md`.

When managed files are configured, HiveForge also passes:

- `HIVEFORGE_PROJECT_DIR` - project managed tree inside the HiveForge runtime,
  under `HIVEFORGE_DATA_ROOT`,
- `HIVEFORGE_STACK_DIR` - `<HIVEFORGE_PROJECT_DIR>/stacks`,
- `HIVEFORGE_ARTIFACTS_DIR` - `<HIVEFORGE_PROJECT_DIR>/artifacts`.

When `HIVEFORGE_HOST_DATA_ROOT` is configured, HiveForge also passes
host-visible managed paths for Docker bind sources:

- `HIVEFORGE_PROJECT_HOST_DIR` - project managed tree as seen by the target
  Docker daemon,
- `HIVEFORGE_STACK_HOST_DIR` - `<HIVEFORGE_PROJECT_HOST_DIR>/stacks`,
- `HIVEFORGE_ARTIFACTS_HOST_DIR` - `<HIVEFORGE_PROJECT_HOST_DIR>/artifacts`.

Actions that read prepared files from inside the HiveForge container must use
the non-host variables. Actions that render Docker Compose or Stack bind
sources must use the host variables and fail explicitly when they are absent.

When a profile is selected, HiveForge passes `HIVEFORGE_PROFILE`. Operator
runtime env must not define `HIVEFORGE_*` keys.

For the target managed-service release contract in `docs/specs/releases.md`, the
Ansible adapter contract needs an explicit, typed variable surface for:

- image tag or release ref,
- stack name,
- Compose or stack file path,
- target host or Docker socket,
- public URLs and externally visible service names.

HiveForge must not infer these values from file names, branch names, Compose
content, or environment-specific conventions.

## Journal

Action outcomes are recorded as `run_action` journal events with component,
action, adapter, target ref, status, and reason.
