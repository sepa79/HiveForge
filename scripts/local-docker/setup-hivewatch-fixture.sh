#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="$ROOT_DIR/examples/hivewatch/repo"
WORK_DIR="$ROOT_DIR/tmp/hivewatch-fixture-work"
BARE_DIR="$ROOT_DIR/tmp/hivewatch-fixture.git"

rm -rf "$WORK_DIR" "$BARE_DIR"
mkdir -p "$ROOT_DIR/tmp"

git init --initial-branch=main "$WORK_DIR" >/dev/null
cp -R "$SOURCE_DIR"/. "$WORK_DIR"/
git -C "$WORK_DIR" add .
git -C "$WORK_DIR" -c user.name=HiveForge -c user.email=hiveforge@example.local commit -m "Add HiveWatch local fixture" >/dev/null
git clone --bare "$WORK_DIR" "$BARE_DIR" >/dev/null

SWARM_STATE="$(docker info --format '{{.Swarm.LocalNodeState}}')"
if [[ "$SWARM_STATE" == "inactive" ]]; then
  docker swarm init --advertise-addr 127.0.0.1 >/dev/null
fi

docker volume inspect hivewatch-api-data >/dev/null 2>&1 || docker volume create hivewatch-api-data >/dev/null
docker secret inspect hivewatch-api-token >/dev/null 2>&1 || printf '%s' 'local-dev-token' | docker secret create hivewatch-api-token - >/dev/null

printf 'Prepared local HiveWatch fixture: file://%s\n' "$BARE_DIR"
