-- Phase 7 slice 5: vendor quotation / invoice register. Hand-written; verify with `prisma migrate diff`.
CREATE TYPE "RecordKind" AS ENUM ('QUOTATION', 'INVOICE');
CREATE TYPE "RecordStatus" AS ENUM ('OPEN', 'PAID', 'ACCEPTED', 'DECLINED', 'VOID');

CREATE TABLE "FinanceRecord" (
    "id" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL,
    "vendorId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "referenceKey" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE,
    "status" "RecordStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "settledAt" TIMESTAMP(3),
    "settledById" TEXT,
    "createdById" TEXT NOT NULL,
    "clientToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceRecordEvent" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceRecordEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceRecord_clientToken_key" ON "FinanceRecord"("clientToken");
CREATE UNIQUE INDEX "FinanceRecord_vendorId_kind_referenceKey_key" ON "FinanceRecord"("vendorId", "kind", "referenceKey");
CREATE INDEX "FinanceRecord_kind_status_dueDate_idx" ON "FinanceRecord"("kind", "status", "dueDate");
CREATE INDEX "FinanceRecord_vendorId_idx" ON "FinanceRecord"("vendorId");
CREATE INDEX "FinanceRecordEvent_recordId_createdAt_idx" ON "FinanceRecordEvent"("recordId", "createdAt");

ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceRecordEvent" ADD CONSTRAINT "FinanceRecordEvent_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "FinanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceRecordEvent" ADD CONSTRAINT "FinanceRecordEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariants enforced by the database, not only the UI.
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_amount_chk" CHECK ("amountMinor" > 0 AND "amountMinor" <= 100000000);
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_currency_chk" CHECK ("currency" IN ('INR', 'USD', 'EUR', 'GBP'));
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_reference_chk" CHECK (length(btrim("reference")) >= 1 AND length("reference") <= 80);
-- Status must fit the kind: invoices are paid or void, quotations are accepted, declined or void.
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_kind_status_chk" CHECK (
  ("kind" = 'INVOICE' AND "status" IN ('OPEN', 'PAID', 'VOID')) OR ("kind" = 'QUOTATION' AND "status" IN ('OPEN', 'ACCEPTED', 'DECLINED', 'VOID'))
);
-- An invoice always has a due date; a date range can never run backwards.
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_due_chk" CHECK (("kind" <> 'INVOICE' OR "dueDate" IS NOT NULL) AND ("dueDate" IS NULL OR "dueDate" >= "issueDate"));
-- Anything past OPEN carries who settled it and when; OPEN carries neither.
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_settled_chk" CHECK (
  ("status" = 'OPEN' AND "settledAt" IS NULL AND "settledById" IS NULL) OR ("status" <> 'OPEN' AND "settledAt" IS NOT NULL AND "settledById" IS NOT NULL)
);
-- Payment details exist exactly when the invoice is PAID.
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_paid_chk" CHECK (
  ("status" = 'PAID' AND "paidAt" IS NOT NULL AND length(btrim(coalesce("paymentRef", ''))) >= 3) OR ("status" <> 'PAID' AND "paidAt" IS NULL AND "paymentRef" IS NULL)
);
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_note_chk" CHECK ("status" NOT IN ('DECLINED', 'VOID') OR length(btrim(coalesce("note", ''))) > 0);
