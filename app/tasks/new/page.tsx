import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Flash } from "@/lib/task-ui";
import { PRIORITIES, PRIORITY_LABEL } from "@/lib/tasks";
import { createTask } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTask({ searchParams }: { searchParams: { error?: string } }) {
  const user = await requireUser();
  const people = await db.user.findMany({
    where: { status: "ACTIVE" }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true },
  });
  return (
    <Shell>
      <h1>New task</h1>
      <p className="sub">Every task has one accountable owner. Assigning a task does not mean it has been accepted; the owner sees it in My work and is notified.</p>
      <Flash error={searchParams.error} />
      <form action={createTask} className="panel">
        <input type="hidden" name="clientToken" value={randomUUID()} />
        <label htmlFor="title">Title</label>
        <input id="title" name="title" maxLength={200} required />
        <label htmlFor="description">Description (optional)</label>
        <textarea id="description" name="description" rows={5} maxLength={5000} />
        <label htmlFor="assigneeId">Owner</label>
        <select id="assigneeId" name="assigneeId" defaultValue={user.id} required>
          {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}{p.id === user.id ? " (me)" : ""}</option>)}
        </select>
        <label htmlFor="departmentId">Department (optional)</label>
        <select id="departmentId" name="departmentId" defaultValue="">
          <option value="">None</option>
          {user.memberships.map((m) => <option key={m.departmentId} value={m.departmentId}>{m.department.name}</option>)}
        </select>
        <label htmlFor="priority">Priority</label>
        <select id="priority" name="priority" defaultValue="NORMAL">
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </select>
        <label htmlFor="dueAt">Due date (optional)</label>
        <input id="dueAt" name="dueAt" type="date" />
        <p><button type="submit">Create task</button> <Link href="/tasks">Cancel</Link></p>
      </form>
    </Shell>
  );
}
