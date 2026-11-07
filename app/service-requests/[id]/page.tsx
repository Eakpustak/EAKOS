import { redirect } from "next/navigation";
import { Alert, Field, PageHeader, Person } from "@/lib/ui";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ServiceStatusBadge } from "@/lib/service-ui";
import { Flash } from "@/lib/task-ui";
import { fmtDateTime } from "@/lib/tasks";
import { MAX_NOTE } from "@/lib/expenses";
import { availableServiceActions, canAssign, canViewService, priorityLabel } from "@/lib/service-requests";
import { actOnService, assignService } from "../actions";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = { submit: "Submitted", assign: "Assigned", start: "Work started", resolve: "Marked as resolved", reopen: "Reopened", close: "Closed", decline: "Declined", cancel: "Cancelled" };

export default async function ServiceDetail({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  const x = await db.serviceRequest.findUnique({
    where: { id: params.id },
    include: {
      requester: { select: { displayName: true } }, assignee: { select: { displayName: true } }, department: { select: { name: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { displayName: true } } } },
    },
  });
  // Same response for "missing" and "forbidden" so IDs cannot be probed.
  if (!x || !canViewService(user, x)) redirect("/service-requests");
  await db.notification.updateMany({ where: { userId: user.id, serviceId: x.id, readAt: null }, data: { readAt: new Date() } });

  const actions = availableServiceActions(user, x);
  const mine = x.requesterId === user.id;
  const assignable = canAssign(user, x);
  // Only a head who can assign needs the member list; it is limited to active members of the handling team.
  const members = assignable
    ? await db.user.findMany({
        where: { status: "ACTIVE", id: { not: x.requesterId }, memberships: { some: { departmentId: x.departmentId } } },
        orderBy: { displayName: "asc" }, take: 200, select: { id: true, displayName: true },
      })
    : [];
  return (
    <Shell>
      <PageHeader title={x.title} crumbs={[{ label: "Service requests", href: "/service-requests" }, { label: "Request" }]}
        description={`${x.category} · ${priorityLabel(x.priority)} priority · handled by ${x.department.name}`}>
        <div className="meta-row"><ServiceStatusBadge status={x.status} /></div>
      </PageHeader>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {x.status === "OPEN" && mine && <Alert kind="info">{x.assignee ? `${x.assignee.displayName} has been assigned.` : `Waiting for a head of ${x.department.name} to assign someone.`}</Alert>}
      {x.status === "RESOLVED" && mine && <Alert kind="info">Marked as resolved. Please close it if it is fixed, or reopen it and say what is still wrong.</Alert>}
      {x.status === "DECLINED" && x.decisionNote && <Alert kind="err">Declined: “{x.decisionNote}”</Alert>}

      <div className="layout-2">
        <div className="stack">
          <section className="card" aria-labelledby="d-h">
            <div className="card-head"><h2 id="d-h">What is needed</h2></div>
            <div className="card-body">
              <p className="desc">{x.description}</p>
              {x.resolutionNote && <p className="muted">Resolution: {x.resolutionNote}</p>}
            </div>
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
          {(actions.length > 0 || assignable) && (
            <section className="card" aria-labelledby="a-h">
              <div className="card-head"><h2 id="a-h">{mine ? "Actions" : "Handle"}</h2></div>
              <div className="card-body">
                {assignable && (
                  <form action={assignService} className="action-block">
                    <input type="hidden" name="serviceId" value={x.id} />
                    <Field id="assignee" label={x.assigneeId ? "Reassign to" : "Assign to"} required>
                      <select id="assignee" name="assigneeId" required defaultValue="">
                        <option value="" disabled>Choose a person…</option>
                        {members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                      </select>
                    </Field>
                    <button type="submit">{x.assigneeId ? "Reassign" : "Assign"}</button>
                  </form>
                )}
                {actions.includes("start") && (
                  <form action={actOnService} className="action-block">
                    <input type="hidden" name="serviceId" value={x.id} /><input type="hidden" name="action" value="start" />
                    <h3>Start work</h3>
                    <button type="submit">Mark as in progress</button>
                  </form>
                )}
                {actions.includes("resolve") && (
                  <form action={actOnService} className="action-block">
                    <input type="hidden" name="serviceId" value={x.id} /><input type="hidden" name="action" value="resolve" />
                    <Field id="res" label="What was done?" required hint="The requester reads this and confirms.">
                      <textarea id="res" name="text" rows={3} maxLength={MAX_NOTE} required />
                    </Field>
                    <button type="submit">Mark as resolved</button>
                  </form>
                )}
                {actions.includes("decline") && (
                  <form action={actOnService} className="action-block">
                    <input type="hidden" name="serviceId" value={x.id} /><input type="hidden" name="action" value="decline" />
                    <Field id="dec" label="Decline with a reason" required hint="The requester is told why.">
                      <textarea id="dec" name="text" rows={3} maxLength={MAX_NOTE} required />
                    </Field>
                    <button type="submit" className="quiet danger-text">Decline request</button>
                  </form>
                )}
                {actions.includes("close") && (
                  <form action={actOnService} className="action-block">
                    <input type="hidden" name="serviceId" value={x.id} /><input type="hidden" name="action" value="close" />
                    <h3>It is fixed</h3>
                    <button type="submit">Close request</button>
                  </form>
                )}
                {actions.includes("reopen") && (
                  <form action={actOnService} className="action-block">
                    <input type="hidden" name="serviceId" value={x.id} /><input type="hidden" name="action" value="reopen" />
                    <Field id="reo" label="Still not right?" required hint="Say what is still wrong.">
                      <textarea id="reo" name="text" rows={3} maxLength={MAX_NOTE} required />
                    </Field>
                    <button type="submit" className="quiet">Reopen request</button>
                  </form>
                )}
                {actions.includes("cancel") && (
                  <form action={actOnService} className="action-block">
                    <input type="hidden" name="serviceId" value={x.id} /><input type="hidden" name="action" value="cancel" />
                    <h3>Cancel</h3>
                    <p className="muted">Withdraws the request. The history is kept.</p>
                    <button type="submit" className="quiet danger-text">Cancel request</button>
                  </form>
                )}
              </div>
            </section>
          )}
          {actions.length === 0 && !assignable && !mine && <Alert kind="info">You can read this request. Only the roles named in its history can act on it.</Alert>}
          <section className="card">
            <div className="card-head"><h2>Details</h2></div>
            <div className="card-body">
              <dl className="props">
                <div><dt>Requested by</dt><dd><Person name={x.requester.displayName} /></dd></div>
                <div><dt>Team</dt><dd>{x.department.name}</dd></div>
                <div><dt>Assigned to</dt><dd>{x.assignee ? <Person name={x.assignee.displayName} /> : "Nobody yet"}</dd></div>
                <div><dt>Opened</dt><dd className="num">{fmtDateTime(x.createdAt)}</dd></div>
                {x.resolvedAt && <div><dt>Resolved</dt><dd className="num">{fmtDateTime(x.resolvedAt)}</dd></div>}
                {x.closedAt && <div><dt>Closed</dt><dd className="num">{fmtDateTime(x.closedAt)}</dd></div>}
              </dl>
            </div>
          </section>
        </aside>
      </div>
    </Shell>
  );
}
