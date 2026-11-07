import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, RotateCcw } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ConfirmSubmit } from "@/lib/confirm";
import { fmtDate, fmtDateTime, todayStr } from "@/lib/tasks";
import { Flash } from "@/lib/task-ui";
import { Alert, Field, PageHeader, Person } from "@/lib/ui";
import {
  canManageCases, canViewCase, caseDateLabel, caseProgress, caseStatusLabel, caseTypeLabel, itemOverdue, visibleItems,
} from "@/lib/checklists";
import { addItem, closeCase, markItem, reassignItem } from "../actions";

export const dynamic = "force-dynamic";

export default async function ChecklistDetail({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  const c = await db.peopleCase.findUnique({
    where: { id: params.id },
    include: {
      subject: { select: { id: true, displayName: true } },
      createdBy: { select: { displayName: true } },
      closedBy: { select: { displayName: true } },
      items: { orderBy: { position: "asc" }, include: { owner: { select: { id: true, displayName: true } }, doneBy: { select: { displayName: true } } } },
    },
  });
  // Same reply for missing and forbidden so IDs cannot be probed.
  if (!c || !canViewCase(user, c.subjectId, c.items)) redirect("/checklists");

  const hr = canManageCases(user);
  const open = c.status === "OPEN";
  const shown = visibleItems(user, c.items);
  const hidden = c.items.length - shown.length;
  const today = todayStr();
  const progress = caseProgress(c.items);
  const people = hr && open
    ? await db.user.findMany({ where: { status: "ACTIVE", id: { not: c.subjectId } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } })
    : [];

  return (
    <Shell>
      <PageHeader
        title={`${caseTypeLabel(c.type)}: ${c.subject.displayName}`}
        crumbs={[{ label: "Checklists", href: "/checklists" }, { label: c.subject.displayName }]}
        description={`${caseDateLabel(c.type)} ${fmtDate(c.effectiveDate)} · ${caseStatusLabel(c.status)} · ${progress.done} of ${progress.total} steps done`}
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {!open && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="info">
            {caseStatusLabel(c.status)}{c.closedAt ? ` on ${fmtDateTime(c.closedAt)}` : ""}{c.closedBy ? ` by ${c.closedBy.displayName}` : ""}.{c.closeNote ? ` ${c.status === "CANCELLED" ? "Reason" : "Note"}: ${c.closeNote}` : ""} Its steps can no longer be changed.
          </Alert>
        </div>
      )}
      {!hr && <p className="hint" style={{ marginBottom: "1rem" }}>You can see only the steps assigned to you{hidden > 0 ? ` (${hidden} other step${hidden === 1 ? "" : "s"} hidden)` : ""}.</p>}

      <div className="table-wrap"><div className="table-scroll">
        <table className="responsive">
          <thead><tr><th>Step</th><th>Owner</th><th>Due</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {shown.map((i) => (
              <tr key={i.id}>
                <td className="primary">{i.title}</td>
                <td data-label="Owner"><Person name={i.owner.displayName} /></td>
                <td data-label="Due" className="num">{fmtDate(i.dueAt)}{itemOverdue(i, today) && <> <span className="badge off">Overdue</span></>}</td>
                <td data-label="Status">
                  {i.status === "DONE"
                    ? <><span className="badge ok">Done</span><span className="sub-line muted">{i.doneBy?.displayName}{i.doneAt ? ` · ${fmtDateTime(i.doneAt)}` : ""}</span></>
                    : <span className="badge head">Open</span>}
                </td>
                <td data-label="">
                  {open && i.status === "OPEN" && (hr || i.ownerId === user.id) && (
                    <form action={markItem}>
                      <input type="hidden" name="itemId" value={i.id} /><input type="hidden" name="action" value="done" />
                      <button className="quiet sm" type="submit"><Check className="ic" aria-hidden="true" />Mark done</button>
                    </form>
                  )}
                  {open && i.status === "DONE" && hr && (
                    <form action={markItem}>
                      <input type="hidden" name="itemId" value={i.id} /><input type="hidden" name="action" value="reopen" />
                      <button className="quiet sm" type="submit"><RotateCcw className="ic" aria-hidden="true" />Reopen</button>
                    </form>
                  )}
                  {open && hr && (
                    <details style={{ marginTop: ".4rem" }}>
                      <summary>Reassign</summary>
                      <form action={reassignItem} style={{ marginTop: ".4rem" }}>
                        <input type="hidden" name="itemId" value={i.id} />
                        <label className="sr-only" htmlFor={`o-${i.id}`}>New owner for {i.title}</label>
                        <select id={`o-${i.id}`} name="ownerId" required defaultValue="">
                          <option value="" disabled>Choose a person…</option>
                          {people.filter((p) => p.id !== i.ownerId).map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                        </select>
                        <button className="quiet sm" type="submit">Reassign</button>
                      </form>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>

      {open && hr && (
        <>
          <section className="card form-narrow" aria-labelledby="add-h" style={{ marginTop: "1.5rem" }}>
            <div className="card-head"><h2 id="add-h">Add a step</h2></div>
            <div className="card-body">
              <form action={addItem}>
                <input type="hidden" name="caseId" value={c.id} />
                <div className="form-grid">
                  <div className="full"><Field id="title" label="Step" required><input id="title" name="title" maxLength={200} required /></Field></div>
                  <Field id="ownerId" label="Owner" required>
                    <select id="ownerId" name="ownerId" required defaultValue={user.id}>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                    </select>
                  </Field>
                  <Field id="dueAt" label="Due" hint="Optional."><input id="dueAt" name="dueAt" type="date" /></Field>
                </div>
                <div className="btn-row"><button type="submit">Add step</button></div>
              </form>
            </div>
          </section>

          <section className="card form-narrow" aria-labelledby="close-h" style={{ marginTop: "1.5rem" }}>
            <div className="card-head"><h2 id="close-h">Close this checklist</h2></div>
            <div className="card-body">
              <p className="hint" style={{ marginBottom: "1rem" }}>
                Completing needs every step done. Nothing here deactivates the person&apos;s Workspace account; an administrator does that separately.
              </p>
              <form action={closeCase} style={{ marginBottom: "1rem" }}>
                <input type="hidden" name="caseId" value={c.id} /><input type="hidden" name="action" value="complete" />
                <button type="submit">Complete checklist</button>
              </form>
              <form action={closeCase}>
                <input type="hidden" name="caseId" value={c.id} /><input type="hidden" name="action" value="cancel" />
                <Field id="note" label="Reason for cancelling" required hint="For example: the offer was withdrawn.">
                  <textarea id="note" name="note" rows={2} maxLength={1000} required />
                </Field>
                <div className="btn-row">
                  <ConfirmSubmit danger label="Cancel checklist" title="Cancel this checklist?"
                    message="Its steps will be frozen and can no longer be changed. The record is kept." confirmLabel="Cancel checklist" />
                </div>
              </form>
            </div>
          </section>
        </>
      )}
      <p className="hint" style={{ marginTop: "1.5rem" }}>
        Opened by {c.createdBy.displayName}. <Link href="/checklists">Back to checklists</Link>
      </p>
    </Shell>
  );
}
