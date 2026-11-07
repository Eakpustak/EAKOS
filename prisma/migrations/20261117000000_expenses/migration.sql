-- Expense submission, approval and payment status (Phase 7 slice 1). Administrative tracking only: not accounting.
CREATE TYPE "ExpenseStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'PAID');

CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceRef" TEXT NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'SUBMITTED',
    "approverDepartmentId" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "clientToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExpenseEvent" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification" ADD COLUMN "expenseId" TEXT;

CREATE UNIQUE INDEX "Expense_clientToken_key" ON "Expense"("clientToken");
CREATE INDEX "Expense_submittedById_status_idx" ON "Expense"("submittedById", "status");
CREATE INDEX "Expense_approverDepartmentId_status_idx" ON "Expense"("approverDepartmentId", "status");
CREATE INDEX "Expense_status_createdAt_idx" ON "Expense"("status", "createdAt");
CREATE INDEX "ExpenseEvent_expenseId_createdAt_idx" ON "ExpenseEvent"("expenseId", "createdAt");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_approverDepartmentId_fkey" FOREIGN KEY ("approverDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseEvent" ADD CONSTRAINT "ExpenseEvent_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseEvent" ADD CONSTRAINT "ExpenseEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariants enforced by the database, not only the UI.
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amount_chk" CHECK ("amountMinor" > 0 AND "amountMinor" <= 100000000);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_currency_chk" CHECK ("currency" IN ('INR', 'USD', 'EUR', 'GBP'));
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_text_chk" CHECK (length(btrim("description")) > 0 AND length(btrim("evidenceRef")) >= 3);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_decision_chk" CHECK (
  ("status" IN ('APPROVED', 'REJECTED', 'PAID')) = ("decidedAt" IS NOT NULL AND "decidedById" IS NOT NULL)
);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_decider_not_submitter_chk" CHECK ("decidedById" IS NULL OR "decidedById" <> "submittedById");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reject_note_chk" CHECK ("status" <> 'REJECTED' OR length(btrim(coalesce("decisionNote", ''))) > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paid_chk" CHECK (("status" = 'PAID') = ("paidAt" IS NOT NULL AND "paidById" IS NOT NULL));
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_payer_not_submitter_chk" CHECK ("paidById" IS NULL OR "paidById" <> "submittedById");
