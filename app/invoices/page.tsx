import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { RecordTable } from "@/lib/finance-record-ui";
import { canManageRecords, canViewRecords, formatMoney, isRecordKind } from "@/lib/finance-records";
import { Flash } from "@/lib/task-ui";
import { todayStr } from "@/lib/tasks";
import { PageHeader } from "@/lib/ui";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const VIEWS = [["open", "Open"], ["overdue", "Overdue"], ["done", "Settled"], ["all", "All"]] as const;
const PAGE = 25;

export default async function Invoices({ searchParams }: { searchParams: { view?: string; kind?: string; page?: string; error?: string; ok?: string } }) {
  const user = await requireUser();
  if (!canViewRecords(user)) redirect("/");
  const today = todayStr();
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const view = VIEWS.some(([v]) => v === searchParams.view) ? searchParams.view! : "open";
  const kind = isRecordKind(searchParams.kind ?? "") ? searchParams.kind! : null;
  const page = Math.max(1, Math.min(1000, Number(searchParams.page) || 1));

  const where: Prisma.FinanceRecordWhereInput = {
    ...(kind ? { kind: kind as "INVOICE" | "QUOTATION" } : {}),
    ...(view === "open" ? { status: "OPEN" } : view === "done" ? { status: { not: "OPEN" } } : view === "overdue" ? { status: "OPEN", dueDate: { lt: todayDate } } : {}),
  };
  const [rows, total, owed, overdue] = await Promise.all([
    db.financeRecord.findMany({
      where, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE,
      select: { id: true, kind: true, reference: true, amountMinor: true, currency: true, issueDate: true, dueDate: true, status: true, vendor: { select: { name: true } } },
    }),
    db.financeRecord.count({ where }),
    // Outstanding invoices, summed per currency (never across currencies).
    db.financeRecord.groupBy({ by: ["currency"], where: { kind: "INVOICE", status: "OPEN" }, _sum: { amountMinor: true }, _count: { _all: true } }),
    db.financeRecord.count({ where: { kind: "INVOICE", status: "OPEN", dueDate: { lt: todayDate } } }),
  ]);
  const qs = (o: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ view, kind, ...o })) if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
    return `/invoices?${p.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <Shell>
      <PageHeader
        title="Invoices & quotes"
        description={canManageRecords(user) ? "Vendor invoices and quotations. Records what was received and paid; it is not accounting." : "Read-only. Finance maintains this register."}
        actions={canManageRecords(user) && <Link className="btn" href="/invoices/new"><Plus className="ic" aria-hidden="true" />Add record</Link>}
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      <section className="stats" aria-label="Outstanding invoices">
        {owed.length === 0 ? <div className="stat"><div className="stat-top">Open invoices</div><span className="stat-num">0</span></div> : owed.map((o) => (
          <div className="stat" key={o.currency}><div className="stat-top">{o._count._all} open {o._count._all === 1 ? "invoice" : "invoices"}</div><span className="stat-num">{formatMoney(o._sum.amountMinor ?? 0, o.currency)}</span></div>
        ))}
        <div className="stat"><div className="stat-top">Overdue invoices</div><span className="stat-num">{overdue}</span></div>
      </section>
      <nav aria-label="View" className="btn-row" style={{ margin: "1rem 0" }}>
        {VIEWS.map(([v, l]) => <Link key={v} className={view === v ? "btn" : "btn ghost"} href={qs({ view: v, page: null })} aria-current={view === v ? "page" : undefined}>{l}</Link>)}
      </nav>
      <form method="get" className="btn-row" style={{ marginBottom: "1rem" }}>
        <input type="hidden" name="view" value={view} />
        <label htmlFor="kind" className="muted">Type</label>
        <select id="kind" name="kind" defaultValue={kind ?? ""}>
          <option value="">All</option><option value="INVOICE">Invoices</option><option value="QUOTATION">Quotations</option>
        </select>
        <button type="submit" className="quiet sm">Filter</button>
      </form>
      <RecordTable rows={rows} today={today} empty={view === "open" ? "No open invoices or quotations." : "Nothing matches this view."} />
      {pages > 1 && (
        <p className="hint" style={{ marginTop: "1rem" }}>
          Page {page} of {pages} ·{" "}
          {page > 1 && <Link href={qs({ page: page - 1 })}>Previous</Link>}{page > 1 && page < pages && " · "}{page < pages && <Link href={qs({ page: page + 1 })}>Next</Link>}
        </p>
      )}
    </Shell>
  );
}
