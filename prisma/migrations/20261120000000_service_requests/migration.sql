-- Internal service requests (Phase 7 slice 4). Administrative tracking only.
CREATE TYPE "ServiceStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'DECLINED', 'CANCELLED');
CREATE TYPE "ServicePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" "ServicePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ServiceStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "clientToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServiceEvent" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification" ADD COLUMN "serviceId" TEXT;

CREATE UNIQUE INDEX "ServiceRequest_clientToken_key" ON "ServiceRequest"("clientToken");
CREATE INDEX "ServiceRequest_requesterId_status_idx" ON "ServiceRequest"("requesterId", "status");
CREATE INDEX "ServiceRequest_departmentId_status_idx" ON "ServiceRequest"("departmentId", "status");
CREATE INDEX "ServiceRequest_assigneeId_status_idx" ON "ServiceRequest"("assigneeId", "status");
CREATE INDEX "ServiceEvent_serviceId_createdAt_idx" ON "ServiceEvent"("serviceId", "createdAt");

ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceEvent" ADD CONSTRAINT "ServiceEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariants enforced by the database, not only the UI.
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_text_chk" CHECK (length(btrim("title")) >= 3 AND length(btrim("description")) > 0);
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_assignee_not_requester_chk" CHECK ("assigneeId" IS NULL OR "assigneeId" <> "requesterId");
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_in_progress_chk" CHECK ("status" <> 'IN_PROGRESS' OR "assigneeId" IS NOT NULL);
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_resolved_chk" CHECK (
  "status" NOT IN ('RESOLVED', 'CLOSED') OR ("resolvedAt" IS NOT NULL AND length(btrim(coalesce("resolutionNote", ''))) > 0)
);
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_closed_chk" CHECK (("status" = 'CLOSED') = ("closedAt" IS NOT NULL));
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_declined_chk" CHECK ("status" <> 'DECLINED' OR length(btrim(coalesce("decisionNote", ''))) > 0);
