# Local Docker Smoke Flow

## Status

Development-only POC workflow.

## Rule

Local Docker smoke tests use an explicitly registered local git repository:
`hivewatch-local`. This is not a fallback for the real HiveWatch repository.

The setup script creates:

- a bare local git repository under `tmp/hivewatch-fixture.git`,
- a local single-node Swarm when Docker is not already in Swarm mode,
- Docker volume `hivewatch-api-data`,
- Docker secret `hivewatch-api-token`.

The deploy command still follows the normal flow:

1. checkout registered git ref,
2. inspect manifests,
3. validate local Docker resources,
4. run the declared Ansible playbook as render/preparation,
5. inject HiveForge deployment metadata into the rendered Compose file,
6. run Docker deployment through HiveForge,
7. write journal and SQLite state evidence.

The smoke deploy runs inside the `hiveforge:local` container with the local
Docker socket mounted. This verifies that HiveForge can reach Docker from the
deploy container, not from the host shell. Project Ansible actions must not rely
on Docker access.

## Commands

```bash
scripts/local-docker/setup-hivewatch-fixture.sh
scripts/local-docker/run-hivewatch-smoke.sh
```

`run-hivewatch-smoke.sh` restores ownership of `tmp/workspace` and
`tmp/journal` to the host user on exit. Docker writes mounted files as root
during the smoke flow, and host-run REST/CLI processes must still be able to
read and append the local journal afterwards.
