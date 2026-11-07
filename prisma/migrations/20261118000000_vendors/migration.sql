-- Vendor register (Phase 7 slice 2). Vendors are deactivated, never deleted.
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "clientToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Vendor_nameKey_key" ON "Vendor"("nameKey");
CREATE UNIQUE INDEX "Vendor_clientToken_key" ON "Vendor"("clientToken");
CREATE INDEX "Vendor_status_name_idx" ON "Vendor"("status", "name");

ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_name_chk" CHECK (length(btrim("name")) >= 2 AND length("name") <= 120 AND length(btrim("nameKey")) >= 2);
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_category_chk" CHECK ("category" IN ('Software', 'Hosting and domains', 'Hardware', 'Services', 'Facilities', 'Other'));
