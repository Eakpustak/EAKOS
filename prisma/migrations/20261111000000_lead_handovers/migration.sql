-- Lead-linked delivery handovers (Phase 5 slice 2). Additive only: one nullable column, one index, one FK.
ALTER TABLE "Handover" ADD COLUMN "leadId" TEXT;
CREATE INDEX "Handover_leadId_idx" ON "Handover"("leadId");
ALTER TABLE "Handover" ADD CONSTRAINT "Handover_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
