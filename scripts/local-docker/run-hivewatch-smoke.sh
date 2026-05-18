#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOST_UID="$(id -u)"
HOST_GID="$(id -g)"

restore_tmp_owner() {
  docker run --rm \
    -v "$ROOT_DIR:$ROOT_DIR" \
    hiveforge:local \
    chown -R "$HOST_UID:$HOST_GID" "$ROOT_DIR/tmp/workspace" "$ROOT_DIR/tmp/journal" >/dev/null 2>&1 || true
}

trap restore_tmp_owner EXIT

"$ROOT_DIR/scripts/local-docker/setup-hivewatch-fixture.sh"

docker build -t hiveforge:local "$ROOT_DIR" >/dev/null

docker run --rm \
  -v "$ROOT_DIR:$ROOT_DIR" \
  hiveforge:local \
  rm -rf "$ROOT_DIR/tmp/workspace" "$ROOT_DIR/tmp/journal"

mkdir -p "$ROOT_DIR/tmp/workspace" "$ROOT_DIR/tmp/journal"

docker run --rm \
  -e HIVEWATCH_API_PORT=3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$ROOT_DIR:$ROOT_DIR" \
  hiveforge:local \
  sh -lc "git config --global --add safe.directory \"$ROOT_DIR/tmp/hivewatch-fixture.git\" && node /app/dist/src/cli/main.js deploy \
  --registry \"$ROOT_DIR/examples/hivewatch/projects.yaml\" \
  --workspace \"$ROOT_DIR/tmp/workspace\" \
  --journal \"$ROOT_DIR/tmp/journal\" \
  --project hivewatch-local \
  --ref main \
  --component api \
  --action deploy"

docker run --rm \
  -v "$ROOT_DIR:$ROOT_DIR" \
  hiveforge:local \
  node /app/dist/src/cli/main.js read-journal \
  --registry "$ROOT_DIR/examples/hivewatch/projects.yaml" \
  --workspace "$ROOT_DIR/tmp/workspace" \
  --journal "$ROOT_DIR/tmp/journal"
