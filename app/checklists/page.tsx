import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, ListChecks, Plus } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, todayStr } from "@/lib/tasks";
import { EmptyState, PageHeader, Person } from "@/lib/ui";
import { canManageCases, caseProgress, caseStatusLabel, caseTypeLabel, itemOverdue } from "@/lib/checklists";

export const dynamic = "force-dynamic";

export default async function Checklists({ searchParams }: { searchParams: { view?: string } }) {
  const user = await requireUser();
  const hr = canManageCases(user);
  const today = todayStr();
  const mine = await db.caseItem.findMany({
    where: { ownerId: user.id, status: "OPEN", case: { status: "OPEN", subjectId: { not: user.id } } },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }], take: 100,
    include: { case: { select: { id: true, type: true, subject: { select: { displayName: true } } } } },
  });
  if (!hr && mine.length === 0) redirect("/");

  const closed = searchParams.view === "closed";
  const cases = hr
    ? await db.peopleCase.findMany({
        where: { status: closed ? { in: ["COMPLETED", "CANCELLED"] } : "OPEN", subjectId: { not: user.id } },
        orderBy: { createdAt: "desc" }, take: 100,
        include: { subject: { select: { displayName: true } }, items: { select: { status: true, dueAt: true } } },
      })
    : [];

  return (
    <Shell>
      <PageHeader
        title="Checklists"
        description="Onboarding and offboarding steps with a named owner for each. Nothing closes or switches off an account by itself."
        actions={hr && <Link className="btn" href="/checklists/new"><Plus className="ic" aria-hidden="true" />New checklist</Link>}
      />

      <section className="section" aria-labelledby="mine-h">
        <div className="section-head"><h2 id="mine-h">Assigned to you <span className="muted num">({mine.length})</span></h2></div>
        {mine.length === 0 ? (
          <div className="table-wrap"><EmptyState icon={ClipboardCheck} title="Nothing assigned to you">Checklist items you own will appear here.</EmptyState></div>
        ) : (
          <div className="table-wrap"><div className="table-scroll">
            <table className="responsive">
              <thead><tr><th>Item</th><th>Checklist</th><th>Due</th></tr></thead>
              <tbody>
                {mine.map((i) => (
                  <tr key={i.id}>
                    <td className="primary"><Link href={`/checklists/${i.case.id}`}>{i.title}</Link></td>
                    <td data-label="Checklist">{caseTypeLabel(i.case.type)} · {i.case.subject.displayName}</td>
                    <td data-label="Due" className="num">{fmtDate(i.dueAt)}{itemOverdue(i, today) && <> <span className="badge off">Overdue</span></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        )}
      </section>

      {hr && (
        <section className="section" aria-labelledby="all-h">
          <div className="section-head">
            <h2 id="all-h">{closed ? "Closed checklists" : "Checklists in progress"} <span className="muted num">({cases.length})</span></h2>
            <Link href={closed ? "/checklists" : "/checklists?view=closed"}>{closed ? "Show in progress" : "Show closed"}</Link>
          </div>
          {cases.length === 0 ? (
            <div className="table-wrap"><EmptyState icon={ListChecks} title={closed ? "No closed checklists" : "No checklists in progress"}>{closed ? "Completed and cancelled checklists will appear here." : "Open one when someone joins or leaves."}</EmptyState></div>
          ) : (
            <div className="table-wrap"><div className="table-scroll">
              <table className="responsive">
                <thead><tr><th>Person</th><th>Type</th><th>Date</th><th>Progress</th><th>Status</th></tr></thead>
                <tbody>
                  {cases.map((c) => {
                    const p = caseProgress(c.items);
                    const late = c.items.filter((i) => itemOverdue(i, today)).length;
                    return (
                      <tr key={c.id}>
                        <td className="primary"><Link href={`/checklists/${c.id}`}><Person name={c.subject.displayName} /></Link></td>
                        <td data-label="Type">{caseTypeLabel(c.type)}</td>
                        <td data-label="Date" className="num">{fmtDate(c.effectiveDate)}</td>
                        <td data-label="Progress" className="num">{p.done} of {p.total}{late > 0 && <> <span className="badge off">{late} overdue</span></>}</td>
                        <td data-label="Status">{caseStatusLabel(c.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div></div>
          )}
        </section>
      )}
    </Shell>
  );
}
