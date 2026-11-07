-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('ANNOUNCEMENT', 'POLICY', 'RESOURCE');
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "AudienceScope" AS ENUM ('ALL', 'DEPARTMENTS');

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "resourceUrl" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "audienceScope" "AudienceScope" NOT NULL DEFAULT 'ALL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT NOT NULL,
    "publisherId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "clientToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentAudience" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    CONSTRAINT "ContentAudience_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resourceUrl" TEXT,
    "editedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "contentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_clientToken_key" ON "ContentItem"("clientToken");
CREATE INDEX "ContentItem_status_type_publishedAt_idx" ON "ContentItem"("status", "type", "publishedAt");
CREATE INDEX "ContentItem_authorId_status_idx" ON "ContentItem"("authorId", "status");
CREATE UNIQUE INDEX "ContentAudience_contentId_departmentId_key" ON "ContentAudience"("contentId", "departmentId");
CREATE INDEX "ContentAudience_departmentId_idx" ON "ContentAudience"("departmentId");
CREATE UNIQUE INDEX "ContentVersion_contentId_version_key" ON "ContentVersion"("contentId", "version");

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContentAudience" ADD CONSTRAINT "ContentAudience_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentAudience" ADD CONSTRAINT "ContentAudience_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariants enforced by the database (Prisma cannot express CHECK constraints).
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_resource_url_chk" CHECK ("type" <> 'RESOURCE' OR "resourceUrl" IS NOT NULL);
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_published_chk" CHECK ("status" <> 'PUBLISHED' OR ("publisherId" IS NOT NULL AND "publishedAt" IS NOT NULL));
