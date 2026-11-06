#!/usr/bin/env bash
# Usage: ./restore.sh backups/<file>.sql.gz   (replaces the current database)
set -euo pipefail
cd "$(dirname "$0")"
[ -f "${1:-}" ] || { echo "Usage: $0 backups/<file>.sql.gz"; exit 1; }
DC="docker compose"; docker info >/dev/null 2>&1 || DC="sudo docker compose"
read -rp "This REPLACES the current database with $1. Type 'yes': " a
[ "$a" = "yes" ] || exit 1
$DC stop app
$DC exec -T db psql -U eakos -d postgres -c 'DROP DATABASE IF EXISTS eakos WITH (FORCE);' -c 'CREATE DATABASE eakos;'
gunzip -c "$1" | $DC exec -T db psql -U eakos eakos
$DC start app
echo "Restored."
