import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Flash } from "@/lib/task-ui";
import { SALES_SLUG, buildLeadHandoverContext, canAccessLead, canHandOverLead } from "@/lib/leads";
import { EmptyState, Field, PageHeader } from "@/lib/ui";
import { Handshake } from "lucide-react";
import { OPEN_STATUSES, canAccessTask, visibleTaskWhere } from "@/lib/tasks";
import { createHandover } from "../actions";

export const dynamic = "force-dynamic";

type P = {
  error?: string; title?: string; context?: string; deliverable?: string; fromDepartmentId?: string;
  receiver?: string; dueAt?: string; linkedTaskId?: string; clientToken?: string; taskId?: string; leadId?: string;
};

export default async function NewHandover({ searchParams }: { searchParams: P }) {
  const user = await requireUser();
  const v = searchParams;

  if (user.memberships.length === 0) {
    return (
      <Shell>
        <PageHeader title="New handover" crumbs={[{ label: "Handovers", href: "/handovers" }, { label: "New handover" }]} />
        <div className="table-wrap">
          <EmptyState icon={Handshake} title="You are not in a department yet">
            A handover is sent on behalf of a department. Ask an administrator to add you to one.
          </EmptyState>
        </div>
      </Shell>
    );
  }

  // Delivery handover from a lead: only someone who can hand that lead over gets the form.
  let lead: Awaited<ReturnType<typeof db.lead.findUnique>> = null;
  if (v.leadId) {
    lead = await db.lead.findUnique({ where: { id: v.leadId } });
    if (!lead || !canAccessLead(user, lead)) redirect("/leads");
    if (!canHandOverLead(user, lead)) {
      redirect(`/leads/${lead.id}?error=${encodeURIComponent("Only the lead's owner or the Sales head can hand it over, and only once it is qualified, at proposal or won.")}`);
    }
  }
  const salesMembership = lead ? user.memberships.find((m) => m.department.slug === SALES_SLUG) : undefined;

  const [departments, tasks, preset] = await Promise.all([
    db.department.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true,
        memberships: {
          where: { user: { status: "ACTIVE" } },
          orderBy: [{ type: "asc" }, { user: { displayName: "asc" } }],
          select: { type: true, user: { select: { id: true, displayName: true } } },
        },
      },
    }),
    db.task.findMany({
      where: { AND: [visibleTaskWhere(user), { status: { in: [...OPEN_STATUSES] } }, { OR: [{ creatorId: user.id }, { assigneeId: user.id }] }] },
      orderBy: { createdAt: "desc" }, take: 50, select: { id: true, title: true },
    }),
    // "Hand over this task": prefill from a task the user can actually access.
    v.taskId && !v.linkedTaskId ? db.task.findUnique({ where: { id: v.taskId } }) : Promise.resolve(null),
  ]);
  const presetTask = preset && canAccessTask(user, preset) ? preset : null;
  const taskOptions = presetTask && !tasks.some((t) => t.id === presetTask.id) ? [{ id: presetTask.id, title: presetTask.title }, ...tasks] : tasks;
  const linkedTaskId = v.linkedTaskId ?? presetTask?.id ?? "";
  const defaultFrom = salesMembership?.departmentId
    || v.fromDepartmentId
    || (presetTask?.departmentId && user.memberships.some((m) => m.departmentId === presetTask.departmentId) ? presetTask.departmentId : "")
    || (user.memberships.find((m) => m.isPrimary) ?? user.memberships[0]).departmentId;
  const clientToken = v.clientToken || randomUUID();
  const fromOptions = salesMembership ? [salesMembership] : user.memberships;
  const receiverDepartments = departments.filter((d) => d.id !== salesMembership?.departmentId);

  return (
    <Shell>
      <PageHeader
        title="New handover"
        crumbs={[{ label: "Handovers", href: "/handovers" }, { label: "New handover" }]}
        description="Hand work to a named person in another department. Nothing is accepted until they respond, and they can ask you to clarify or decline with a reason."
      />
      <Flash error={v.error} />
      <form action={createHandover} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={clientToken} />
        {lead && <input type="hidden" name="leadId" value={lead.id} />}
        {lead && (
          <p className="hint" style={{ marginBottom: "1rem" }}>
            Delivery handover for lead <Link href={`/leads/${lead.id}`}>{lead.organizationName}</Link>. The receiver may not be able to open the lead,
            so the context below is copied into the handover. Edit it before sending.
          </p>
        )}
        <div className="form-grid">
          <div className="full"><Field id="title" label="Title" required>
            <input id="title" name="title" defaultValue={v.title ?? (lead ? `Deliver: ${lead.organizationName}` : presetTask?.title) ?? ""} maxLength={200} required placeholder="e.g. Build website for Acme Traders" />
          </Field></div>
          <Field id="fromDepartmentId" label="From department" required>
            <select id="fromDepartmentId" name="fromDepartmentId" defaultValue={defaultFrom} required>
              {fromOptions.map((m) => <option key={m.departmentId} value={m.departmentId}>{m.department.name}</option>)}
            </select>
          </Field>
          <Field id="receiver" label="Receiver" required hint="The department and the one person who must acknowledge it.">
            <select id="receiver" name="receiver" defaultValue={v.receiver ?? ""} required>
              <option value="" disabled>Choose a person…</option>
              {receiverDepartments.filter((d) => d.memberships.some((m) => m.user.id !== user.id)).map((d) => (
                <optgroup key={d.id} label={d.name}>
                  {d.memberships.filter((m) => m.user.id !== user.id).map((m) => (
                    <option key={m.user.id} value={`${d.id}|${m.user.id}`}>{m.user.displayName}{m.type === "HEAD" ? " (head)" : ""}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <div className="full"><Field id="context" label="Context" required hint="Everything the receiver needs to act without asking you: background, customer, constraints, links.">
            <textarea id="context" name="context" defaultValue={v.context ?? (lead ? buildLeadHandoverContext(lead) : "")} rows={lead ? 10 : 6} maxLength={5000} required />
          </Field></div>
          <div className="full"><Field id="deliverable" label="Expected deliverable" required>
            <textarea id="deliverable" name="deliverable" defaultValue={v.deliverable ?? ""} rows={3} maxLength={2000} required placeholder="What does done look like?" />
          </Field></div>
          <Field id="dueAt" label="Due date"><input id="dueAt" name="dueAt" type="date" defaultValue={v.dueAt ?? ""} /></Field>
          <Field id="linkedTaskId" label="Linked task" hint="Optional. Keeps the source work attached.">
            <select id="linkedTaskId" name="linkedTaskId" defaultValue={linkedTaskId}>
              <option value="">None</option>
              {taskOptions.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </Field>
        </div>
        <div className="btn-row">
          <button type="submit">Send handover</button>
          <Link className="btn ghost" href="/handovers">Cancel</Link>
        </div>
        <p className="hint" style={{ marginTop: "1rem" }}><span className="req" aria-hidden="true">*</span> Required</p>
      </form>
    </Shell>
  );
}
