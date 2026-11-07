"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TECHNOLOGY_SLUG } from "@/lib/checklists";
import { canAssignIncident, canReportIncident, canViewIncidents, decideIncident, validateIncident } from "@/lib/incidents";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams({ [kind]: msg, ...(keep ?? {}) }).toString()}`);
}
const g = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function reportIncident(formData: FormData) {
  const user = await requireUser();
  if (!canReportIncident(user)) redirect("/");
  const raw = { title: g(formData, "title"), description: g(formData, "description"), severity: g(formData, "severity"), assetId: g(formData, "assetId"), clientToken: g(formData, "clientToken") };
  // The description is not echoed back: it may be long and may hold what the user should not have typed.
  const fail = (m: string): never => back("/incidents/new", "error", m, { title: raw.title, severity: raw.severity, assetId: raw.assetId, clientToken: raw.clientToken });
  if (raw.clientToken.length < 8 || raw.clientToken.length > 80) fail("Could not submit the form. Reload and try again.");
  const dup = await db.incident.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, reporterId: true } });
  if (dup) {
    if (dup.reporterId !== user.id) fail("Could not submit the form.");
    redirect(`/incidents/${dup.id}`);
  }
  const v = validateIncident(raw);
  if (!v.ok) return fail(v.error);
  if (v.assetId) {
    const a = await db.techAsset.findUnique({ where: { id: v.assetId }, select: { status: true } });
    if (!a || a.status !== "ACTIVE") fail("Choose an active asset, or leave it empty.");
  }
  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const x = await tx.incident.create({ data: { title: v.title, description: v.description, severity: v.severity, assetId: v.assetId, reporterId: user.id, clientToken: raw.clientToken } });
      await tx.incidentEvent.create({ data: { incidentId: x.id, actorId: user.id, action: "report", toStatus: "OPEN" } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "incident.report", resourceType: "incident", resourceId: x.id, outcome: "success", metadata: { severity: v.severity } } });
      return x.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.incident.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, reporterId: true } });
      if (again && again.reporterId === user.id) redirect(`/incidents/${again.id}`);
    }
    console.error("reportIncident failed", e);
    fail("The incident could not be saved. Nothing was recorded; please try again.");
  }
  revalidatePath("/incidents");
  redirect(`/incidents/${id!}`);
}

const SUCCESS: Record<string, string> = { start: "Investigation started.", mitigate: "Marked as mitigated.", resolve: "Incident resolved.", reopen: "Incident reopened.", note: "Note added." };

/** start, mitigate, resolve, reopen and note. Roles come from stored data; status changes are status-guarded. */
export async function actOnIncident(formData: FormData) {
  const user = await requireUser();
  const id = g(formData, "incidentId");
  const action = g(formData, "action");
  const path = `/incidents/${id}`;
  const x = await db.incident.findUnique({ where: { id }, select: { id: true, status: true, assigneeId: true } });
  // Same reply for missing and forbidden so IDs cannot be probed.
  if (!x || !canViewIncidents(user)) redirect("/incidents");
  const dec = decideIncident(user, x, action, g(formData, "text"));
  if (!dec.ok) back(path, "error", dec.message);
  const ok = dec as Extract<typeof dec, { ok: true }>;

  try {
    await db.$transaction(async (tx) => {
      if (action !== "note") {
        const data: Prisma.IncidentUncheckedUpdateManyInput = { status: ok.to as "INVESTIGATING" | "MITIGATED" | "RESOLVED" };
        if (action === "resolve") { data.resolvedAt = new Date(); data.resolutionNote = ok.text; }
        if (action === "reopen") { data.resolvedAt = null; data.resolutionNote = null; }
        const res = await tx.incident.updateMany({ where: { id: x.id, status: x.status }, data });
        if (res.count !== 1) throw new Error("STALE");
      }
      await tx.incidentEvent.create({ data: { incidentId: x.id, actorId: user.id, action, fromStatus: x.status, toStatus: ok.to, comment: ok.text } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: `incident.${action}`, resourceType: "incident", resourceId: x.id, outcome: "success" } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This incident changed since you opened it. Review it and try again.");
    console.error("actOnIncident failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/incidents");
  back(path, "ok", SUCCESS[action]);
}

/** Head only. The assignee must be an ACTIVE Technology member (looked up here), and the write is guarded on the previous assignee. */
export async function assignIncident(formData: FormData) {
  const user = await requireUser();
  const id = g(formData, "incidentId");
  const assigneeId = g(formData, "assigneeId");
  const path = `/incidents/${id}`;
  const x = await db.incident.findUnique({ where: { id }, select: { id: true, status: true, assigneeId: true } });
  if (!x || !canViewIncidents(user)) redirect("/incidents");
  if (!canAssignIncident(user, x)) back(path, "error", "Only the Technology head can assign an unresolved incident.");
  if (!assigneeId) back(path, "error", "Choose who to assign.");
  if (assigneeId === x.assigneeId) back(path, "ok", "That person is already assigned.");
  const n = await db.user.count({ where: { id: assigneeId, status: "ACTIVE", memberships: { some: { department: { slug: TECHNOLOGY_SLUG } } } } });
  if (n !== 1) back(path, "error", "Choose an active member of Technology.");
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.incident.updateMany({ where: { id: x.id, status: x.status, assigneeId: x.assigneeId }, data: { assigneeId } });
      if (res.count !== 1) throw new Error("STALE");
      await tx.incidentEvent.create({ data: { incidentId: x.id, actorId: user.id, action: "assign", fromStatus: x.status, toStatus: x.status } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "incident.assign", resourceType: "incident", resourceId: x.id, outcome: "success" } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This incident changed since you opened it. Review it and try again.");
    console.error("assignIncident failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/incidents");
  back(path, "ok", "Assigned.");
}
