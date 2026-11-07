-- Purchase requests (Phase 7 slice 3). Administrative tracking only: not procurement, accounting or payment.
CREATE TYPE "PurchaseStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'ORDERED', 'RECEIVED');

CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "estimatedMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "neededBy" TIMESTAMP(3),
    "status" "PurchaseStatus" NOT NULL DEFAULT 'SUBMITTED',
    "approverDepartmentId" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "vendorId" TEXT,
    "orderedById" TEXT,
    "orderedAt" TIMESTAMP(3),
    "orderRef" TEXT,
    "receivedAt" TIMESTAMP(3),
    "clientToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseEvent" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification" ADD COLUMN "purchaseId" TEXT;

CREATE UNIQUE INDEX "PurchaseRequest_clientToken_key" ON "PurchaseRequest"("clientToken");
CREATE INDEX "PurchaseRequest_requesterId_status_idx" ON "PurchaseRequest"("requesterId", "status");
CREATE INDEX "PurchaseRequest_approverDepartmentId_status_idx" ON "PurchaseRequest"("approverDepartmentId", "status");
CREATE INDEX "PurchaseRequest_status_createdAt_idx" ON "PurchaseRequest"("status", "createdAt");
CREATE INDEX "PurchaseRequest_vendorId_idx" ON "PurchaseRequest"("vendorId");
CREATE INDEX "PurchaseEvent_purchaseId_createdAt_idx" ON "PurchaseEvent"("purchaseId", "createdAt");

ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_approverDepartmentId_fkey" FOREIGN KEY ("approverDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseEvent" ADD CONSTRAINT "PurchaseEvent_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseEvent" ADD CONSTRAINT "PurchaseEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariants enforced by the database, not only the UI.
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_amount_chk" CHECK ("estimatedMinor" > 0 AND "estimatedMinor" <= 100000000);
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_quantity_chk" CHECK ("quantity" >= 1 AND "quantity" <= 10000);
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_currency_chk" CHECK ("currency" IN ('INR', 'USD', 'EUR', 'GBP'));
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_text_chk" CHECK (length(btrim("title")) >= 3 AND length(btrim("justification")) > 0);
-- Every state past the decision carries who decided and when. CANCELLED may keep an earlier approval.
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_decision_chk" CHECK (
  "status" NOT IN ('APPROVED', 'REJECTED', 'ORDERED', 'RECEIVED') OR ("decidedAt" IS NOT NULL AND "decidedById" IS NOT NULL)
);
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_decider_not_requester_chk" CHECK ("decidedById" IS NULL OR "decidedById" <> "requesterId");
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_reject_note_chk" CHECK ("status" <> 'REJECTED' OR length(btrim(coalesce("decisionNote", ''))) > 0);
-- ORDERED and RECEIVED carry the order: who, when, which vendor, which reference.
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_order_chk" CHECK (
  "status" NOT IN ('ORDERED', 'RECEIVED') OR ("orderedAt" IS NOT NULL AND "orderedById" IS NOT NULL AND "vendorId" IS NOT NULL AND length(btrim(coalesce("orderRef", ''))) >= 3)
);
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_orderer_not_requester_chk" CHECK ("orderedById" IS NULL OR "orderedById" <> "requesterId");
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_received_chk" CHECK (("status" = 'RECEIVED') = ("receivedAt" IS NOT NULL));
