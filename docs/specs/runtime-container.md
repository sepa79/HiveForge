# Runtime Container Contract

## Status

Draft contract for the HiveForge POC deploy container.

## Rule

The HiveForge deploy container is self-contained for the first POC runtime. It
contains:

- Node.js runtime for HiveForge,
- git for allowlisted repository checkout,
- Ansible for declared `ansible` adapter actions,
- Docker CLI for target Docker/Swarm requirement checks,
- SSH client and CA certificates for repository access.

The target host must provide Docker/Swarm control access required by the
checked-out playbooks, but it must not be required to provide Ansible.

## Required paths

The container uses explicit directories:

- `HIVEFORGE_WORKSPACE_DIR` for checked-out repositories,
- `HIVEFORGE_JOURNAL_DIR` for operation journal data.

Both paths must be configured or use the image defaults. Missing writable
directories are deployment configuration errors.

## Non-goals

- The image does not install project-specific Python collections or roles
  dynamically.
- The image does not guess host tools.
- The image does not run undeclared playbooks.
