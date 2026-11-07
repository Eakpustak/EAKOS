-- Phase 7 slice 6: renewal register. Hand-written; verify with `prisma migrate diff`.
CREATE TYPE "RenewalCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE "RenewalStatus" AS ENUM ('ACTIVE', 'CANCELLED');

CREATE TABLE "Renewal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "vendorId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "cycle" "RenewalCycle" NOT NULL,
    "renewalDate" DATE NOT NULL,
    "reminderDays" INTEGER NOT NULL DEFAULT 30,
    "status" "RenewalStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastRenewedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "clientToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Renewal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Renewal_clientToken_key" ON "Renewal"("clientToken");
CREATE INDEX "Renewal_status_renewalDate_idx" ON "Renewal"("status", "renewalDate");
CREATE INDEX "Renewal_vendorId_idx" ON "Renewal"("vendorId");

ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_name_chk" CHECK (length(btrim("name")) BETWEEN 2 AND 120);
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_category_chk" CHECK ("category" IN ('Software', 'Hosting and domains', 'Hardware', 'Services', 'Facilities', 'Other'));
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_amount_chk" CHECK ("amountMinor" > 0 AND "amountMinor" <= 100000000);
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_currency_chk" CHECK ("currency" IN ('INR', 'USD', 'EUR', 'GBP'));
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_reminder_chk" CHECK ("reminderDays" BETWEEN 1 AND 180);
ALTER TABLE "Renewal" ADD CONSTRAINT "Renewal_cancelled_chk" CHECK (("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL));
