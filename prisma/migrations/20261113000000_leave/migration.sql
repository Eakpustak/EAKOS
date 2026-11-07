-- Leave requests (Phase 6 slice 1). Leave types and balances are NOT modelled: they are unconfirmed (MEMORY open questions).
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approverDepartmentId" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "clientToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Notification" ADD COLUMN "leaveId" TEXT;

CREATE UNIQUE INDEX "LeaveRequest_clientToken_key" ON "LeaveRequest"("clientToken");
CREATE INDEX "LeaveRequest_requesterId_status_idx" ON "LeaveRequest"("requesterId", "status");
CREATE INDEX "LeaveRequest_approverDepartmentId_status_idx" ON "LeaveRequest"("approverDepartmentId", "status");
CREATE INDEX "LeaveRequest_startDate_endDate_idx" ON "LeaveRequest"("startDate", "endDate");

ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approverDepartmentId_fkey" FOREIGN KEY ("approverDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariants enforced by the database, not only the UI.
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_dates_chk" CHECK ("endDate" >= "startDate");
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approver_not_requester_chk" CHECK ("decidedById" IS NULL OR "status" = 'CANCELLED' OR "decidedById" <> "requesterId");
-- A cancelled request keeps the earlier decision (if any) for the record.
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_decision_chk" CHECK (
  "status" = 'CANCELLED' OR (("status" IN ('APPROVED', 'REJECTED')) = ("decidedAt" IS NOT NULL AND "decidedById" IS NOT NULL))
);
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_reject_note_chk" CHECK ("status" <> 'REJECTED' OR length(btrim(coalesce("decisionNote", ''))) > 0);
