"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  SERVICE_NOTIFY, SERVICE_SUBMITTED_TITLE, assigneeEligible, canAssign, canViewService, decideService, validateService, type ServiceAction,
} from "@/lib/service-requests";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams({ [kind]: msg, ...(keep ?? {}) }).toString()}`);
}
const g = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function submitService(formData: FormData) {
  const user = await requireUser();
  const raw = { title: g(formData, "title"), description: g(formData, "description"), category: g(formData, "category"), priority: g(formData, "priority"), clientToken: g(formData, "clientToken") };
  const fail = (m: string): never => back("/service-requests/new", "error", m, raw);

  if (raw.clientToken.length < 8 || raw.clientToken.length > 80) fail("Could not submit the form. Reload and try again.");
  const dup = await db.serviceRequest.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, requesterId: true } });
  if (dup) {
    if (dup.requesterId !== user.id) fail("Could not submit the form.");
    redirect(`/service-requests/${dup.id}`);
  }
  const v = validateService(raw);
  if (!v.ok) return fail(v.error);

  // The handling department comes from the category on the server; someone other than the requester must be able to handle it.
  const dept = await db.department.findUnique({ where: { slug: v.departmentSlug }, select: { id: true } });
  if (!dept) fail("That team is not set up yet. Ask an administrator.");
  const heads = await db.departmentMembership.findMany({
    where: { type: "HEAD", departmentId: dept!.id, user: { status: "ACTIVE" }, userId: { not: user.id } }, select: { userId: true },
  });
  if (heads.length === 0) fail("Nobody can handle this yet. Ask an administrator to assign a head to that team.");

  let id: string;
  try {
    const created = await db.$transaction(async (tx) => {
      const x = await tx.serviceRequest.create({
        data: { requesterId: user.id, departmentId: dept!.id, title: v.title, description: v.description, category: v.category, priority: v.priority, clientToken: raw.clientToken },
      });
      await tx.serviceEvent.create({ data: { serviceId: x.id, actorId: user.id, action: "submit", toStatus: "OPEN" } });
      for (const h of heads) await tx.notification.create({ data: { userId: h.userId, type: "service.submitted", title: SERVICE_SUBMITTED_TITLE, serviceId: x.id } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "service.submit", resourceType: "service", resourceId: x.id, outcome: "success", metadata: { category: v.category, priority: v.priority } } });
      return x;
    });
    id = created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.serviceRequest.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, requesterId: true } });
      if (again && again.requesterId === user.id) redirect(`/service-requests/${again.id}`);
    }
    console.error("submitService failed", e);
    fail("The request could not be saved. Nothing was sent; please try again.");
  }
  revalidatePath("/service-requests");
  redirect(`/service-requests/${id!}`);
}

const SUCCESS: Record<ServiceAction, string> = {
  start: "Marked as in progress. The requester has been notified.",
  resolve: "Marked as resolved. The requester has been asked to confirm.",
  reopen: "Request reopened.",
  close: "Request closed. Thank you.",
  decline: "Request declined. The requester has been notified.",
  cancel: "Request cancelled.",
};

type Tx = Prisma.TransactionClient;
async function handlerTargets(tx: Tx, x: { departmentId: string; requesterId: string; assigneeId: string | null }): Promise<string[]> {
  if (x.assigneeId) return [x.assigneeId];
  const heads = await tx.departmentMembership.findMany({ where: { type: "HEAD", departmentId: x.departmentId, userId: { not: x.requesterId }, user: { status: "ACTIVE" } }, select: { userId: true } });
  return heads.map((h) => h.userId);
}

/** One entry point for start, resolve, reopen, close, decline and cancel. Roles come from stored data; the write is status-guarded. */
export async function actOnService(formData: FormData) {
  const user = await requireUser();
  const id = g(formData, "serviceId");
  const action = g(formData, "action");
  const path = `/service-requests/${id}`;

  const x = await db.serviceRequest.findUnique({ where: { id } });
  // Same reply for missing and forbidden so IDs cannot be probed.
  if (!x || !canViewService(user, x)) redirect("/service-requests");

  const dec = decideService(user, x, action, g(formData, "text"));
  if (!dec.ok) back(path, dec.code === "ALREADY_DONE" ? "ok" : "error", dec.message);
  const ok = dec as Extract<typeof dec, { ok: true }>;
  const act = action as ServiceAction;
  const notify = SERVICE_NOTIFY[act];

  try {
    await db.$transaction(async (tx) => {
      const now = new Date();
      const data: Prisma.ServiceRequestUncheckedUpdateManyInput =
        act === "resolve" ? { status: ok.to, resolutionNote: ok.note, resolvedAt: now }
        : act === "reopen" ? { status: ok.to, resolutionNote: null, resolvedAt: null }
        : act === "close" ? { status: ok.to, closedAt: now }
        : act === "decline" ? { status: ok.to, decisionNote: ok.note }
        : { status: ok.to };
      // Status-guarded: if someone else got there first, nothing is written.
      const res = await tx.serviceRequest.updateMany({ where: { id: x.id, status: x.status }, data });
      if (res.count !== 1) throw new Error("STALE");
      await tx.serviceEvent.create({ data: { serviceId: x.id, actorId: user.id, action: act, fromStatus: x.status, toStatus: ok.to, comment: ok.note } });
      const targets = (notify.to === "requester" ? [x.requesterId] : await handlerTargets(tx, x)).filter((uid) => uid !== user.id);
      for (const uid of targets) await tx.notification.create({ data: { userId: uid, type: `service.${act}`, title: notify.title, serviceId: x.id } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: `service.${act}`, resourceType: "service", resourceId: x.id, outcome: "success", metadata: { from: x.status, to: ok.to } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This request changed since you opened it. Review it and try again.");
    console.error("actOnService failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/service-requests");
  back(path, "ok", SUCCESS[act]);
}

/** Assign or reassign. Head of the handling department only; the person is checked against stored memberships. */
export async function assignService(formData: FormData) {
  const user = await requireUser();
  const id = g(formData, "serviceId");
  const path = `/service-requests/${id}`;
  const x = await db.serviceRequest.findUnique({ where: { id } });
  if (!x || !canViewService(user, x)) redirect("/service-requests");
  if (!canAssign(user, x)) back(path, "error", "Only a head of the handling department can assign this, while it is open or in progress.");

  const cand = await db.user.findUnique({ where: { id: g(formData, "assigneeId") }, select: { id: true, status: true, memberships: { select: { departmentId: true } } } });
  const eligible = assigneeEligible(cand ? { id: cand.id, active: cand.status === "ACTIVE", departmentIds: cand.memberships.map((m) => m.departmentId) } : null, x);
  if (!eligible) back(path, "error", "Choose an active member of the handling team (not the requester).");
  if (x.assigneeId === cand!.id) back(path, "ok", "That person is already assigned.");

  try {
    await db.$transaction(async (tx) => {
      // Guarded on both status and the assignee that was read, so two heads cannot silently overwrite each other.
      const res = await tx.serviceRequest.updateMany({ where: { id: x.id, status: x.status, assigneeId: x.assigneeId }, data: { assigneeId: cand!.id } });
      if (res.count !== 1) throw new Error("STALE");
      await tx.serviceEvent.create({ data: { serviceId: x.id, actorId: user.id, action: "assign", fromStatus: x.status, toStatus: x.status } });
      if (cand!.id !== user.id) await tx.notification.create({ data: { userId: cand!.id, type: "service.assign", title: SERVICE_NOTIFY.assign.title, serviceId: x.id } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "service.assign", resourceType: "service", resourceId: x.id, outcome: "success", metadata: { assigneeId: cand!.id } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This request changed since you opened it. Review it and try again.");
    console.error("assignService failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/service-requests");
  back(path, "ok", "Assigned.");
}
