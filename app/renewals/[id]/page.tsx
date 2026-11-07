import { redirect } from "next/navigation";
import { Alert, PageHeader } from "@/lib/ui";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ConfirmSubmit } from "@/lib/confirm";
import { addCycle, canManageRenewals, canViewRenewals, cycleLabel, daysUntil, formatMoney, renewalState } from "@/lib/renewals";
import { Flash } from "@/lib/task-ui";
import { fmtDate, fmtDateTime, todayStr } from "@/lib/tasks";
import { cancelRenewal, markRenewed } from "../actions";

export const dynamic = "force-dynamic";
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function RenewalDetail({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  if (!canViewRenewals(user)) redirect("/");
  // Vendor name only: contact details stay in the vendor register.
  const r = await db.renewal.findUnique({ where: { id: params.id }, include: { vendor: { select: { name: true } }, createdBy: { select: { displayName: true } } } });
  if (!r) redirect("/renewals");
  const today = todayStr();
  const cur = iso(r.renewalDate);
  const st = renewalState({ status: r.status, renewalDate: cur, reminderDays: r.reminderDays }, today);
  const d = daysUntil(cur, today);
  const manage = canManageRenewals(user) && r.status === "ACTIVE";
  return (
    <Shell>
      <PageHeader title={r.name} crumbs={[{ label: "Renewals", href: "/renewals" }, { label: "Renewal" }]} description={`${r.category} · ${formatMoney(r.amountMinor, r.currency)} ${cycleLabel(r.cycle).toLowerCase()}`} />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {st === "overdue" && <Alert kind="err">The renewal date passed {-d} day{-d === 1 ? "" : "s"} ago. Renew it, or cancel it if it lapsed on purpose.</Alert>}
      {st === "due-soon" && <Alert kind="info">{d === 0 ? "Due today." : `Due in ${d} day${d === 1 ? "" : "s"}.`}</Alert>}
      <section className="card"><div className="card-body"><dl className="props">
        <div><dt>Next renewal</dt><dd className="num">{fmtDate(r.renewalDate)}</dd></div>
        <div><dt>Reminder</dt><dd>{r.reminderDays} days before</dd></div>
        <div><dt>Vendor</dt><dd>{r.vendor?.name ?? "—"}</dd></div>
        <div><dt>Cost</dt><dd className="num">{formatMoney(r.amountMinor, r.currency)} · {cycleLabel(r.cycle)}</dd></div>
        {r.lastRenewedAt && <div><dt>Last marked renewed</dt><dd className="num">{fmtDateTime(r.lastRenewedAt)}</dd></div>}
        {r.cancelledAt && <div><dt>Cancelled</dt><dd className="num">{fmtDateTime(r.cancelledAt)}</dd></div>}
        <div><dt>Added by</dt><dd>{r.createdBy.displayName} · <span className="num">{fmtDateTime(r.createdAt)}</span></dd></div>
      </dl></div></section>
      {manage && (
        <>
          <form action={markRenewed} className="panel form-narrow" style={{ marginTop: "1rem" }}>
            <input type="hidden" name="id" value={r.id} /><input type="hidden" name="current" value={cur} />
            <h2>Mark as renewed</h2>
            <p className="muted">Records that it was renewed elsewhere. The next date moves to {fmtDate(new Date(`${addCycle(cur, r.cycle)}T00:00:00.000Z`))}.</p>
            <div className="btn-row"><button type="submit">Mark as renewed</button></div>
          </form>
          <form action={cancelRenewal} className="panel form-narrow" style={{ marginTop: "1rem" }}>
            <input type="hidden" name="id" value={r.id} />
            <h2>Cancel</h2>
            <p className="muted">Stops reminders. The record stays in the register.</p>
            <div className="btn-row"><ConfirmSubmit danger label="Cancel renewal" title="Cancel this renewal?" message="Reminders stop. This cannot be undone; add it again if needed." confirmLabel="Cancel renewal" /></div>
          </form>
        </>
      )}
    </Shell>
  );
}
