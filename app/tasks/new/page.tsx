import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader } from "@/lib/ui";
import { PRIORITIES, PRIORITY_LABEL } from "@/lib/tasks";
import { createTask } from "../actions";

export const dynamic = "force-dynamic";

type NewTaskParams = {
  error?: string; title?: string; description?: string; assigneeId?: string;
  departmentId?: string; priority?: string; dueAt?: string; clientToken?: string;
};

export default async function NewTask({ searchParams }: { searchParams: NewTaskParams }) {
  const user = await requireUser();
  const people = await db.user.findMany({
    where: { status: "ACTIVE" }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true },
  });
  const v = searchParams;
  // Reuse the same clientToken across a failed-and-retried submission so retry-safety still applies.
  const clientToken = v.clientToken || randomUUID();
  return (
    <Shell>
      <PageHeader
        title="New task"
        crumbs={[{ label: "Tasks", href: "/tasks" }, { label: "New task" }]}
        description="Every task has one accountable owner. Assigning a task does not mean it has been accepted; the owner sees it in My work and is notified."
      />
      <Flash error={v.error} />
      <form action={createTask} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={clientToken} />
        <div className="form-grid">
          <div className="full"><Field id="title" label="Title" required>
            <input id="title" name="title" defaultValue={v.title ?? ""} maxLength={200} required placeholder="What needs to happen?" />
          </Field></div>
          <div className="full"><Field id="description" label="Description">
            <textarea id="description" name="description" defaultValue={v.description ?? ""} rows={5} maxLength={5000} placeholder="Context, links or acceptance notes (optional)" />
          </Field></div>
          <Field id="assigneeId" label="Owner" required>
            <select id="assigneeId" name="assigneeId" defaultValue={v.assigneeId || user.id} required>
              {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}{p.id === user.id ? " (me)" : ""}</option>)}
            </select>
          </Field>
          <Field id="departmentId" label="Department">
            <select id="departmentId" name="departmentId" defaultValue={v.departmentId ?? ""}>
              <option value="">None</option>
              {user.memberships.map((m) => <option key={m.departmentId} value={m.departmentId}>{m.department.name}</option>)}
            </select>
          </Field>
          <Field id="priority" label="Priority">
            <select id="priority" name="priority" defaultValue={v.priority || "NORMAL"}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </Field>
          <Field id="dueAt" label="Due date"><input id="dueAt" name="dueAt" type="date" defaultValue={v.dueAt ?? ""} /></Field>
        </div>
        <div className="btn-row">
          <button type="submit">Create task</button>
          <Link className="btn ghost" href="/tasks">Cancel</Link>
        </div>
        <p className="hint" style={{ marginTop: "1rem" }}><span className="req" aria-hidden="true">*</span> Required</p>
      </form>
    </Shell>
  );
}
