# Changelog

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
