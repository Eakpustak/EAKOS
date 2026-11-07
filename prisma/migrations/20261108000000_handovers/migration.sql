-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('PENDING', 'CLARIFICATION_REQUESTED', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Handover" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "deliverable" TEXT NOT NULL,
    "status" "HandoverStatus" NOT NULL DEFAULT 'PENDING',
    "fromDepartmentId" TEXT NOT NULL,
    "toDepartmentId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "linkedTaskId" TEXT,
    "clientToken" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completionSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Handover_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HandoverEvent" (
    "id" TEXT NOT NULL,
    "handoverId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HandoverEvent_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "handoverId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Handover_clientToken_key" ON "Handover"("clientToken");
CREATE INDEX "Handover_receiverId_status_idx" ON "Handover"("receiverId", "status");
CREATE INDEX "Handover_senderId_status_idx" ON "Handover"("senderId", "status");
CREATE INDEX "Handover_fromDepartmentId_idx" ON "Handover"("fromDepartmentId");
CREATE INDEX "Handover_toDepartmentId_idx" ON "Handover"("toDepartmentId");
CREATE INDEX "Handover_status_sentAt_idx" ON "Handover"("status", "sentAt");
CREATE INDEX "HandoverEvent_handoverId_createdAt_idx" ON "HandoverEvent"("handoverId", "createdAt");

-- AddForeignKey
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_fromDepartmentId_fkey" FOREIGN KEY ("fromDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_toDepartmentId_fkey" FOREIGN KEY ("toDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_linkedTaskId_fkey" FOREIGN KEY ("linkedTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HandoverEvent" ADD CONSTRAINT "HandoverEvent_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "Handover"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HandoverEvent" ADD CONSTRAINT "HandoverEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_handoverId_fkey" FOREIGN KEY ("handoverId") REFERENCES "Handover"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariants enforced by the database, not only the UI (RULES 3 / WORKFLOWS 2).
-- Prisma cannot express CHECK constraints, so they live only in this migration.
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_cross_department_chk" CHECK ("fromDepartmentId" <> "toDepartmentId");
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_sender_not_receiver_chk" CHECK ("senderId" <> "receiverId");
