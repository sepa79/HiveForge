# Changelog

## 0.4.5 - 2026-05-27

- Add non-secret project runtime environment storage with REST and MCP tools for
  listing, setting, and unsetting profile-scoped values outside git.
- Pass resolved runtime environment into requirement validation and lifecycle
  actions so projects can keep deploy-time image tags and public config out of
  repository manifests.
- Add explicit host-visible HiveForge path handling for Swarm bind mounts,
  including `HIVEFORGE_PROJECT_HOST_DIR` for deployment actions.
- Improve Docker Compose and Swarm install templates with proxy environment
  passthrough and host root configuration for Swarm targets.
- Refresh the operator UI with the new HiveForge logo, home view, token flow,
  and layout fixes.

## 0.4.4 - 2026-05-26

- Add MCP/REST environment policy editing for explicitly allowing a registered
  project on a known environment.
- Add a first Swarm quickstart focused on external HiveWatch/HiveMind example
  repositories and MCP startup without a local checkout.
- Add a paste-ready Swarm/Portainer stack template with a named `/hf` volume and
  manager-node placement.

## 0.4.3 - 2026-05-26

- Add a public REST health endpoint at `/health`.
- Expose health checks through MCP so clients can verify the selected
  HiveForge target before running operations.
- Document MCP token usage for Docker Compose installs.
- Propose runtime config provisioning for `.env`-derived secrets and private
  config without plaintext values in model-visible MCP payloads.

## 0.4.2 - 2026-05-25

- Make Docker Compose installs use a single HiveForge base directory mounted at
  `/hf`.
- Let the server initialize missing `projects.yaml`, `environments.yaml`,
  `workspace/`, `journal/operations.jsonl`, and `data/` under the base dir.
- Generate a durable `auth-token` file on first start when
  `HIVEFORGE_AUTH_TOKEN` is not provided.
- Keep explicit runtime path mode available, but reject mixing it with
  `HIVEFORGE_BASE_DIR`.

## 0.1.1 - 2026-05-24

- Add CLI `--base-dir` mode for a single mounted HiveForge runtime directory.
- Auto-initialize an empty base dir with `projects.yaml`, `workspace/`,
  `journal/operations.jsonl`, and `data/`.
- Reject mixed runtime path modes when `--base-dir` is combined with explicit
  `--registry`, `--workspace`, `--journal`, or `--data-root`.
- Document the base-dir runtime contract and add CLI coverage.
