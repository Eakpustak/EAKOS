-- Restricted employee document register (Phase 6 slice 5). File bytes live in private storage, not here.
CREATE TYPE "DocumentKind" AS ENUM ('ID_PROOF', 'CONTRACT', 'OFFER_LETTER', 'CERTIFICATE', 'OTHER');

CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "note" TEXT,
    "uploadedById" TEXT NOT NULL,
    "clientToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeDocument_storageKey_key" ON "EmployeeDocument"("storageKey");
CREATE UNIQUE INDEX "EmployeeDocument_clientToken_key" ON "EmployeeDocument"("clientToken");
CREATE INDEX "EmployeeDocument_subjectId_createdAt_idx" ON "EmployeeDocument"("subjectId", "createdAt");

ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_size_chk" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 5242880);
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_mime_chk" CHECK ("mimeType" IN ('application/pdf', 'image/png', 'image/jpeg'));
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_name_chk" CHECK (length(btrim("fileName")) > 0);
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_uploader_chk" CHECK ("uploadedById" <> "subjectId");
