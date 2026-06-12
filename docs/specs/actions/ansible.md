# Ansible Action Runner

## Status

Draft 0.5 contract in progress. The root `hiveforge.yaml` manifest must declare
`version: "0.5"`.

## Rule

HiveForge runs only actions declared in a managed component manifest.

The only supported project action adapter is `ansible`. A run request must name:

- project,
- git ref,
- component,
- action.

HiveForge resolves the component and action from the loaded manifest registry.
If the component is unmanaged or the action is undeclared, HiveForge fails before
calling `ansible-playbook`.

Action names are the canonical lifecycle names defined in
`docs/specs/actions/lifecycle.md`.

## Runner Tooling

Project actions must treat Ansible as the only orchestration contract. HiveForge
does not guarantee arbitrary helper runtimes or CLIs in the action runner.

Guaranteed runner tools:

- `ansible-playbook`,
- Ansible built-in modules available in the packaged Ansible distribution,
- POSIX shell execution for Ansible tasks that explicitly use shell/command
  modules,
- basic Unix file utilities required by the base image,
- `curl`,
- `jq`,
- `ping`,
- CA certificates for TLS validation.

Conditional runner tools:

- `git` is available only for a HiveForge-controlled checkout phase. Normal
  action execution receives a prepared checkout instead of depending on git.

Not guaranteed by the action contract:

- `docker` CLI, Docker socket access, or any Docker/Swarm control surface,
- `ssh` or SSH agent/socket access,
- `python` as a project-callable CLI, even if Ansible depends on Python
  internally,
- `yq`, language runtimes, build tools, Maven, Java, Node package managers, or
  project-specific CLIs,
- Python packages, Ansible collections, roles, or shell helpers that are not
  declared in the project contract and provided through managed files.

If a project needs helper logic, keep it inside Ansible tasks or ship the helper
as a managed file and invoke it through an explicitly supported runner contract.
Do not rely on tools that happen to exist in the HiveForge control-plane image.

## Command

The runner executes the declared playbook in an isolated helper container:

```bash
ansible-playbook <declared playbook>
```

The helper mounts the prepared project managed root at `/hf` and mounts the
checked-out project repository read-only at `/workspace`. The working directory
is the component manifest directory under `/workspace`. The playbook path is
the exact relative path declared by the component manifest.

HiveForge uses `HIVEFORGE_ACTION_RUNNER_IMAGE` as the helper image when it is
set. If it is not set, HiveForge resolves the currently running HiveForge image
from Docker inspect. If neither source is available, isolated action execution
fails explicitly.

When `ansible-playbook` exits non-zero, HiveForge surfaces the command, exit
status, working directory, and redacted stdout/stderr tails through operation
logs. Secret-looking values such as password, token, and secret assignments are
redacted before they are stored or returned.

## Variable Contract

The current 0.5 breaking slice keeps the Ansible adapter but rejects project
repositories that use removed HiveForge path variables in declared action
playbooks or managed deployment artifacts.

Removed variables:

- `HIVEFORGE_PROJECT_DIR`
- `HIVEFORGE_STACK_DIR`
- `HIVEFORGE_ARTIFACTS_DIR`
- `HIVEFORGE_PROJECT_HOST_DIR`
- `HIVEFORGE_STACK_HOST_DIR`
- `HIVEFORGE_ARTIFACTS_HOST_DIR`

The isolated runner contract exposes one fixed project root and one Docker bind
source variable:

- `/hf` - the prepared managed root for the current project only,
- `/hf/artifacts` - managed release/runtime artifacts copied from the project,
- `/hf/stacks/compose.yml` - the Compose/Stack artifact the action writes for
  HiveForge-owned Docker deployment,
- `HIVEFORGE_BIND_SOURCE_DIR` - the only project-owned directory that rendered
  Compose/Stack files may use as Docker bind source paths, except for explicit
  typed allowlist paths such as `/var/run/docker.sock`.

`HIVEFORGE_BIND_SOURCE_DIR` is a host/node-visible path such as
`/opt/hiveforge/data/deployed/<project>`. It is for rendered Docker bind source
values only. Project Ansible must not use it to read or write local files.

HiveForge prepares `/hf/stacks` and `/hf/artifacts` before the action runs.
Project Ansible writes the rendered Compose/Stack file to
`/hf/stacks/compose.yml` and may create project-owned runtime state under `/hf`
when that state is later referenced by rendered Docker bind sources. Project
Ansible must not deploy the Compose/Stack file itself.

After a successful render action, HiveForge injects its deployment metadata into
the managed compose file, then runs the Docker deployment itself. The compose
inspection API/MCP tool returns the recorded artifact only; it does not re-render
from the checkout or guess a path later.

When a profile is selected, HiveForge passes `HIVEFORGE_PROFILE`. Operator
runtime env must not define `HIVEFORGE_*` keys.

For the target managed-service release contract in `docs/specs/releases.md`, the
Ansible adapter contract needs an explicit, typed variable surface for:

- image tag or release ref,
- stack name,
- Compose or stack file path,
- public URLs and externally visible service names.

HiveForge must not infer these values from file names, branch names, Compose
content, or environment-specific conventions.

## Journal

Action outcomes are recorded as `run_action` journal events with component,
action, adapter, target ref, status, reason, and recorded deployment artifacts
when present.
