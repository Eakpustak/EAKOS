#!/bin/sh
set -e
echo "[entrypoint] Applying migrations…"
npx prisma migrate deploy
echo "[entrypoint] Bootstrapping…"
node scripts/bootstrap.mjs
echo "[entrypoint] Starting app"
exec npm start
