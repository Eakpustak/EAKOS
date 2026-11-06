#!/usr/bin/env bash
# Safe update: backup -> pull -> rebuild -> migrate (via entrypoint) -> health check -> rollback on failure.
set -euo pipefail
cd "$(dirname "$0")"

DC="docker compose"
docker info >/dev/null 2>&1 || DC="sudo docker compose"
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

wait_healthy() {
  for i in $(seq 1 60); do
    [ "$($DC ps --format '{{.Health}}' app | head -n1)" = "healthy" ] && return 0
    sleep 5
  done
  return 1
}

PREV=$(git rev-parse HEAD)
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups

say "Backing up database"
$DC exec -T db pg_dump -U eakos eakos | gzip > "backups/pre-update-$TS.sql.gz"
echo "Saved backups/pre-update-$TS.sql.gz"

say "Pulling latest code"
git pull --ff-only
NEW=$(git rev-parse HEAD)
if [ "$PREV" = "$NEW" ] && [ "${1:-}" != "--force" ]; then
  echo "Already up to date ($NEW). Use --force to rebuild anyway."; exit 0
fi

say "Rebuilding and restarting"
$DC up -d --build

say "Health check"
if wait_healthy; then
  docker image prune -f >/dev/null 2>&1 || true
  echo "Updated $PREV -> $NEW"
else
  say "FAILED. Rolling back code to $PREV"
  git checkout -q "$PREV"
  $DC up -d --build
  echo "Code rolled back. If the new release changed the database schema, restore the backup:"
  echo "  gunzip -c backups/pre-update-$TS.sql.gz | $DC exec -T db psql -U eakos eakos"
  exit 1
fi
