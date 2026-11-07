# Multi-arch safe: builds natively on OCI Ampere (arm64) or x86.
FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM deps AS build
COPY . .
# Dummy URL: prisma generate / next build do not connect to the DB.
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" npm run build

FROM base AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app /app
RUN chmod +x deploy/entrypoint.sh && mkdir -p /data/documents && chown -R node:node /app /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./deploy/entrypoint.sh"]
