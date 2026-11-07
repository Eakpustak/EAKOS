import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Field, PageHeader, Person } from "@/lib/ui";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { HandoverStatusBadge } from "@/lib/handover-ui";
import { Flash } from "@/lib/task-ui";
import { canAccessTask, fmtDate, fmtDateTime } from "@/lib/tasks";
import { canAccessLead } from "@/lib/leads";
import {
  MAX_TEXT, ackWindowHours, ageLabel, availableActions, canAccessHandover, isAckOverdue,
} from "@/lib/handovers";
import { canCreateFromHandover, canAccessProject } from "@/lib/projects";
import { actOnHandover } from "../actions";

export const dynamic = "force-dynamic";

const EVENT_TEXT: Record<string, string> = {
  created: "sent the handover",
  accepted: "accepted the handover and took ownership",
  clarification_requested: "asked for clarification",
  clarification_answered: "answered the clarification request",
  rejected: "rejected the handover",
  completed: "marked the handover complete",
  cancelled: "cancelled the handover",
  project_created: "started the delivery project",
};

export default async function HandoverDetail({
  params, searchParams,
}: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  const h = await db.handover.findUnique({
    where: { id: params.id },
    include: {
      sender: { select: { displayName: true } },
      receiver: { select: { displayName: true } },
      fromDepartment: { select: { name: true } },
      toDepartment: { select: { name: true } },
      linkedTask: { select: { id: true, title: true, creatorId: true, assigneeId: true, departmentId: true } },
      lead: { select: { id: true, organizationName: true, ownerId: true, createdById: true, stage: true } },
      project: { select: { id: true, name: true, ownerId: true, createdById: true, departmentId: true, status: true, members: { select: { userId: true } } } },
      events: { orderBy: { createdAt: "desc" }, take: 100, include: { actor: { select: { displayName: true } } } },
    },
  });
  // Same response for "missing" and "forbidden" so IDs cannot be probed.
  if (!h || !canAccessHandover(user, h)) redirect("/handovers");

  // Opening the handover marks its notifications as read (reading is not acknowledging).
  await db.notification.updateMany({ where: { userId: user.id, handoverId: h.id, readAt: null }, data: { readAt: new Date() } });

  const actions = availableActions(h, user.id);
  const isReceiver = h.receiverId === user.id;
  const isSender = h.senderId === user.id;
  const ackLate = isAckOverdue(h);
  const reasonText = (t: string) => {
    const e = h.events.find((x) => x.type === t);
    const d = (e?.detail ?? {}) as { text?: string };
    return e && d.text ? { by: e.actor.displayName, text: d.text } : null;
  };
  const latestClar = h.status === "CLARIFICATION_REQUESTED" ? reasonText("clarification_requested") : null;
  const rejection = h.status === "REJECTED" ? reasonText("rejected") : null;
  // The source lead is only linked for people who may open it; everyone else just sees that one exists.
  const leadVisible = !!h.lead && canAccessLead(user, h.lead);
  const canStartProject = canCreateFromHandover(user, h, !!h.project).ok;
  const projectVisible = !!h.project && canAccessProject(user, h.project);
  const taskVisible = !!h.linkedTask && canAccessTask(user, h.linkedTask);

  return (
    <Shell>
      <PageHeader title={h.title} crumbs={[{ label: "Handovers", href: "/handovers" }, { label: "Handover" }]}>
        <div className="meta-row">
          <HandoverStatusBadge status={h.status} />
          {ackLate && <span className="badge pr-urgent">Not acknowledged in {ackWindowHours()}h</span>}
        </div>
      </PageHeader>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      {h.status === "PENDING" && isReceiver && (
        <Alert kind="info">This was sent to you and is waiting for your response. It is not accepted until you accept it.</Alert>
      )}
      {h.status === "PENDING" && isSender && (
        <Alert kind={ackLate ? "err" : "info"}>
          {h.receiver.displayName} has not responded yet ({ageLabel(h.sentAt)} since sent). Being notified is not the same as acknowledging, so follow up directly if it is urgent.
        </Alert>
      )}
      {latestClar && (
        <Alert kind="info">
          {latestClar.by} asked: “{latestClar.text}”{isSender ? " Answer below to send it back for acknowledgement." : ""}
        </Alert>
      )}
      {rejection && <Alert kind="err">Rejected by {rejection.by}: “{rejection.text}”</Alert>}

      <div className="layout-2">
        <div className="stack">
          <section className="card" aria-labelledby="ctx-h">
            <div className="card-head"><h2 id="ctx-h">Context</h2></div>
            <div className="card-body"><p className="desc">{h.context}</p></div>
          </section>
          <section className="card" aria-labelledby="del-h">
            <div className="card-head"><h2 id="del-h">Expected deliverable</h2></div>
            <div className="card-body"><p className="desc">{h.deliverable}</p></div>
          </section>
          {h.completionSummary && (
            <section className="card" aria-labelledby="sum-h">
              <div className="card-head"><h2 id="sum-h">Completion summary</h2></div>
              <div className="card-body"><p className="desc">{h.completionSummary}</p></div>
            </section>
          )}
          <section className="card" aria-labelledby="activity-h">
            <div className="card-head"><h2 id="activity-h">Activity</h2></div>
            <div className="card-body">
              <ol className="timeline">
                {h.events.map((e) => {
                  const text = ((e.detail ?? {}) as { text?: string }).text;
                  return (
                    <li key={e.id}>
                      <b>{e.actor.displayName}</b> {EVENT_TEXT[e.type] ?? e.type}
                      {text && <p className="reason">{text}</p>}
                      <time dateTime={e.createdAt.toISOString()}>{fmtDateTime(e.createdAt)}</time>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
        </div>

        <aside className="stack" aria-label="Handover details">
          {actions.length > 0 && (
            <section className="card" aria-labelledby="act-h">
              <div className="card-head"><h2 id="act-h">{isReceiver ? "Your response" : "Actions"}</h2></div>
              <div className="card-body">
                {actions.includes("accept") && (
                  <form action={actOnHandover} className="action-block">
                    <input type="hidden" name="handoverId" value={h.id} />
                    <input type="hidden" name="action" value="accept" />
                    <h3>Accept</h3>
                    <p className="muted">You become the accountable owner of this work.</p>
                    <button type="submit">Accept handover</button>
                  </form>
                )}
                {actions.includes("request_clarification") && (
                  <form action={actOnHandover} className="action-block">
                    <input type="hidden" name="handoverId" value={h.id} />
                    <input type="hidden" name="action" value="request_clarification" />
                    <Field id="clar-text" label="Ask for clarification" required>
                      <textarea id="clar-text" name="text" rows={3} maxLength={MAX_TEXT} required placeholder="What is unclear or missing?" />
                    </Field>
                    <button type="submit" className="quiet">Request clarification</button>
                  </form>
                )}
                {actions.includes("reject") && (
                  <form action={actOnHandover} className="action-block">
                    <input type="hidden" name="handoverId" value={h.id} />
                    <input type="hidden" name="action" value="reject" />
                    <Field id="rej-text" label="Reject with a reason" required hint="Rejecting ends this handover. The sender is told why.">
                      <textarea id="rej-text" name="text" rows={3} maxLength={MAX_TEXT} required />
                    </Field>
                    <button type="submit" className="quiet danger-text">Reject handover</button>
                  </form>
                )}
                {actions.includes("respond") && (
                  <form action={actOnHandover} className="action-block">
                    <input type="hidden" name="handoverId" value={h.id} />
                    <input type="hidden" name="action" value="respond" />
                    <Field id="resp-text" label="Answer the clarification request" required hint="Sending this asks the receiver to acknowledge again.">
                      <textarea id="resp-text" name="text" rows={4} maxLength={MAX_TEXT} required />
                    </Field>
                    <button type="submit">Send answer</button>
                  </form>
                )}
                {actions.includes("complete") && (
                  <form action={actOnHandover} className="action-block">
                    <input type="hidden" name="handoverId" value={h.id} />
                    <input type="hidden" name="action" value="complete" />
                    <Field id="done-text" label="Completion summary" required hint="What was delivered, with links or evidence where useful.">
                      <textarea id="done-text" name="text" rows={4} maxLength={MAX_TEXT} required />
                    </Field>
                    <button type="submit">Mark complete</button>
                  </form>
                )}
                {actions.includes("cancel") && (
                  <form action={actOnHandover} className="action-block">
                    <input type="hidden" name="handoverId" value={h.id} />
                    <input type="hidden" name="action" value="cancel" />
                    <h3>Cancel</h3>
                    <p className="muted">Withdraws the handover. The receiver is notified and the history is kept.</p>
                    <button type="submit" className="quiet danger-text">Cancel handover</button>
                  </form>
                )}
              </div>
            </section>
          )}
          {canStartProject && (
            <section className="card" aria-labelledby="pj-h">
              <div className="card-head"><h2 id="pj-h">Delivery project</h2></div>
              <div className="card-body">
                <p className="muted">You accepted this. Start a project to track milestones and tasks.</p>
                <p><Link className="btn" href={`/projects/new?handoverId=${h.id}`}>Create project</Link></p>
              </div>
            </section>
          )}
          {actions.length === 0 && !isSender && !isReceiver && (
            <Alert kind="info">You can see this as a department head. Only the sender and the named receiver can act on it.</Alert>
          )}

          <section className="card">
            <div className="card-head"><h2>Details</h2></div>
            <div className="card-body">
              <dl className="props">
                <div><dt>From</dt><dd><Person name={h.sender.displayName} sub={h.fromDepartment.name} /></dd></div>
                <div><dt>To</dt><dd><Person name={h.receiver.displayName} sub={h.toDepartment.name} /></dd></div>
                <div><dt>Due</dt><dd className="num">{fmtDate(h.dueAt)}</dd></div>
                <div><dt>Sent</dt><dd className="num">{fmtDateTime(h.sentAt)}</dd></div>
                {h.respondedAt && <div><dt>First response</dt><dd className="num">{fmtDateTime(h.respondedAt)}</dd></div>}
                {h.completedAt && <div><dt>Completed</dt><dd className="num">{fmtDateTime(h.completedAt)}</dd></div>}
                {h.project && (
                  <div><dt>Delivery project</dt><dd>
                    {projectVisible ? <Link href={`/projects/${h.project.id}`}>{h.project.name}</Link> : <span className="muted">A delivery project has started</span>}
                  </dd></div>
                )}
                {h.lead && (
                  <div><dt>Source lead</dt><dd>
                    {leadVisible ? <Link href={`/leads/${h.lead.id}`}>{h.lead.organizationName}</Link> : <span className="muted">A sales lead (the details are in the context above)</span>}
                  </dd></div>
                )}
                {h.linkedTask && (
                  <div><dt>Linked task</dt><dd>
                    {taskVisible ? <Link href={`/tasks/${h.linkedTask.id}`}>{h.linkedTask.title}</Link> : <span className="muted">A task you don’t have access to</span>}
                  </dd></div>
                )}
              </dl>
            </div>
          </section>
        </aside>
      </div>
    </Shell>
  );
}
