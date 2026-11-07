#!/usr/bin/env bash
# Usage: ./restore.sh backups/<db>.sql.gz [backups/documents-<stamp>.tar.gz]
# REPLACES the current database and, when an archive is given, the employee-document files.
# Use a database dump and a documents archive from the same night: the database records which files should exist.
set -euo pipefail
cd "$(dirname "$0")"
DB="${1:-}"; DOCS="${2:-}"
[ -f "$DB" ] || { echo "Usage: $0 backups/<db>.sql.gz [backups/documents-<stamp>.tar.gz]"; exit 1; }
gzip -t "$DB" || { echo "$DB is not a valid gzip file. Nothing was changed."; exit 1; }
if [ -n "$DOCS" ]; then
  [ -f "$DOCS" ] || { echo "$DOCS not found. Nothing was changed."; exit 1; }
  tar tzf "$DOCS" >/dev/null || { echo "$DOCS is not a readable archive. Nothing was changed."; exit 1; }
  DOCS_ABS="$(cd "$(dirname "$DOCS")" && pwd)/$(basename "$DOCS")"
fi
DC="docker compose"; docker info >/dev/null 2>&1 || DC="sudo docker compose"

echo "This REPLACES the current database with $DB."
if [ -n "$DOCS" ]; then echo "It also REPLACES every stored employee document with the contents of $DOCS."
else echo "Employee documents are NOT restored (no archive given); files and database records may then disagree."; fi
read -rp "Type 'yes': " a
[ "$a" = "yes" ] || exit 1

TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
# Safety net: keep what is there now, in case this was the wrong file. A broken database may not dump; that is a warning, not a stop.
if $DC exec -T db pg_dump -U eakos eakos | gzip > "backups/pre-restore-$TS.sql.gz"; then echo "Current database saved to backups/pre-restore-$TS.sql.gz"
else echo "WARNING: could not save the current database first."; rm -f "backups/pre-restore-$TS.sql.gz"; fi

$DC stop app
trap 'echo "Restore FAILED. The app is stopped. Fix the error above and run this again; the previous database is in backups/pre-restore-$TS.sql.gz if it was saved."' ERR
$DC exec -T db psql -U eakos -d postgres -c 'DROP DATABASE IF EXISTS eakos WITH (FORCE);' -c 'CREATE DATABASE eakos;'
gunzip -c "$DB" | $DC exec -T db psql -v ON_ERROR_STOP=1 -U eakos eakos
if [ -n "$DOCS" ]; then
  # Runs in a throwaway container from the app image (same volume, same user), not the app itself.
  $DC run --rm --no-deps -T --entrypoint sh -v "$DOCS_ABS:/restore/documents.tar.gz:ro" app -c \
    'find /data/documents -mindepth 1 -delete && tar xzf /restore/documents.tar.gz -C /data/documents'
  echo "Documents restored."
fi
trap - ERR
$DC start app
echo "Restored. Check: $DC ps (app should become healthy), then sign in and open one employee document."
