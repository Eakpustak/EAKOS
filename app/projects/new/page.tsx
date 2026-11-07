import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader } from "@/lib/ui";
import { MAX_DESCRIPTION, canCreateFromHandover } from "@/lib/projects";
import { createProject } from "../actions";

export const dynamic = "force-dynamic";

type P = { error?: string; name?: string; description?: string; departmentId?: string; handoverId?: string; ownerId?: string; dueAt?: string; clientToken?: string };

export default async function NewProject({ searchParams }: { searchParams: P }) {
  const user = await requireUser();
  const v = searchParams;
  if (user.memberships.length === 0) redirect("/projects");

  let handover = null as Awaited<ReturnType<typeof db.handover.findUnique>>;
  if (v.handoverId) {
    handover = await db.handover.findUnique({ where: { id: v.handoverId } });
    if (!handover || handover.receiverId !== user.id) redirect("/projects");
    const existing = await db.project.findUnique({ where: { handoverId: handover.id }, select: { id: true } });
    const ok = canCreateFromHandover(user, handover, !!existing);
    if (!ok.ok) redirect(existing ? `/projects/${existing.id}` : `/handovers/${handover.id}?error=${encodeURIComponent(ok.message)}`);
  }
  const departmentId = handover?.toDepartmentId
    ?? (user.memberships.some((m) => m.departmentId === v.departmentId) ? v.departmentId! : (user.memberships.find((m) => m.isPrimary) ?? user.memberships[0]).departmentId);

  const people = await db.user.findMany({
    where: { status: "ACTIVE", memberships: { some: { departmentId } } },
    orderBy: { displayName: "asc" }, select: { id: true, displayName: true },
  });
  const clientToken = v.clientToken || randomUUID();

  return (
    <Shell>
      <PageHeader
        title="New project"
        crumbs={[{ label: "Projects", href: "/projects" }, { label: "New project" }]}
        description={handover ? "Start delivery for the handover you accepted. The sender is notified." : "Start a project for your department."}
      />
      <Flash error={v.error} />
      <form action={createProject} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={clientToken} />
        {handover && <input type="hidden" name="handoverId" value={handover.id} />}
        <div className="form-grid">
          {!handover && (
            <div className="full">
              <input type="hidden" name="departmentId" value={departmentId} />
              <p className="hint">
                Department: <b>{user.memberships.find((m) => m.departmentId === departmentId)?.department.name}</b>
                {user.memberships.length > 1 && (
                  <> · switch to {user.memberships.filter((m) => m.departmentId !== departmentId).map((m, i) => (
                    <span key={m.departmentId}>{i > 0 && ", "}<Link href={`/projects/new?departmentId=${m.departmentId}`}>{m.department.name}</Link></span>
                  ))}</>
                )}
              </p>
            </div>
          )}
          <div className="full"><Field id="name" label="Project name" required>
            <input id="name" name="name" maxLength={200} required defaultValue={v.name ?? handover?.title ?? ""} />
          </Field></div>
          <Field id="ownerId" label="Delivery owner" required hint="The one accountable person.">
            <select id="ownerId" name="ownerId" required defaultValue={v.ownerId && people.some((p) => p.id === v.ownerId) ? v.ownerId : user.id}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
            </select>
          </Field>
          <Field id="dueAt" label="Target date"><input id="dueAt" name="dueAt" type="date" defaultValue={v.dueAt ?? (handover?.dueAt ? handover.dueAt.toISOString().slice(0, 10) : "")} /></Field>
          <div className="full"><Field id="description" label="Description">
            <textarea id="description" name="description" rows={5} maxLength={MAX_DESCRIPTION} defaultValue={v.description ?? handover?.deliverable ?? ""} />
          </Field></div>
        </div>
        <div className="btn-row">
          <button type="submit">Create project</button>
          <Link className="btn ghost" href={handover ? `/handovers/${handover.id}` : "/projects"}>Cancel</Link>
        </div>
      </form>
    </Shell>
  );
}
