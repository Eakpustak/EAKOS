-- Phase 8 slice 1: technical asset inventory. Hand-written; verify with `prisma migrate diff`.
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'RETIRED');

CREATE TABLE "TechAsset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "url" TEXT,
    "ownerId" TEXT,
    "notes" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "clientToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TechAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TechAsset_nameKey_key" ON "TechAsset"("nameKey");
CREATE UNIQUE INDEX "TechAsset_clientToken_key" ON "TechAsset"("clientToken");
CREATE INDEX "TechAsset_status_assetType_idx" ON "TechAsset"("status", "assetType");
CREATE INDEX "TechAsset_ownerId_idx" ON "TechAsset"("ownerId");

ALTER TABLE "TechAsset" ADD CONSTRAINT "TechAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TechAsset" ADD CONSTRAINT "TechAsset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TechAsset" ADD CONSTRAINT "TechAsset_name_chk" CHECK (length(btrim("name")) BETWEEN 2 AND 120);
ALTER TABLE "TechAsset" ADD CONSTRAINT "TechAsset_type_chk" CHECK ("assetType" IN ('Server', 'Domain', 'Repository', 'Cloud account', 'Service', 'Database', 'Device', 'Other'));
ALTER TABLE "TechAsset" ADD CONSTRAINT "TechAsset_env_chk" CHECK ("environment" IN ('Production', 'Staging', 'Development', 'Not applicable'));
ALTER TABLE "TechAsset" ADD CONSTRAINT "TechAsset_url_chk" CHECK ("url" IS NULL OR "url" ~ '^https?://');
