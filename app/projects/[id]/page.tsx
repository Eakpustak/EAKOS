import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Progress, ProjectStatusBadge } from "@/lib/project-ui";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader, Person } from "@/lib/ui";
import { STATUS_LABEL, dueStr, fmtDate, fmtDateTime, todayStr, visibleTaskWhere } from "@/lib/tasks";
import { canAccessHandover } from "@/lib/handovers";
import {
  canAccessProject, canManageProject, isProjectOpen, milestoneOverdue, milestoneProgress, nextProjectStatuses, projectStatusLabel,
} from "@/lib/projects";
import { addMember, addMilestone, changeProjectStatus, createProjectTask, removeMember, setMilestone } from "../actions";

export const dynamic = "force-dynamic";

export default async function ProjectDetail({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  const p = await db.project.findUnique({
    where: { id: params.id },
    include: {
      owner: { select: { displayName: true } },
      createdBy: { select: { displayName: true } },
      department: { select: { name: true } },
      members: { include: { user: { select: { id: true, displayName: true, status: true } } }, orderBy: { createdAt: "asc" } },
      milestones: { orderBy: [{ status: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] },
      handover: { select: { id: true, title: true, senderId: true, receiverId: true, fromDepartmentId: true, toDepartmentId: true } },
    },
  });
  // Same response for "missing" and "forbidden" so IDs cannot be probed.
  if (!p || !canAccessProject(user, p)) redirect("/projects");
  await db.notification.updateMany({ where: { userId: user.id, projectId: p.id, readAt: null }, data: { readAt: new Date() } });

  const manage = canManageProject(user, p);
  const open = isProjectOpen(p.status);
  const today = todayStr();
  const prog = milestoneProgress(p.milestones);
  const nextStatuses = manage ? nextProjectStatuses(p.status) : [];

  const [tasks, deptPeople] = await Promise.all([
    // Only tasks this user may already see (task access rules still apply).
    db.task.findMany({
      where: { AND: [{ projectId: p.id }, visibleTaskWhere(user)] },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }], take: 50,
      select: { id: true, title: true, status: true, dueAt: true, assignee: { select: { displayName: true } } },
    }),
    manage && open
      ? db.user.findMany({ where: { status: "ACTIVE", memberships: { some: { departmentId: p.departmentId } } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } })
      : Promise.resolve([]),
  ]);
  const memberIds = new Set(p.members.map((m) => m.userId));
  const addable = deptPeople.filter((x) => x.id !== p.ownerId && !memberIds.has(x.id));
  const assignable = deptPeople.filter((x) => x.id === p.ownerId || memberIds.has(x.id));
  const handoverVisible = !!p.handover && canAccessHandover(user, p.handover);

  return (
    <Shell>
      <PageHeader title={p.name} crumbs={[{ label: "Projects", href: "/projects" }, { label: p.name }]} description={`${p.department.name} · owner ${p.owner.displayName}`}>
        <div className="meta-row"><ProjectStatusBadge status={p.status} /><Progress {...prog} /></div>
      </PageHeader>
      <Flash error={searchParams.error} ok={searchParams.ok} />

      <div className="layout-2">
        <div className="stack">
          {p.description && (
            <section className="card" aria-labelledby="desc-h">
              <div className="card-head"><h2 id="desc-h">About</h2></div>
              <div className="card-body"><p className="desc">{p.description}</p></div>
            </section>
          )}

          <section className="card" aria-labelledby="ms-h">
            <div className="card-head"><h2 id="ms-h">Milestones</h2></div>
            <div className="card-body">
              {p.milestones.length === 0 ? <p className="muted">No milestones yet.</p> : (
                <ul className="list" style={{ margin: "-.5rem -1rem 0" }}>
                  {p.milestones.map((m) => (
                    <li key={m.id}>
                      <div className="grow">
                        <span className={m.status === "DONE" ? "ms-done" : undefined}>{m.title}</span>
                        <span className="sub-line muted">
                          {m.status === "DONE" ? `Done ${fmtDate(m.doneAt)}` : `Due ${fmtDate(m.dueAt)}`}{milestoneOverdue(m, today) ? " · overdue" : ""}
                        </span>
                      </div>
                      {manage && open && (
                        <form action={setMilestone} className="btn-row">
                          <input type="hidden" name="projectId" value={p.id} />
                          <input type="hidden" name="milestoneId" value={m.id} />
                          <button type="submit" name="to" value={m.status === "DONE" ? "OPEN" : "DONE"} className="quiet">{m.status === "DONE" ? "Reopen" : "Mark done"}</button>
                          <button type="submit" name="to" value="REMOVE" className="quiet danger-text" aria-label={`Remove milestone ${m.title}`}>Remove</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {manage && open && (
                <form action={addMilestone} className="action-block" style={{ marginTop: "1rem" }}>
                  <input type="hidden" name="projectId" value={p.id} />
                  <Field id="m-title" label="Add a milestone" required><input id="m-title" name="title" maxLength={200} required /></Field>
                  <Field id="m-due" label="Due"><input id="m-due" name="dueAt" type="date" min={today} /></Field>
                  <button type="submit">Add milestone</button>
                </form>
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="tk-h">
            <div className="card-head"><h2 id="tk-h">Tasks</h2></div>
            <div className="card-body">
              {tasks.length === 0 ? <p className="muted">No tasks you can see are linked to this project.</p> : (
                <ul className="list" style={{ margin: "-.5rem -1rem 0" }}>
                  {tasks.map((t) => (
                    <li key={t.id}>
                      <div className="grow">
                        <Link href={`/tasks/${t.id}`}>{t.title}</Link>
                        <span className="sub-line muted">
                          {t.assignee.displayName} · {STATUS_LABEL[t.status] ?? t.status} · due {fmtDate(t.dueAt)}
                          {t.dueAt && dueStr(t.dueAt) < today && ["TODO", "IN_PROGRESS", "BLOCKED"].includes(t.status) ? " · overdue" : ""}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {manage && open && (
                <form action={createProjectTask} className="action-block" style={{ marginTop: "1rem" }}>
                  <input type="hidden" name="projectId" value={p.id} />
                  <input type="hidden" name="clientToken" value={randomUUID()} />
                  <Field id="t-title" label="New task" required><input id="t-title" name="title" maxLength={200} required /></Field>
                  <Field id="t-assignee" label="Who will do it" required>
                    <select id="t-assignee" name="assigneeId" defaultValue={p.ownerId} required>
                      {assignable.map((x) => <option key={x.id} value={x.id}>{x.displayName}</option>)}
                    </select>
                  </Field>
                  <Field id="t-due" label="Due"><input id="t-due" name="dueAt" type="date" min={today} /></Field>
                  <button type="submit">Create task</button>
                </form>
              )}
            </div>
          </section>
        </div>

        <aside className="stack" aria-label="Project details and actions">
          {nextStatuses.length > 0 && (
            <section className="card" aria-labelledby="st-h">
              <div className="card-head"><h2 id="st-h">Status</h2></div>
              <div className="card-body">
                <form action={changeProjectStatus} className="action-block">
                  <input type="hidden" name="projectId" value={p.id} />
                  <Field id="p-status" label="Change to" hint="Completing needs every milestone done. Completed and cancelled projects are final.">
                    <select id="p-status" name="status" defaultValue={nextStatuses[0]}>
                      {nextStatuses.map((s) => <option key={s} value={s}>{projectStatusLabel(s)}</option>)}
                    </select>
                  </Field>
                  <button type="submit" className="quiet">Update status</button>
                </form>
              </div>
            </section>
          )}

          <section className="card" aria-labelledby="mem-h">
            <div className="card-head"><h2 id="mem-h">People</h2></div>
            <div className="card-body">
              <ul className="list" style={{ margin: "-.5rem -1rem 0" }}>
                <li><div className="grow"><Person name={p.owner.displayName} sub="Delivery owner" /></div></li>
                {p.members.map((m) => (
                  <li key={m.id}>
                    <div className="grow"><Person name={m.user.displayName} sub={m.user.status === "ACTIVE" ? "Member" : "Member (deactivated)"} /></div>
                    {manage && open && (
                      <form action={removeMember}>
                        <input type="hidden" name="projectId" value={p.id} />
                        <input type="hidden" name="userId" value={m.userId} />
                        <button type="submit" className="quiet danger-text" aria-label={`Remove ${m.user.displayName}`}>Remove</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              {manage && open && addable.length > 0 && (
                <form action={addMember} className="action-block" style={{ marginTop: "1rem" }}>
                  <input type="hidden" name="projectId" value={p.id} />
                  <Field id="a-user" label="Add a member" hint="Members of the department only. They are notified.">
                    <select id="a-user" name="userId" required defaultValue="">
                      <option value="" disabled>Choose a person…</option>
                      {addable.map((x) => <option key={x.id} value={x.id}>{x.displayName}</option>)}
                    </select>
                  </Field>
                  <button type="submit" className="quiet">Add</button>
                </form>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Details</h2></div>
            <div className="card-body">
              <dl className="props">
                <div><dt>Department</dt><dd>{p.department.name}</dd></div>
                <div><dt>Target date</dt><dd className="num">{fmtDate(p.dueAt)}</dd></div>
                <div><dt>Created by</dt><dd>{p.createdBy.displayName}</dd></div>
                <div><dt>Created</dt><dd className="num">{fmtDateTime(p.createdAt)}</dd></div>
                {p.completedAt && <div><dt>Completed</dt><dd className="num">{fmtDateTime(p.completedAt)}</dd></div>}
                {p.handover && (
                  <div><dt>Source handover</dt><dd>
                    {handoverVisible ? <Link href={`/handovers/${p.handover.id}`}>{p.handover.title}</Link> : <span className="muted">A handover you can’t open</span>}
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
