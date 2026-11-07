import { redirect } from "next/navigation";
import { Alert, Field, PageHeader, Person } from "@/lib/ui";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ExpenseStatusBadge } from "@/lib/expense-ui";
import { Flash } from "@/lib/task-ui";
import { fmtDate, fmtDateTime } from "@/lib/tasks";
import { MAX_NOTE, MAX_PAYREF, availableExpenseActions, canViewExpense, formatMoney } from "@/lib/expenses";
import { actOnExpense } from "../actions";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = { submit: "Submitted", approve: "Approved", reject: "Rejected", cancel: "Cancelled", pay: "Marked as paid" };

export default async function ExpenseDetail({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  const x = await db.expense.findUnique({
    where: { id: params.id },
    include: {
      submittedBy: { select: { displayName: true } }, decidedBy: { select: { displayName: true } }, paidBy: { select: { displayName: true } },
      approverDepartment: { select: { name: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { displayName: true } } } },
    },
  });
  // Same response for "missing" and "forbidden" so IDs cannot be probed.
  if (!x || !canViewExpense(user, x)) redirect("/expenses");
  await db.notification.updateMany({ where: { userId: user.id, expenseId: x.id, readAt: null }, data: { readAt: new Date() } });

  const actions = availableExpenseActions(user, x);
  const mine = x.submittedById === user.id;
  return (
    <Shell>
      <PageHeader title={formatMoney(x.amountMinor, x.currency)} crumbs={[{ label: "Expenses", href: "/expenses" }, { label: "Expense" }]} description={`${x.category} · ${fmtDate(x.expenseDate)}`}>
        <div className="meta-row"><ExpenseStatusBadge status={x.status} /></div>
      </PageHeader>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {x.status === "SUBMITTED" && mine && <Alert kind="info">Waiting for a head of {x.approverDepartment.name}. You will be notified when they decide.</Alert>}
      {x.status === "APPROVED" && mine && <Alert kind="info">Approved. Waiting for Finance to record payment.</Alert>}
      {x.status === "REJECTED" && x.decisionNote && <Alert kind="err">Rejected by {x.decidedBy?.displayName ?? "the approver"}: “{x.decisionNote}”</Alert>}

      <div className="layout-2">
        <div className="stack">
          <section className="card" aria-labelledby="d-h">
            <div className="card-head"><h2 id="d-h">What it was for</h2></div>
            <div className="card-body"><p className="desc">{x.description}</p><p className="muted">Receipt reference: {x.evidenceRef}</p></div>
          </section>
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
        <aside className="stack" aria-label="Expense details and actions">
          {actions.length > 0 && (
            <section className="card" aria-labelledby="a-h">
              <div className="card-head"><h2 id="a-h">{mine ? "Actions" : "Your decision"}</h2></div>
              <div className="card-body">
                {actions.includes("approve") && (
                  <form action={actOnExpense} className="action-block">
                    <input type="hidden" name="expenseId" value={x.id} /><input type="hidden" name="action" value="approve" />
                    <h3>Approve</h3>
                    <Field id="appr" label="Comment" hint="Optional."><textarea id="appr" name="text" rows={2} maxLength={MAX_NOTE} /></Field>
                    <button type="submit">Approve expense</button>
                  </form>
                )}
                {actions.includes("reject") && (
                  <form action={actOnExpense} className="action-block">
                    <input type="hidden" name="expenseId" value={x.id} /><input type="hidden" name="action" value="reject" />
                    <Field id="rej" label="Reject with a reason" required hint="The submitter is told why.">
                      <textarea id="rej" name="text" rows={3} maxLength={MAX_NOTE} required />
                    </Field>
                    <button type="submit" className="quiet danger-text">Reject expense</button>
                  </form>
                )}
                {actions.includes("pay") && (
                  <form action={actOnExpense} className="action-block">
                    <input type="hidden" name="expenseId" value={x.id} /><input type="hidden" name="action" value="pay" />
                    <h3>Record payment</h3>
                    <p className="muted">This only records that it was paid. It does not pay anything.</p>
                    <Field id="pay" label="Payment reference" hint="Optional, for example a transfer reference."><input id="pay" name="text" type="text" maxLength={MAX_PAYREF} /></Field>
                    <button type="submit">Mark as paid</button>
                  </form>
                )}
                {actions.includes("cancel") && (
                  <form action={actOnExpense} className="action-block">
                    <input type="hidden" name="expenseId" value={x.id} /><input type="hidden" name="action" value="cancel" />
                    <h3>Cancel</h3>
                    <p className="muted">Withdraws the expense. The history is kept.</p>
                    <button type="submit" className="quiet danger-text">Cancel expense</button>
                  </form>
                )}
              </div>
            </section>
          )}
          {actions.length === 0 && !mine && <Alert kind="info">You can read this expense. Only the roles named in its history can act on it.</Alert>}
          <section className="card">
            <div className="card-head"><h2>Details</h2></div>
            <div className="card-body">
              <dl className="props">
                <div><dt>Person</dt><dd><Person name={x.submittedBy.displayName} /></dd></div>
                <div><dt>Amount</dt><dd className="num">{formatMoney(x.amountMinor, x.currency)}</dd></div>
                <div><dt>Approver</dt><dd>Head of {x.approverDepartment.name}</dd></div>
                <div><dt>Submitted</dt><dd className="num">{fmtDateTime(x.createdAt)}</dd></div>
                {x.decidedAt && <div><dt>Decided</dt><dd className="num">{fmtDateTime(x.decidedAt)}{x.decidedBy ? ` by ${x.decidedBy.displayName}` : ""}</dd></div>}
                {x.paidAt && <div><dt>Paid</dt><dd className="num">{fmtDateTime(x.paidAt)}{x.paidBy ? ` by ${x.paidBy.displayName}` : ""}{x.paymentRef ? ` · ${x.paymentRef}` : ""}</dd></div>}
              </dl>
            </div>
          </section>
        </aside>
      </div>
    </Shell>
  );
}
