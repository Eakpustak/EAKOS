import { Send } from "lucide-react";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Flash } from "@/lib/task-ui";
import { Avatar, Field, PageHeader, Person, PriorityBadge, StatusBadge } from "@/lib/ui";
import {
  STATUSES, STATUS_LABEL, canAccessTask, dueStr, fmtDate, fmtDateTime, isOverdue,
} from "@/lib/tasks";
import { addComment, editTask, reassignTask, updateStatus } from "../actions";

export const dynamic = "force-dynamic";

export default async function TaskDetail({
  params, searchParams,
}: { params: { id: string }; searchParams: { error?: string; ok?: string } }) {
  const user = await requireUser();
  const task = await db.task.findUnique({
    where: { id: params.id },
    include: {
      creator: { select: { displayName: true } },
      assignee: { select: { displayName: true } },
      department: { select: { name: true } },
      comments: { orderBy: { createdAt: "asc" }, take: 200, include: { author: { select: { displayName: true } } } },
      events: { orderBy: { createdAt: "desc" }, take: 100, include: { actor: { select: { displayName: true } } } },
    },
  });
  if (!task || !canAccessTask(user, task)) redirect("/tasks");

  await db.notification.updateMany({ where: { userId: user.id, taskId: task.id, readAt: null }, data: { readAt: new Date() } });
  const people = await db.user.findMany({
    where: { status: "ACTIVE" }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true },
  });
  const names = new Map(people.map((p) => [p.id, p.displayName]));
  const nm = (id: unknown) => (typeof id === "string" ? names.get(id) ?? "a former user" : "?");

  function describe(e: NonNullable<typeof task>["events"][number]): string {
    const d = (e.detail ?? {}) as Record<string, unknown>;
    switch (e.type) {
      case "created": return `created the task for ${nm(d.assigneeId)}`;
      case "status": return `changed status from ${STATUS_LABEL[String(d.from)]} to ${STATUS_LABEL[String(d.to)]}`;
      case "reassigned": return `reassigned from ${nm(d.from)} to ${nm(d.to)}`;
      case "comment": return "added a comment";
      case "edited": return "edited the title, description or due date";
      default: return e.type;
    }
  }

  const overdue = isOverdue(task);
  return (
    <Shell>
      <PageHeader title={task.title} crumbs={[{ label: "Tasks", href: "/tasks" }, { label: "Task" }]}>
        <div className="meta-row">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          {overdue && <span className="badge pr-urgent">Overdue</span>}
        </div>
      </PageHeader>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      <div className="layout-2">
        <div className="stack">
          <section className="card" aria-labelledby="desc-h">
            <div className="card-head"><h2 id="desc-h">Description</h2></div>
            <div className="card-body">
              {task.description ? <p className="desc">{task.description}</p> : <p className="muted">No description was added.</p>}
            </div>
          </section>

          <section className="card" aria-labelledby="comments-h">
            <div className="card-head"><h2 id="comments-h">Comments <span className="muted num">({task.comments.length})</span></h2></div>
            <div className="card-body">
              {task.comments.length === 0 ? <p className="muted" style={{ margin: "0 0 1rem" }}>No comments yet.</p> : (
                <ul className="comments" style={{ marginBottom: "1.25rem" }}>
                  {task.comments.map((c) => (
                    <li key={c.id}>
                      <Avatar name={c.author.displayName} />
                      <div className="comment-body">
                        <header><b>{c.author.displayName}</b><time className="muted" dateTime={c.createdAt.toISOString()}>{fmtDateTime(c.createdAt)}</time></header>
                        <p className="desc">{c.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <form action={addComment}>
                <input type="hidden" name="taskId" value={task.id} />
                <Field id="body" label="Add a comment" required>
                  <textarea id="body" name="body" rows={3} maxLength={4000} required placeholder="Share an update or ask a question" />
                </Field>
                <div className="btn-row" style={{ marginTop: ".75rem" }}><button type="submit"><Send className="ic" aria-hidden="true" />Post comment</button></div>
              </form>
            </div>
          </section>

          <section className="card" aria-labelledby="activity-h">
            <div className="card-head"><h2 id="activity-h">Activity</h2></div>
            <div className="card-body">
              <ol className="timeline">
                {task.events.map((e) => (
                  <li key={e.id}><b>{e.actor.displayName}</b> {describe(e)}<time dateTime={e.createdAt.toISOString()}>{fmtDateTime(e.createdAt)}</time></li>
                ))}
              </ol>
            </div>
          </section>
        </div>

        <aside className="stack" aria-label="Task details">
          <section className="card">
            <div className="card-head"><h2>Details</h2></div>
            <div className="card-body">
              <dl className="props">
                <div><dt>Owner</dt><dd><Person name={task.assignee.displayName} /></dd></div>
                <div><dt>Created by</dt><dd><Person name={task.creator.displayName} /></dd></div>
                <div><dt>Due</dt><dd className={`num${overdue ? " overdue" : ""}`}>{fmtDate(task.dueAt)}{overdue ? " · overdue" : ""}</dd></div>
                <div><dt>Department</dt><dd>{task.department?.name ?? "—"}</dd></div>
                <div><dt>Created</dt><dd className="num">{fmtDateTime(task.createdAt)}</dd></div>
              </dl>
            </div>
          </section>
          {task.creatorId === user.id && (
            <section className="card">
              <div className="card-head"><h2>Edit</h2></div>
              <div className="card-body stack">
                <form action={editTask}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <Field id="edit-title" label="Title" required>
                    <input id="edit-title" name="title" defaultValue={task.title} maxLength={200} required />
                  </Field>
                  <Field id="edit-description" label="Description">
                    <textarea id="edit-description" name="description" defaultValue={task.description ?? ""} rows={4} maxLength={5000} />
                  </Field>
                  <Field id="edit-dueAt" label="Due date"><input id="edit-dueAt" name="dueAt" type="date" defaultValue={dueStr(task.dueAt)} /></Field>
                  <button type="submit" className="quiet sm">Save changes</button>
                </form>
              </div>
            </section>
          )}
          <section className="card">
            <div className="card-head"><h2>Update</h2></div>
            <div className="card-body stack">
              <form action={updateStatus}>
                <input type="hidden" name="taskId" value={task.id} />
                <Field id="status" label="Status">
                  <select id="status" name="status" defaultValue={task.status}>
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </Field>
                <button type="submit" className="quiet sm">Save status</button>
              </form>
              <form action={reassignTask}>
                <input type="hidden" name="taskId" value={task.id} />
                <Field id="assigneeId" label="Owner" hint="Reassigning notifies the new owner.">
                  <select id="assigneeId" name="assigneeId" defaultValue={task.assigneeId}>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                  </select>
                </Field>
                <button type="submit" className="quiet sm">Reassign</button>
              </form>
            </div>
          </section>
        </aside>
      </div>
    </Shell>
  );
}
