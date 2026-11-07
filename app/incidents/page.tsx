import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { IncidentTable } from "@/lib/incident-ui";
import { canReportIncident, canViewIncidents } from "@/lib/incidents";
import { Flash } from "@/lib/task-ui";
import { PageHeader } from "@/lib/ui";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
const VIEWS = [["open", "Open"], ["mine", "Assigned to me"], ["resolved", "Resolved"], ["all", "All"]] as const;
const PAGE = 25;

export default async function Incidents({ searchParams }: { searchParams: { view?: string; page?: string; error?: string; ok?: string } }) {
  const user = await requireUser();
  if (!canViewIncidents(user)) redirect("/");
  const view = VIEWS.some(([v]) => v === searchParams.view) ? searchParams.view! : "open";
  const page = Math.max(1, Math.min(1000, Number(searchParams.page) || 1));
  const where: Prisma.IncidentWhereInput = view === "open" ? { status: { not: "RESOLVED" } } : view === "mine" ? { assigneeId: user.id, status: { not: "RESOLVED" } } : view === "resolved" ? { status: "RESOLVED" } : {};
  const [rows, total] = await Promise.all([
    db.incident.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE,
      select: { id: true, title: true, severity: true, status: true, createdAt: true, assignee: { select: { displayName: true } }, asset: { select: { name: true } } } }),
    db.incident.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <Shell>
      <PageHeader title="Incidents" description="Technology incidents and their history. Never paste passwords, keys, logs with secrets or customer data."
        actions={canReportIncident(user) && <Link className="btn" href="/incidents/new"><Plus className="ic" aria-hidden="true" />Report incident</Link>} />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      <nav aria-label="View" className="btn-row" style={{ marginBottom: "1rem" }}>
        {VIEWS.map(([v, l]) => <Link key={v} className={view === v ? "btn" : "btn ghost"} href={`/incidents?view=${v}`} aria-current={view === v ? "page" : undefined}>{l}</Link>)}
      </nav>
      <IncidentTable rows={rows} empty={view === "resolved" ? "No resolved incidents yet." : "Nothing here. That is good news."} />
      {pages > 1 && <p className="hint" style={{ marginTop: "1rem" }}>Page {page} of {pages} · {page > 1 && <Link href={`/incidents?view=${view}&page=${page - 1}`}>Previous</Link>}{page > 1 && page < pages && " · "}{page < pages && <Link href={`/incidents?view=${view}&page=${page + 1}`}>Next</Link>}</p>}
    </Shell>
  );
}
