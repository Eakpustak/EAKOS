import { redirect } from "next/navigation";
import { Alert, Field, PageHeader, Person } from "@/lib/ui";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { safeHttpUrl } from "@/lib/hub";
import { ReleaseStatusBadge } from "@/lib/release-ui";
import { MAX_TEXT, availableReleaseActions, canViewReleases } from "@/lib/releases";
import { Flash } from "@/lib/task-ui";
import { fmtDateTime } from "@/lib/tasks";
import { actOnRelease } from "../actions";

export const dynamic = "force-dynamic";
const EVENT_LABEL: Record<string, string> = { plan: "Planned", deploy: "Deployed", fail: "Failed", cancel: "Cancelled", rollback: "Rolled back", note: "Note" };

export default async function ReleaseDetail({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  if (!canViewReleases(user)) redirect("/");
  const x = await db.release.findUnique({
    where: { id: params.id },
    include: {
      creator: { select: { displayName: true } }, deployer: { select: { displayName: true } }, asset: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { displayName: true } } } },
    },
  });
  if (!x) redirect("/releases");
  const actions = availableReleaseActions(user, x);
  // Re-validated at render, opened with rel=noopener noreferrer nofollow.
  const link = x.changeUrl ? safeHttpUrl(x.changeUrl) : null;
  const textForm = (action: string, label: string, required: boolean, button: string, danger = false) => (
    <form action={actOnRelease} className="action-block" key={action}>
      <input type="hidden" name="releaseId" value={x.id} /><input type="hidden" name="action" value={action} />
      <Field id={`t-${action}`} label={label} required={required}><textarea id={`t-${action}`} name="text" rows={3} maxLength={MAX_TEXT} required={required} /></Field>
      <button type="submit" className={danger ? "quiet danger-text" : undefined}>{button}</button>
    </form>
  );
  return (
    <Shell>
      <PageHeader title={x.version} crumbs={[{ label: "Releases", href: "/releases" }, { label: "Release" }]} description={`${x.asset.name} · ${x.environment}`}>
        <div className="meta-row"><ReleaseStatusBadge status={x.status} /></div>
      </PageHeader>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {x.status === "PLANNED" && <Alert kind="info">Planned only. Nothing has been recorded as deployed yet.</Alert>}
      {x.status !== "PLANNED" && x.status !== "DEPLOYED" && x.outcomeNote && <Alert kind={x.status === "CANCELLED" ? "info" : "err"}>{releaseStatusLabelText(x.status)}: “{x.outcomeNote}”</Alert>}
      <div className="layout-2">
        <div className="stack">
          <section className="card"><div className="card-head"><h2>What changes</h2></div><div className="card-body"><p className="desc">{x.summary}</p></div></section>
          <section className="card" aria-labelledby="h-h">
            <div className="card-head"><h2 id="h-h">History</h2></div>
            <div className="card-body"><ol className="timeline">{x.events.map((ev) => (
              <li key={ev.id}><b>{EVENT_LABEL[ev.action] ?? ev.action}</b> by {ev.actor.displayName} · <span className="num">{fmtDateTime(ev.createdAt)}</span>
                {ev.comment && <div className="muted">“{ev.comment}”</div>}</li>
            ))}</ol></div>
          </section>
        </div>
        <aside className="stack" aria-label="Release details and actions">
          <section className="card"><div className="card-head"><h2>Details</h2></div><div className="card-body"><dl className="props">
            <div><dt>Asset</dt><dd>{x.asset.name}</dd></div>
            <div><dt>Environment</dt><dd>{x.environment}</dd></div>
            <div><dt>Recorded by</dt><dd><Person name={x.creator.displayName} /></dd></div>
            <div><dt>Recorded</dt><dd className="num">{fmtDateTime(x.createdAt)}</dd></div>
            {x.deployer && x.deployedAt && <div><dt>Deployed by</dt><dd><Person name={x.deployer.displayName} /> · <span className="num">{fmtDateTime(x.deployedAt)}</span></dd></div>}
            {x.commitRef && <div><dt>Commit</dt><dd className="num">{x.commitRef}</dd></div>}
            {link && <div><dt>Change</dt><dd><a href={link} target="_blank" rel="noopener noreferrer nofollow">Open link</a></dd></div>}
          </dl></div></section>
          {actions.length > 0 && (
            <section className="card"><div className="card-head"><h2>Update</h2></div><div className="card-body">
              {actions.includes("deploy") && textForm("deploy", "Note", false, "Record as deployed")}
              {actions.includes("fail") && textForm("fail", "What went wrong?", true, "Record as failed", true)}
              {actions.includes("cancel") && textForm("cancel", "Why is it cancelled?", true, "Cancel release", true)}
              {actions.includes("rollback") && textForm("rollback", "Why was it rolled back?", true, "Record as rolled back", true)}
              {actions.includes("note") && textForm("note", "Add a note", true, "Add note")}
            </div></section>
          )}
        </aside>
      </div>
    </Shell>
  );
}
function releaseStatusLabelText(s: string) { return s === "ROLLED_BACK" ? "Rolled back" : s === "FAILED" ? "Failed" : "Cancelled"; }
