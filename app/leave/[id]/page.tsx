import { redirect } from "next/navigation";
import { Alert, Field, PageHeader, Person } from "@/lib/ui";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LeaveStatusBadge } from "@/lib/leave-ui";
import { Flash } from "@/lib/task-ui";
import { fmtDate, fmtDateTime, todayStr } from "@/lib/tasks";
import { holidaysInRange } from "@/lib/holidays";
import { MAX_REASON, availableLeaveActions, canViewLeave, leaveDays } from "@/lib/leave";
import { actOnLeave } from "../actions";

export const dynamic = "force-dynamic";

export default async function LeaveDetail({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  const l = await db.leaveRequest.findUnique({
    where: { id: params.id },
    include: {
      requester: { select: { displayName: true } },
      decidedBy: { select: { displayName: true } },
      approverDepartment: { select: { name: true } },
    },
  });
  // Same response for "missing" and "forbidden" so IDs cannot be probed.
  if (!l || !canViewLeave(user, l)) redirect("/leave");
  await db.notification.updateMany({ where: { userId: user.id, leaveId: l.id, readAt: null }, data: { readAt: new Date() } });

  const actions = availableLeaveActions(user, l, todayStr());
  const mine = l.requesterId === user.id;
  const days = leaveDays(l.startDate, l.endDate);
  const holidays = holidaysInRange(await db.holiday.findMany({ where: { date: { gte: l.startDate, lte: l.endDate } } }), l.startDate, l.endDate);

  return (
    <Shell>
      <PageHeader
        title={`${l.leaveType} leave · ${days} day${days === 1 ? "" : "s"}`}
        crumbs={[{ label: "Leave", href: "/leave" }, { label: "Request" }]}
        description={`${fmtDate(l.startDate)} – ${fmtDate(l.endDate)}`}
      >
        <div className="meta-row"><LeaveStatusBadge status={l.status} /></div>
      </PageHeader>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {l.status === "PENDING" && mine && <Alert kind="info">Waiting for a head of {l.approverDepartment.name}. You will be notified when they decide.</Alert>}
      {l.status === "REJECTED" && l.decisionNote && <Alert kind="err">Rejected by {l.decidedBy?.displayName ?? "the approver"}: “{l.decisionNote}”</Alert>}

      <div className="layout-2">
        <div className="stack">
          <section className="card" aria-labelledby="r-h">
            <div className="card-head"><h2 id="r-h">Reason</h2></div>
            <div className="card-body">{l.reason ? <p className="desc">{l.reason}</p> : <p className="muted">No reason given.</p>}</div>
          </section>
        </div>
        <aside className="stack" aria-label="Request details and actions">
          {actions.length > 0 && (
            <section className="card" aria-labelledby="a-h">
              <div className="card-head"><h2 id="a-h">{mine ? "Actions" : "Your decision"}</h2></div>
              <div className="card-body">
                {actions.includes("approve") && (
                  <form action={actOnLeave} className="action-block">
                    <input type="hidden" name="leaveId" value={l.id} /><input type="hidden" name="action" value="approve" />
                    <h3>Approve</h3>
                    <button type="submit">Approve leave</button>
                  </form>
                )}
                {actions.includes("reject") && (
                  <form action={actOnLeave} className="action-block">
                    <input type="hidden" name="leaveId" value={l.id} /><input type="hidden" name="action" value="reject" />
                    <Field id="rej" label="Reject with a reason" required hint="The requester is told why.">
                      <textarea id="rej" name="text" rows={3} maxLength={MAX_REASON} required />
                    </Field>
                    <button type="submit" className="quiet danger-text">Reject leave</button>
                  </form>
                )}
                {actions.includes("cancel") && (
                  <form action={actOnLeave} className="action-block">
                    <input type="hidden" name="leaveId" value={l.id} /><input type="hidden" name="action" value="cancel" />
                    <h3>Cancel</h3>
                    <p className="muted">Withdraws the request. The history is kept.</p>
                    <button type="submit" className="quiet danger-text">Cancel request</button>
                  </form>
                )}
              </div>
            </section>
          )}
          {actions.length === 0 && !mine && <Alert kind="info">You can read this request. Only a head of {l.approverDepartment.name} can decide it.</Alert>}
          <section className="card">
            <div className="card-head"><h2>Details</h2></div>
            <div className="card-body">
              <dl className="props">
                <div><dt>Person</dt><dd><Person name={l.requester.displayName} /></dd></div>
                <div><dt>Type</dt><dd>{l.leaveType}</dd></div>
                {holidays.length > 0 && <div><dt>Company holidays inside</dt><dd>{holidays.map((h) => `${fmtDate(h.date)} ${h.name}`).join(", ")}</dd></div>}
                <div><dt>Approver</dt><dd>Head of {l.approverDepartment.name}</dd></div>
                <div><dt>Requested</dt><dd className="num">{fmtDateTime(l.createdAt)}</dd></div>
                {l.decidedAt && <div><dt>Decided</dt><dd className="num">{fmtDateTime(l.decidedAt)}{l.decidedBy ? ` by ${l.decidedBy.displayName}` : ""}</dd></div>}
              </dl>
            </div>
          </section>
        </aside>
      </div>
    </Shell>
  );
}
