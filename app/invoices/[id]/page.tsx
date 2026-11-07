import { redirect } from "next/navigation";
import { Alert, Field, PageHeader, Person } from "@/lib/ui";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ConfirmSubmit } from "@/lib/confirm";
import { RecordStatusBadge } from "@/lib/finance-record-ui";
import { MAX_NOTE, MAX_PAYREF, availableRecordActions, canViewRecords, formatMoney, kindLabel } from "@/lib/finance-records";
import { Flash } from "@/lib/task-ui";
import { fmtDate, fmtDateTime, todayStr } from "@/lib/tasks";
import { actOnRecord } from "../actions";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = { create: "Recorded", pay: "Marked as paid", accept: "Accepted", decline: "Declined", void: "Voided" };

export default async function RecordDetail({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  if (!canViewRecords(user)) redirect("/");
  const x = await db.financeRecord.findUnique({
    where: { id: params.id },
    include: {
      // Vendor name only: contact details stay in the vendor register.
      vendor: { select: { name: true } }, createdBy: { select: { displayName: true } }, settledBy: { select: { displayName: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { displayName: true } } } },
    },
  });
  if (!x) redirect("/invoices");
  const actions = availableRecordActions(user, x);
  const isInvoice = x.kind === "INVOICE";
  return (
    <Shell>
      <PageHeader title={`${kindLabel(x.kind)} ${x.reference}`} crumbs={[{ label: "Invoices & quotes", href: "/invoices" }, { label: kindLabel(x.kind) }]}
        description={`${x.vendor.name} · ${formatMoney(x.amountMinor, x.currency)}`}>
        <div className="meta-row"><RecordStatusBadge kind={x.kind} status={x.status} dueDate={x.dueDate} today={todayStr()} /></div>
      </PageHeader>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {(x.status === "DECLINED" || x.status === "VOID") && x.note && <Alert kind="info">{x.status === "VOID" ? "Voided" : "Declined"}: “{x.note}”</Alert>}

      <div className="layout-2">
        <div className="stack">
          <section className="card" aria-labelledby="h-h">
            <div className="card-head"><h2 id="h-h">History</h2></div>
            <div className="card-body">
              <ol className="timeline">
                {x.events.map((ev) => (
                  <li key={ev.id}>
                    <b>{EVENT_LABEL[ev.action] ?? ev.action}</b> by {ev.actor.displayName} · <span className="num">{fmtDateTime(ev.createdAt)}</span>
                    {ev.comment && <div className="muted">“{ev.comment}”</div>}
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
        <aside className="stack" aria-label="Record details and actions">
          {actions.length > 0 && (
            <section className="card" aria-labelledby="a-h">
              <div className="card-head"><h2 id="a-h">Update</h2></div>
              <div className="card-body">
                {actions.includes("pay") && (
                  <form action={actOnRecord} className="action-block">
                    <input type="hidden" name="recordId" value={x.id} /><input type="hidden" name="action" value="pay" />
                    <h3>Mark as paid</h3>
                    <p className="muted">Records that you paid this invoice elsewhere. This app does not move money.</p>
                    <Field id="payref" label="Payment reference" required hint="For example a bank transfer or cheque number.">
                      <input id="payref" name="text" type="text" minLength={3} maxLength={MAX_PAYREF} required autoComplete="off" />
                    </Field>
                    <button type="submit">Mark as paid</button>
                  </form>
                )}
                {actions.includes("accept") && (
                  <form action={actOnRecord} className="action-block">
                    <input type="hidden" name="recordId" value={x.id} /><input type="hidden" name="action" value="accept" />
                    <h3>Accept quotation</h3>
                    <button type="submit">Accept</button>
                  </form>
                )}
                {actions.includes("decline") && (
                  <form action={actOnRecord} className="action-block">
                    <input type="hidden" name="recordId" value={x.id} /><input type="hidden" name="action" value="decline" />
                    <Field id="dec" label="Decline with a reason" required><textarea id="dec" name="text" rows={2} maxLength={MAX_NOTE} required /></Field>
                    <button type="submit" className="quiet danger-text">Decline quotation</button>
                  </form>
                )}
                {actions.includes("void") && (
                  <form action={actOnRecord} className="action-block">
                    <input type="hidden" name="recordId" value={x.id} /><input type="hidden" name="action" value="void" />
                    <h3>Void</h3>
                    <p className="muted">For an entry made by mistake. It stays in the register; re-enter it correctly.</p>
                    <Field id="void" label="Reason" required><textarea id="void" name="text" rows={2} maxLength={MAX_NOTE} required /></Field>
                    <ConfirmSubmit danger label="Void record" title="Void this record?" message="It cannot be changed afterwards. You can add a corrected record." confirmLabel="Void" />
                  </form>
                )}
              </div>
            </section>
          )}
          {actions.length === 0 && x.status === "OPEN" && <Alert kind="info">Read-only. Only the Finance head can change this record.</Alert>}
          <section className="card">
            <div className="card-head"><h2>Details</h2></div>
            <div className="card-body">
              <dl className="props">
                <div><dt>Vendor</dt><dd>{x.vendor.name}</dd></div>
                <div><dt>Type</dt><dd>{kindLabel(x.kind)}</dd></div>
                <div><dt>Number</dt><dd>{x.reference}</dd></div>
                <div><dt>Amount</dt><dd className="num">{formatMoney(x.amountMinor, x.currency)}</dd></div>
                <div><dt>Dated</dt><dd className="num">{fmtDate(x.issueDate)}</dd></div>
                <div><dt>{isInvoice ? "Due" : "Valid until"}</dt><dd className="num">{fmtDate(x.dueDate)}</dd></div>
                <div><dt>Recorded</dt><dd className="num">{fmtDateTime(x.createdAt)} by <Person name={x.createdBy.displayName} /></dd></div>
                {x.settledAt && <div><dt>Settled</dt><dd className="num">{fmtDateTime(x.settledAt)}{x.settledBy ? ` by ${x.settledBy.displayName}` : ""}</dd></div>}
                {x.paymentRef && <div><dt>Payment reference</dt><dd>{x.paymentRef}</dd></div>}
              </dl>
            </div>
          </section>
        </aside>
      </div>
    </Shell>
  );
}
