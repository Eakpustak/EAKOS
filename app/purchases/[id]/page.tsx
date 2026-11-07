import { redirect } from "next/navigation";
import { Alert, Field, PageHeader, Person } from "@/lib/ui";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PurchaseStatusBadge } from "@/lib/purchase-ui";
import { Flash } from "@/lib/task-ui";
import { fmtDate, fmtDateTime } from "@/lib/tasks";
import { MAX_NOTE, MAX_ORDERREF, availablePurchaseActions, canViewPurchase, formatMoney } from "@/lib/purchases";
import { actOnPurchase } from "../actions";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = { submit: "Submitted", approve: "Approved", reject: "Rejected", cancel: "Cancelled", order: "Order recorded", receive: "Marked as received" };

export default async function PurchaseDetail({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  const x = await db.purchaseRequest.findUnique({
    where: { id: params.id },
    include: {
      requester: { select: { displayName: true } }, decidedBy: { select: { displayName: true } }, orderedBy: { select: { displayName: true } },
      approverDepartment: { select: { name: true } },
      // Only the vendor's name is ever selected here: contact details stay in the restricted register.
      vendor: { select: { name: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { displayName: true } } } },
    },
  });
  // Same response for "missing" and "forbidden" so IDs cannot be probed.
  if (!x || !canViewPurchase(user, x)) redirect("/purchases");
  await db.notification.updateMany({ where: { userId: user.id, purchaseId: x.id, readAt: null }, data: { readAt: new Date() } });

  const actions = availablePurchaseActions(user, x);
  const mine = x.requesterId === user.id;
  // The vendor list is only fetched for someone who can actually place the order (the Operations head).
  const vendors = actions.includes("order")
    ? await db.vendor.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, take: 300, select: { id: true, name: true, category: true } })
    : [];
  return (
    <Shell>
      <PageHeader title={x.title} crumbs={[{ label: "Purchases", href: "/purchases" }, { label: "Request" }]}
        description={`${x.category} · quantity ${x.quantity} · estimate ${formatMoney(x.estimatedMinor, x.currency)}`}>
        <div className="meta-row"><PurchaseStatusBadge status={x.status} /></div>
      </PageHeader>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {x.status === "SUBMITTED" && mine && <Alert kind="info">Waiting for a head of {x.approverDepartment.name}. You will be notified when they decide.</Alert>}
      {x.status === "APPROVED" && mine && <Alert kind="info">Approved. Waiting for Operations to place the order.</Alert>}
      {x.status === "ORDERED" && mine && <Alert kind="info">Ordered. Please confirm here when it arrives.</Alert>}
      {x.status === "REJECTED" && x.decisionNote && <Alert kind="err">Rejected by {x.decidedBy?.displayName ?? "the approver"}: “{x.decisionNote}”</Alert>}

      <div className="layout-2">
        <div className="stack">
          <section className="card" aria-labelledby="d-h">
            <div className="card-head"><h2 id="d-h">Why it is needed</h2></div>
            <div className="card-body"><p className="desc">{x.justification}</p></div>
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
        <aside className="stack" aria-label="Request details and actions">
          {actions.length > 0 && (
            <section className="card" aria-labelledby="a-h">
              <div className="card-head"><h2 id="a-h">{mine ? "Actions" : "Your decision"}</h2></div>
              <div className="card-body">
                {actions.includes("approve") && (
                  <form action={actOnPurchase} className="action-block">
                    <input type="hidden" name="purchaseId" value={x.id} /><input type="hidden" name="action" value="approve" />
                    <h3>Approve</h3>
                    <Field id="appr" label="Comment" hint="Optional."><textarea id="appr" name="text" rows={2} maxLength={MAX_NOTE} /></Field>
                    <button type="submit">Approve request</button>
                  </form>
                )}
                {actions.includes("reject") && (
                  <form action={actOnPurchase} className="action-block">
                    <input type="hidden" name="purchaseId" value={x.id} /><input type="hidden" name="action" value="reject" />
                    <Field id="rej" label="Reject with a reason" required hint="The requester is told why.">
                      <textarea id="rej" name="text" rows={3} maxLength={MAX_NOTE} required />
                    </Field>
                    <button type="submit" className="quiet danger-text">Reject request</button>
                  </form>
                )}
                {actions.includes("order") && (
                  <form action={actOnPurchase} className="action-block">
                    <input type="hidden" name="purchaseId" value={x.id} /><input type="hidden" name="action" value="order" />
                    <h3>Record the order</h3>
                    <p className="muted">This only records that you placed the order. It does not buy anything.</p>
                    <Field id="vendorId" label="Vendor" required hint="Active vendors from the register.">
                      <select id="vendorId" name="vendorId" required defaultValue="">
                        <option value="" disabled>Choose a vendor…</option>
                        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.category})</option>)}
                      </select>
                    </Field>
                    <Field id="ord" label="Order reference" required hint="For example a purchase order or order number.">
                      <input id="ord" name="text" type="text" maxLength={MAX_ORDERREF} minLength={3} required />
                    </Field>
                    <button type="submit">Record order</button>
                  </form>
                )}
                {actions.includes("receive") && (
                  <form action={actOnPurchase} className="action-block">
                    <input type="hidden" name="purchaseId" value={x.id} /><input type="hidden" name="action" value="receive" />
                    <h3>It arrived</h3>
                    <p className="muted">Confirms you received what was ordered.</p>
                    <button type="submit">Mark as received</button>
                  </form>
                )}
                {actions.includes("cancel") && (
                  <form action={actOnPurchase} className="action-block">
                    <input type="hidden" name="purchaseId" value={x.id} /><input type="hidden" name="action" value="cancel" />
                    <h3>Cancel</h3>
                    <p className="muted">Withdraws the request. The history is kept.</p>
                    <button type="submit" className="quiet danger-text">Cancel request</button>
                  </form>
                )}
              </div>
            </section>
          )}
          {actions.length === 0 && !mine && <Alert kind="info">You can read this request. Only the roles named in its history can act on it.</Alert>}
          <section className="card">
            <div className="card-head"><h2>Details</h2></div>
            <div className="card-body">
              <dl className="props">
                <div><dt>Requested by</dt><dd><Person name={x.requester.displayName} /></dd></div>
                <div><dt>Estimate</dt><dd className="num">{formatMoney(x.estimatedMinor, x.currency)}</dd></div>
                <div><dt>Quantity</dt><dd className="num">{x.quantity}</dd></div>
                {x.neededBy && <div><dt>Needed by</dt><dd className="num">{fmtDate(x.neededBy)}</dd></div>}
                <div><dt>Approver</dt><dd>Head of {x.approverDepartment.name}</dd></div>
                <div><dt>Requested</dt><dd className="num">{fmtDateTime(x.createdAt)}</dd></div>
                {x.decidedAt && <div><dt>Decided</dt><dd className="num">{fmtDateTime(x.decidedAt)}{x.decidedBy ? ` by ${x.decidedBy.displayName}` : ""}</dd></div>}
                {x.orderedAt && <div><dt>Ordered</dt><dd className="num">{fmtDateTime(x.orderedAt)}{x.orderedBy ? ` by ${x.orderedBy.displayName}` : ""}</dd></div>}
                {x.vendor && <div><dt>Vendor</dt><dd>{x.vendor.name}</dd></div>}
                {x.orderRef && <div><dt>Order reference</dt><dd>{x.orderRef}</dd></div>}
                {x.receivedAt && <div><dt>Received</dt><dd className="num">{fmtDateTime(x.receivedAt)}</dd></div>}
              </dl>
            </div>
          </section>
        </aside>
      </div>
    </Shell>
  );
}
