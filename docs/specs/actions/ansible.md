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

## Variable Contract

The POC runner currently passes only the process environment plus
`HIVEFORGE_PROFILE` when a profile is selected. This is not enough for real
Docker/Proxmox deployment actions.

Before HiveMind or another production project is deployed through HiveForge,
the Ansible adapter contract needs an explicit, typed variable surface for:

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
