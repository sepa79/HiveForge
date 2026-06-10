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

The target isolated runner contract exposes task-oriented paths only:

- `HIVEFORGE_RENDERED_COMPOSE_FILE` - the Compose/Stack artifact the action
  writes or uses for Docker deployment,
- `HIVEFORGE_BIND_SOURCE_DIR` - the only project-owned directory that rendered
  Compose/Stack files may use as Docker bind source paths, except for explicit
  typed allowlist paths such as `/var/run/docker.sock`.

Until the isolated runner implementation lands, deploy execution on this branch
should be treated as incomplete. The contract guard exists first so HiveForge can
quick-fail repositories that still target the removed POC variable surface.

HiveForge prepares the parent directories for both paths before the action
runs. Project Ansible writes the rendered Compose/Stack file to
`HIVEFORGE_RENDERED_COMPOSE_FILE` and may write project-owned bind-source
content under `HIVEFORGE_BIND_SOURCE_DIR` when the connected environment
declares `managedRoot.bindSourceRoot`. Project Ansible must not deploy the
Compose/Stack file itself.

After a successful render action, HiveForge injects its deployment metadata into
`HIVEFORGE_RENDERED_COMPOSE_FILE`, then runs the Docker deployment itself. The
compose inspection API/MCP tool returns the recorded artifact only; it does not
re-render from the checkout or guess a path later.

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
