import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageRenewals, canViewRenewals, cycleLabel, daysUntil, formatMoney, renewalState } from "@/lib/renewals";
import { Flash } from "@/lib/task-ui";
import { fmtDate, todayStr } from "@/lib/tasks";
import { EmptyState, PageHeader } from "@/lib/ui";

export const dynamic = "force-dynamic";
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function Renewals({ searchParams }: { searchParams: { view?: string; error?: string; ok?: string } }) {
  const user = await requireUser();
  if (!canViewRenewals(user)) redirect("/");
  const cancelled = searchParams.view === "cancelled";
  const today = todayStr();
  const rows = await db.renewal.findMany({
    where: { status: cancelled ? "CANCELLED" : "ACTIVE" }, orderBy: [{ renewalDate: "asc" }, { name: "asc" }], take: 300,
    select: { id: true, name: true, category: true, amountMinor: true, currency: true, cycle: true, renewalDate: true, reminderDays: true, status: true, vendor: { select: { name: true } } },
  });
  return (
    <Shell>
      <PageHeader title="Renewals" description="Subscriptions, domains and hosting. Never store logins or licence keys here."
        actions={canManageRenewals(user) && <Link className="btn" href="/renewals/new"><Plus className="ic" aria-hidden="true" />Add renewal</Link>} />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      <nav aria-label="View" className="btn-row" style={{ marginBottom: "1rem" }}>
        <Link className={!cancelled ? "btn" : "btn ghost"} href="/renewals" aria-current={!cancelled ? "page" : undefined}>Active</Link>
        <Link className={cancelled ? "btn" : "btn ghost"} href="/renewals?view=cancelled" aria-current={cancelled ? "page" : undefined}>Cancelled</Link>
      </nav>
      {rows.length === 0 ? (
        <div className="table-wrap"><EmptyState icon={RefreshCw} title="No renewals">{cancelled ? "Cancelled renewals appear here." : "Add the first renewal to start tracking."}</EmptyState></div>
      ) : (
        <div className="table-wrap"><div className="table-scroll">
          <table className="responsive">
            <thead><tr><th>Renewal</th><th>Vendor</th><th>Cost</th><th>Next renewal</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const st = renewalState({ status: r.status, renewalDate: iso(r.renewalDate), reminderDays: r.reminderDays }, today);
                const d = daysUntil(iso(r.renewalDate), today);
                return (
                  <tr key={r.id}>
                    <td className="primary"><Link className="row-link" href={`/renewals/${r.id}`}>{r.name}</Link></td>
                    <td data-label="Vendor">{r.vendor?.name ?? "—"}</td>
                    <td data-label="Cost" className="num">{formatMoney(r.amountMinor, r.currency)} · {cycleLabel(r.cycle)}</td>
                    <td data-label="Next renewal" className="num">{fmtDate(r.renewalDate)}</td>
                    <td data-label="Status">
                      {st === "overdue" ? <span className="badge lv-rejected">Overdue · {-d}d</span>
                        : st === "due-soon" ? <span className="badge lv-open">{d === 0 ? "Due today" : `Due in ${d}d`}</span>
                        : st === "cancelled" ? <span className="badge lv-cancelled">Cancelled</span>
                        : <span className="badge lv-approved">Scheduled</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div></div>
      )}
    </Shell>
  );
}
