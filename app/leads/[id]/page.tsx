import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, Phone } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FollowUp, StageBadge } from "@/lib/lead-ui";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader, Person } from "@/lib/ui";
import { fmtDate, fmtDateTime, todayStr, visibleTaskWhere, STATUS_LABEL, dueStr } from "@/lib/tasks";
import {
  INTERACTION_LABEL, MANUAL_INTERACTIONS, MAX_REASON, MAX_SUMMARY, SALES_SLUG, STAGE_LABEL, allowedNextStages,
  canAccessLead, canHandOverLead, canManageLead, isOpenStage, validEmail, validPhone,
} from "@/lib/leads";
import { HandoverStatusBadge } from "@/lib/handover-ui";
import { visibleHandoverWhere } from "@/lib/handovers";
import { changeStage, createFollowUpTask, logInteraction, reassignLead, setFollowUp } from "../actions";

export const dynamic = "force-dynamic";

export default async function LeadDetail({
  params, searchParams,
}: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  const lead = await db.lead.findUnique({
    where: { id: params.id },
    include: {
      owner: { select: { displayName: true } },
      createdBy: { select: { displayName: true } },
      interactions: { orderBy: { occurredAt: "desc" }, take: 200, include: { actor: { select: { displayName: true } } } },
    },
  });
  // Same response for "missing" and "forbidden" so IDs cannot be probed.
  if (!lead || !canAccessLead(user, lead)) redirect("/leads");

  await db.notification.updateMany({ where: { userId: user.id, leadId: lead.id, readAt: null }, data: { readAt: new Date() } });

  const manage = canManageLead(user, lead);
  const open = isOpenStage(lead.stage);
  const nextStages = allowedNextStages(user, lead);
  const handable = canHandOverLead(user, lead);
  const [salesPeople, tasks, handovers] = await Promise.all([
    manage && open
      ? db.user.findMany({
          where: { status: "ACTIVE", memberships: { some: { department: { slug: SALES_SLUG } } } },
          orderBy: { displayName: "asc" }, select: { id: true, displayName: true },
        })
      : Promise.resolve([]),
    // Only follow-up tasks this user may already see (task access rules still apply).
    db.task.findMany({
      where: { AND: [{ leadId: lead.id }, visibleTaskWhere(user)] },
      orderBy: [{ dueAt: "asc" }], take: 20,
      select: { id: true, title: true, status: true, dueAt: true, assignee: { select: { displayName: true } } },
    }),
    // Delivery handovers from this lead that the viewer may already see (handover access rules still apply).
    db.handover.findMany({
      where: { AND: [{ leadId: lead.id }, visibleHandoverWhere(user)] },
      orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, title: true, status: true, receiver: { select: { displayName: true } }, toDepartment: { select: { name: true } } },
    }),
  ]);
  const today = todayStr();

  return (
    <Shell>
      <PageHeader
        title={lead.organizationName}
        crumbs={[{ label: "Leads", href: "/leads" }, { label: lead.organizationName }]}
        description={`Contact: ${lead.contactName}`}
      >
        <div className="meta-row">
          <StageBadge stage={lead.stage} />
          {open && <span className="badge plain"><FollowUp lead={lead} /></span>}
        </div>
      </PageHeader>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <div className="layout-2">
        <div className="stack">
          <section className="card" aria-labelledby="contact-h">
            <div className="card-head"><h2 id="contact-h">Contact</h2></div>
            <div className="card-body">
              <dl className="props">
                <div><dt>Person</dt><dd>{lead.contactName}</dd></div>
                {lead.contactEmail && (
                  <div><dt>Email</dt><dd>
                    {validEmail(lead.contactEmail)
                      ? <a href={`mailto:${lead.contactEmail}`}><Mail className="ic" aria-hidden="true" /> {lead.contactEmail}</a>
                      : lead.contactEmail}
                  </dd></div>
                )}
                {lead.contactPhone && (
                  <div><dt>Phone</dt><dd>
                    {validPhone(lead.contactPhone)
                      ? <a href={`tel:${lead.contactPhone.replace(/[^\d+]/g, "")}`}><Phone className="ic" aria-hidden="true" /> {lead.contactPhone}</a>
                      : lead.contactPhone}
                  </dd></div>
                )}
                <div><dt>Source</dt><dd>{lead.source}</dd></div>
                {lead.lostReason && <div><dt>Reason lost</dt><dd>{lead.lostReason}</dd></div>}
              </dl>
            </div>
          </section>

          {(handovers.length > 0 || handable) && (
            <section className="card" aria-labelledby="ho-h">
              <div className="card-head"><h2 id="ho-h">Delivery handover</h2></div>
              <div className="card-body">
                {handovers.length > 0 && (
                  <ul className="list" style={{ margin: "-.5rem -1rem 0" }}>
                    {handovers.map((h) => (
                      <li key={h.id}>
                        <div className="grow">
                          <Link href={`/handovers/${h.id}`}>{h.title}</Link>
                          <span className="sub-line muted">{h.receiver.displayName} · {h.toDepartment.name}</span>
                        </div>
                        <HandoverStatusBadge status={h.status} />
                      </li>
                    ))}
                  </ul>
                )}
                {handable && (
                  <p style={{ marginTop: handovers.length ? "1rem" : 0 }}>
                    <Link className="btn" href={`/handovers/new?leadId=${lead.id}`}>Hand over for delivery</Link>
                  </p>
                )}
              </div>
            </section>
          )}

          {tasks.length > 0 && (
            <section className="card" aria-labelledby="tasks-h">
              <div className="card-head"><h2 id="tasks-h">Follow-up tasks</h2></div>
              <div className="card-body">
                <ul className="list" style={{ margin: "-.5rem -1rem" }}>
                  {tasks.map((t) => (
                    <li key={t.id}>
                      <div className="grow">
                        <Link href={`/tasks/${t.id}`}>{t.title}</Link>
                        <span className="sub-line muted">
                          {t.assignee.displayName} · {STATUS_LABEL[t.status] ?? t.status} · due {fmtDate(t.dueAt)}
                          {t.dueAt && dueStr(t.dueAt) < today && (t.status === "TODO" || t.status === "IN_PROGRESS" || t.status === "BLOCKED") ? " · overdue" : ""}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <section className="card" aria-labelledby="tl-h">
            <div className="card-head"><h2 id="tl-h">Timeline</h2></div>
            <div className="card-body">
              <ol className="timeline">
                {lead.interactions.map((i) => (
                  <li key={i.id}>
                    <span className="kind">{INTERACTION_LABEL[i.type] ?? i.type}</span>
                    <b>{i.actor.displayName}</b>
                    <p className="reason">{i.summary}</p>
                    <time dateTime={i.occurredAt.toISOString()}>{fmtDateTime(i.occurredAt)}</time>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>

        <aside className="stack" aria-label="Lead details and actions">
          {manage && (
            <section className="card" aria-labelledby="log-h">
              <div className="card-head"><h2 id="log-h">Log an interaction</h2></div>
              <div className="card-body">
                <form action={logInteraction} className="action-block">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <Field id="i-type" label="What happened" required>
                    <select id="i-type" name="type" defaultValue="CALL" required>
                      {MANUAL_INTERACTIONS.map((t) => <option key={t} value={t}>{INTERACTION_LABEL[t]}</option>)}
                    </select>
                  </Field>
                  <Field id="i-date" label="Date"><input id="i-date" name="date" type="date" defaultValue={today} max={today} /></Field>
                  <Field id="i-summary" label="Summary" required hint="What was discussed and what was agreed.">
                    <textarea id="i-summary" name="summary" rows={4} maxLength={MAX_SUMMARY} required />
                  </Field>
                  <button type="submit">Log it</button>
                </form>
              </div>
            </section>
          )}

          {manage && nextStages.length > 0 && (
            <section className="card" aria-labelledby="stage-h">
              <div className="card-head"><h2 id="stage-h">Move stage</h2></div>
              <div className="card-body">
                <form action={changeStage} className="action-block">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <Field id="s-stage" label="New stage" required>
                    <select id="s-stage" name="stage" required defaultValue={nextStages[0]}>
                      {nextStages.map((s) => <option key={s} value={s}>{lead.stage === "LOST" ? "Reopen as " : ""}{STAGE_LABEL[s]}</option>)}
                    </select>
                  </Field>
                  <Field id="s-reason" label="Reason" hint="Required when marking a lead lost.">
                    <textarea id="s-reason" name="reason" rows={2} maxLength={MAX_REASON} />
                  </Field>
                  <button type="submit" className="quiet">Change stage</button>
                </form>
              </div>
            </section>
          )}

          {manage && open && (
            <section className="card" aria-labelledby="fu-h">
              <div className="card-head"><h2 id="fu-h">Follow-up</h2></div>
              <div className="card-body">
                <form action={setFollowUp} className="action-block">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <Field id="f-date" label="Next follow-up date" hint="Leave empty to clear it.">
                    <input id="f-date" name="nextFollowUpAt" type="date" min={today} defaultValue={lead.nextFollowUpAt ? dueStr(lead.nextFollowUpAt) : ""} />
                  </Field>
                  <button type="submit" className="quiet">Save date</button>
                </form>
                <form action={createFollowUpTask} className="action-block">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="clientToken" value={randomUUID()} />
                  <h3>Assign a follow-up task</h3>
                  <Field id="t-title" label="Task" required>
                    <input id="t-title" name="title" maxLength={200} required defaultValue={`Follow up with ${lead.organizationName}`} />
                  </Field>
                  <Field id="t-assignee" label="Who will do it" required>
                    <select id="t-assignee" name="assigneeId" defaultValue={lead.ownerId} required>
                      {salesPeople.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                    </select>
                  </Field>
                  <Field id="t-due" label="Due" required><input id="t-due" name="dueAt" type="date" min={today} required /></Field>
                  <button type="submit">Create task</button>
                </form>
              </div>
            </section>
          )}

          {manage && open && (
            <section className="card" aria-labelledby="own-h">
              <div className="card-head"><h2 id="own-h">Owner</h2></div>
              <div className="card-body">
                <form action={reassignLead} className="action-block">
                  <input type="hidden" name="leadId" value={lead.id} />
                  <Field id="o-owner" label="Reassign to" hint="The new owner is notified and the change is recorded in the timeline.">
                    <select id="o-owner" name="ownerId" defaultValue={lead.ownerId}>
                      {salesPeople.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                    </select>
                  </Field>
                  <button type="submit" className="quiet">Reassign</button>
                </form>
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-head"><h2>Details</h2></div>
            <div className="card-body">
              <dl className="props">
                <div><dt>Owner</dt><dd><Person name={lead.owner.displayName} /></dd></div>
                <div><dt>Created by</dt><dd>{lead.createdBy.displayName}</dd></div>
                <div><dt>Created</dt><dd className="num">{fmtDateTime(lead.createdAt)}</dd></div>
                <div><dt>Last activity</dt><dd className="num">{fmtDateTime(lead.lastActivityAt)}</dd></div>
                {lead.closedAt && <div><dt>Closed</dt><dd className="num">{fmtDateTime(lead.closedAt)}</dd></div>}
              </dl>
            </div>
          </section>
        </aside>
      </div>
    </Shell>
  );
}
