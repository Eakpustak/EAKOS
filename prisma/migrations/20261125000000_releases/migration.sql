-- Phase 8 slice 3: deployment/release records. Hand-written; verify with `prisma migrate diff`.
CREATE TYPE "ReleaseStatus" AS ENUM ('PLANNED', 'DEPLOYED', 'FAILED', 'ROLLED_BACK', 'CANCELLED');

CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "commitRef" TEXT,
    "changeUrl" TEXT,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'PLANNED',
    "creatorId" TEXT NOT NULL,
    "deployerId" TEXT,
    "deployedAt" TIMESTAMP(3),
    "outcomeNote" TEXT,
    "clientToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReleaseEvent" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReleaseEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Release_clientToken_key" ON "Release"("clientToken");
CREATE INDEX "Release_status_createdAt_idx" ON "Release"("status", "createdAt");
CREATE INDEX "Release_assetId_createdAt_idx" ON "Release"("assetId", "createdAt");
CREATE INDEX "Release_creatorId_idx" ON "Release"("creatorId");
CREATE INDEX "ReleaseEvent_releaseId_createdAt_idx" ON "ReleaseEvent"("releaseId", "createdAt");

-- Assets are never deleted, so RESTRICT keeps release history intact.
ALTER TABLE "Release" ADD CONSTRAINT "Release_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "TechAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Release" ADD CONSTRAINT "Release_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Release" ADD CONSTRAINT "Release_deployerId_fkey" FOREIGN KEY ("deployerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReleaseEvent" ADD CONSTRAINT "ReleaseEvent_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReleaseEvent" ADD CONSTRAINT "ReleaseEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Release" ADD CONSTRAINT "Release_text_chk" CHECK (length(btrim("version")) BETWEEN 1 AND 60 AND length(btrim("summary")) > 0);
ALTER TABLE "Release" ADD CONSTRAINT "Release_env_chk" CHECK ("environment" IN ('Production', 'Staging', 'Development', 'Not applicable'));
ALTER TABLE "Release" ADD CONSTRAINT "Release_commit_chk" CHECK ("commitRef" IS NULL OR "commitRef" ~ '^[0-9a-f]{7,40}$');
ALTER TABLE "Release" ADD CONSTRAINT "Release_url_chk" CHECK ("changeUrl" IS NULL OR "changeUrl" ~ '^https?://');
-- DEPLOYED and ROLLED_BACK carry who deployed and when; every other status carries neither (FAILED and CANCELLED never reached production).
ALTER TABLE "Release" ADD CONSTRAINT "Release_deployed_chk" CHECK (
  ("status" IN ('DEPLOYED', 'ROLLED_BACK') AND "deployedAt" IS NOT NULL AND "deployerId" IS NOT NULL)
  OR ("status" IN ('PLANNED', 'FAILED', 'CANCELLED') AND "deployedAt" IS NULL AND "deployerId" IS NULL)
);
-- FAILED, CANCELLED and ROLLED_BACK must say why.
ALTER TABLE "Release" ADD CONSTRAINT "Release_note_chk" CHECK (
  "status" NOT IN ('FAILED', 'CANCELLED', 'ROLLED_BACK') OR length(btrim(coalesce("outcomeNote", ''))) > 0
);
