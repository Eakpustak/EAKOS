import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Flash } from "@/lib/task-ui";
import {
  STATUSES, STATUS_LABEL, PRIORITY_LABEL, canAccessTask, fmtDate, fmtDateTime, isOverdue,
} from "@/lib/tasks";
import { addComment, reassignTask, updateStatus } from "../actions";

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

  function describe(e: (typeof task.events)[number]): string {
    const d = (e.detail ?? {}) as Record<string, unknown>;
    switch (e.type) {
      case "created": return `created the task for ${nm(d.assigneeId)}`;
      case "status": return `changed status from ${STATUS_LABEL[String(d.from)]} to ${STATUS_LABEL[String(d.to)]}`;
      case "reassigned": return `reassigned from ${nm(d.from)} to ${nm(d.to)}`;
      case "comment": return "added a comment";
      default: return e.type;
    }
  }

  return (
    <Shell>
      <p><Link href="/tasks">← All tasks</Link></p>
      <h1>{task.title}</h1>
      <Flash error={searchParams.error} ok={searchParams.ok} />
      <div className="panel">
        <dl className="facts">
          <dt>Owner</dt><dd>{task.assignee.displayName}</dd>
          <dt>Created by</dt><dd>{task.creator.displayName}</dd>
          <dt>Status</dt><dd>{STATUS_LABEL[task.status]}</dd>
          <dt>Priority</dt><dd>{PRIORITY_LABEL[task.priority]}</dd>
          <dt>Due</dt><dd className={isOverdue(task) ? "overdue" : ""}>{fmtDate(task.dueAt)}{isOverdue(task) ? " · overdue" : ""}</dd>
          <dt>Department</dt><dd>{task.department?.name ?? "—"}</dd>
          <dt>Created</dt><dd>{fmtDateTime(task.createdAt)}</dd>
        </dl>
        {task.description && <p className="desc">{task.description}</p>}
      </div>

      <h2>Update</h2>
      <div className="grid">
        <form action={updateStatus} className="panel">
          <input type="hidden" name="taskId" value={task.id} />
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={task.status}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <p><button type="submit">Save status</button></p>
        </form>
        <form action={reassignTask} className="panel">
          <input type="hidden" name="taskId" value={task.id} />
          <label htmlFor="assigneeId">Owner</label>
          <select id="assigneeId" name="assigneeId" defaultValue={task.assigneeId}>
            {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </select>
          <p><button type="submit">Reassign</button></p>
        </form>
      </div>

      <h2>Comments ({task.comments.length})</h2>
      {task.comments.length === 0 ? <p className="empty">No comments yet.</p> : (
        <ul className="thread">
          {task.comments.map((c) => (
            <li key={c.id}><strong>{c.author.displayName}</strong> <span className="muted">{fmtDateTime(c.createdAt)}</span>
              <div className="desc">{c.body}</div></li>
          ))}
        </ul>
      )}
      <form action={addComment} className="panel">
        <input type="hidden" name="taskId" value={task.id} />
        <label htmlFor="body">Add a comment</label>
        <textarea id="body" name="body" rows={3} maxLength={4000} required />
        <p><button type="submit">Post comment</button></p>
      </form>

      <h2>Activity</h2>
      <ul className="thread">
        {task.events.map((e) => (
          <li key={e.id}><strong>{e.actor.displayName}</strong> {describe(e)} <span className="muted">{fmtDateTime(e.createdAt)}</span></li>
        ))}
      </ul>
    </Shell>
  );
}
