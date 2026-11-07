import { redirect } from "next/navigation";
import { Alert, Field, PageHeader, Person } from "@/lib/ui";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { IncidentStatusBadge, SeverityBadge } from "@/lib/incident-ui";
import { MAX_TEXT, availableIncidentActions, canAssignIncident, canViewIncidents } from "@/lib/incidents";
import { TECHNOLOGY_SLUG } from "@/lib/checklists";
import { Flash } from "@/lib/task-ui";
import { fmtDateTime } from "@/lib/tasks";
import { actOnIncident, assignIncident } from "../actions";

export const dynamic = "force-dynamic";
const EVENT_LABEL: Record<string, string> = { report: "Reported", assign: "Assignment changed", start: "Investigation started", mitigate: "Mitigated", resolve: "Resolved", reopen: "Reopened", note: "Note" };

function duration(a: Date, b: Date): string {
  const mins = Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
  return mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${Math.floor(mins / 1440)} d ${Math.floor((mins % 1440) / 60)} h`;
}

export default async function IncidentDetail({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  if (!canViewIncidents(user)) redirect("/");
  const x = await db.incident.findUnique({
    where: { id: params.id },
    include: {
      reporter: { select: { displayName: true } }, assignee: { select: { displayName: true } }, asset: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { displayName: true } } } },
    },
  });
  if (!x) redirect("/incidents");
  const actions = availableIncidentActions(user, x);
  const canAssign = canAssignIncident(user, x);
  const members = canAssign ? await db.user.findMany({ where: { status: "ACTIVE", memberships: { some: { department: { slug: TECHNOLOGY_SLUG } } } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }) : [];
  const textForm = (action: string, label: string, required: boolean, button: string, danger = false) => (
    <form action={actOnIncident} className="action-block" key={action}>
      <input type="hidden" name="incidentId" value={x.id} /><input type="hidden" name="action" value={action} />
      <Field id={`t-${action}`} label={label} required={required}><textarea id={`t-${action}`} name="text" rows={3} maxLength={MAX_TEXT} required={required} /></Field>
      <button type="submit" className={danger ? "quiet danger-text" : undefined}>{button}</button>
    </form>
  );
  return (
    <Shell>
      <PageHeader title={x.title} crumbs={[{ label: "Incidents", href: "/incidents" }, { label: "Incident" }]} description={x.asset ? `Affects ${x.asset.name}` : "No asset linked"}>
        <div className="meta-row"><SeverityBadge severity={x.severity} /><IncidentStatusBadge status={x.status} /></div>
      </PageHeader>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {x.status === "OPEN" && !x.assignee && <Alert kind="info">Nobody is assigned yet. The Technology head assigns incidents.</Alert>}
      {x.status === "RESOLVED" && x.resolvedAt && <Alert kind="ok">Resolved after {duration(x.createdAt, x.resolvedAt)}: “{x.resolutionNote}”</Alert>}
      <div className="layout-2">
        <div className="stack">
          <section className="card"><div className="card-head"><h2>What is happening</h2></div><div className="card-body"><p className="desc">{x.description}</p></div></section>
          <section className="card" aria-labelledby="h-h">
            <div className="card-head"><h2 id="h-h">History</h2></div>
            <div className="card-body"><ol className="timeline">{x.events.map((ev) => (
              <li key={ev.id}><b>{EVENT_LABEL[ev.action] ?? ev.action}</b> by {ev.actor.displayName} · <span className="num">{fmtDateTime(ev.createdAt)}</span>
                {ev.comment && <div className="muted">“{ev.comment}”</div>}</li>
            ))}</ol></div>
          </section>
        </div>
        <aside className="stack" aria-label="Incident details and actions">
          <section className="card"><div className="card-head"><h2>Details</h2></div><div className="card-body"><dl className="props">
            <div><dt>Reported by</dt><dd><Person name={x.reporter.displayName} /></dd></div>
            <div><dt>Reported</dt><dd className="num">{fmtDateTime(x.createdAt)}</dd></div>
            <div><dt>Assigned to</dt><dd>{x.assignee ? <Person name={x.assignee.displayName} /> : "Unassigned"}</dd></div>
            {x.resolvedAt && <div><dt>Resolved</dt><dd className="num">{fmtDateTime(x.resolvedAt)}</dd></div>}
          </dl></div></section>
          {canAssign && (
            <section className="card"><div className="card-head"><h2>Assign</h2></div><div className="card-body">
              <form action={assignIncident} className="action-block">
                <input type="hidden" name="incidentId" value={x.id} />
                <Field id="assigneeId" label="Assign to" required>
                  <select id="assigneeId" name="assigneeId" required defaultValue={x.assigneeId ?? ""}><option value="" disabled>Choose…</option>{members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</select>
                </Field>
                <button type="submit">Assign</button>
              </form>
            </div></section>
          )}
          {actions.length > 0 && (
            <section className="card"><div className="card-head"><h2>Update</h2></div><div className="card-body">
              {actions.includes("start") && textForm("start", "Note", false, "Start investigating")}
              {actions.includes("mitigate") && textForm("mitigate", "What reduced the impact?", true, "Mark as mitigated")}
              {actions.includes("resolve") && textForm("resolve", "What fixed it? (kept with the incident)", true, "Resolve incident")}
              {actions.includes("reopen") && textForm("reopen", "Why is it reopened?", true, "Reopen incident", true)}
              {actions.includes("note") && textForm("note", "Add a note", true, "Add note")}
            </div></section>
          )}
        </aside>
      </div>
    </Shell>
  );
}
