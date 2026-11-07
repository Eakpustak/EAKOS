-- Onboarding / offboarding checklists (Phase 6 slice 3). Templates and owners are NOT modelled here: they live in code (unconfirmed).
CREATE TYPE "CaseType" AS ENUM ('ONBOARDING', 'OFFBOARDING');
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');
CREATE TYPE "CaseItemStatus" AS ENUM ('OPEN', 'DONE');

CREATE TABLE "PeopleCase" (
    "id" TEXT NOT NULL,
    "type" "CaseType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "openKey" TEXT,
    "closeNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "clientToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PeopleCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CaseItem" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "CaseItemStatus" NOT NULL DEFAULT 'OPEN',
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CaseItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification" ADD COLUMN "caseId" TEXT;

CREATE UNIQUE INDEX "PeopleCase_openKey_key" ON "PeopleCase"("openKey");
CREATE UNIQUE INDEX "PeopleCase_clientToken_key" ON "PeopleCase"("clientToken");
CREATE INDEX "PeopleCase_status_createdAt_idx" ON "PeopleCase"("status", "createdAt");
CREATE INDEX "PeopleCase_subjectId_idx" ON "PeopleCase"("subjectId");
CREATE INDEX "CaseItem_ownerId_status_idx" ON "CaseItem"("ownerId", "status");
CREATE INDEX "CaseItem_caseId_idx" ON "CaseItem"("caseId");

ALTER TABLE "PeopleCase" ADD CONSTRAINT "PeopleCase_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PeopleCase" ADD CONSTRAINT "PeopleCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PeopleCase" ADD CONSTRAINT "PeopleCase_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CaseItem" ADD CONSTRAINT "CaseItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PeopleCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseItem" ADD CONSTRAINT "CaseItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CaseItem" ADD CONSTRAINT "CaseItem_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PeopleCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariants enforced by the database, not only the UI.
ALTER TABLE "PeopleCase" ADD CONSTRAINT "PeopleCase_creator_not_subject_chk" CHECK ("createdById" <> "subjectId");
ALTER TABLE "PeopleCase" ADD CONSTRAINT "PeopleCase_closed_chk" CHECK (("status" <> 'OPEN') = ("closedAt" IS NOT NULL AND "closedById" IS NOT NULL));
ALTER TABLE "PeopleCase" ADD CONSTRAINT "PeopleCase_open_key_chk" CHECK (("status" = 'OPEN') = ("openKey" IS NOT NULL));
ALTER TABLE "PeopleCase" ADD CONSTRAINT "PeopleCase_cancel_note_chk" CHECK ("status" <> 'CANCELLED' OR length(btrim(coalesce("closeNote", ''))) > 0);
ALTER TABLE "CaseItem" ADD CONSTRAINT "CaseItem_done_chk" CHECK (("status" = 'DONE') = ("doneAt" IS NOT NULL AND "doneById" IS NOT NULL));
ALTER TABLE "CaseItem" ADD CONSTRAINT "CaseItem_title_chk" CHECK (length(btrim("title")) > 0);
