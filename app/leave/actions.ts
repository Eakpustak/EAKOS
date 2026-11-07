"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayStr } from "@/lib/tasks";
import {
  LEAVE_NOTIFY, MANAGEMENT_SLUG, MAX_REASON, canViewLeave, chooseApproverDepartment, decideLeave, isLeaveType, overlaps,
  validateLeaveDates, type LeaveAction,
} from "@/lib/leave";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  const params = new URLSearchParams({ [kind]: msg, ...(keep ?? {}) });
  redirect(`${path}?${params.toString()}`);
}

const schema = z.object({
  leaveType: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().trim().max(MAX_REASON, `Reason is too long (max ${MAX_REASON})`).optional(),
  clientToken: z.string().min(8).max(80),
});

export async function submitLeave(formData: FormData) {
  const user = await requireUser();
  const g = (k: string) => String(formData.get(k) ?? "");
  const raw = { leaveType: g("leaveType"), startDate: g("startDate"), endDate: g("endDate"), reason: g("reason") || undefined, clientToken: g("clientToken") };
  const keep = { leaveType: raw.leaveType, startDate: raw.startDate, endDate: raw.endDate, reason: raw.reason ?? "", clientToken: raw.clientToken };
  const fail = (m: string): never => back("/leave/new", "error", m, keep);

  const parsed = schema.safeParse(raw);
  if (!parsed.success) fail(parsed.error.issues[0].message);
  const d = parsed.data!;

  // Retry-safe: the same form submission never creates a second request.
  const dup = await db.leaveRequest.findUnique({ where: { clientToken: d.clientToken } });
  if (dup) {
    if (dup.requesterId !== user.id) fail("Could not submit the request.");
    redirect(`/leave/${dup.id}`);
  }
  if (!isLeaveType(d.leaveType)) fail("Choose a leave type.");
  const dateError = validateLeaveDates(d.startDate, d.endDate, todayStr());
  if (dateError) fail(dateError);
  const start = new Date(`${d.startDate}T00:00:00.000Z`);
  const end = new Date(`${d.endDate}T00:00:00.000Z`);

  // No second request over days already pending or approved.
  const clash = await db.leaveRequest.findMany({
    where: { requesterId: user.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } },
    select: { startDate: true, endDate: true },
  });
  if (clash.some((c) => overlaps(c, { startDate: start, endDate: end }))) fail("You already have a pending or approved request that overlaps these dates.");

  // Approver department: decided now, from stored memberships, never from the form.
  const deptIds = user.memberships.map((m) => m.departmentId);
  const mgmt = await db.department.findUnique({ where: { slug: MANAGEMENT_SLUG }, select: { id: true } });
  const headRows = await db.departmentMembership.findMany({
    where: { type: "HEAD", departmentId: { in: [...deptIds, ...(mgmt ? [mgmt.id] : [])] }, user: { status: "ACTIVE" } },
    select: { departmentId: true, userId: true },
  });
  const headsByDept: Record<string, string[]> = {};
  for (const h of headRows) (headsByDept[h.departmentId] ??= []).push(h.userId);
  const approverDepartmentId = chooseApproverDepartment(user.id, deptIds, headsByDept, mgmt?.id ?? null);
  if (!approverDepartmentId) fail("There is nobody who can approve this yet. Ask an administrator to assign a department head.");

  const approvers = (headsByDept[approverDepartmentId!] ?? []).filter((id) => id !== user.id);
  let leaveId: string;
  try {
    const l = await db.$transaction(async (tx) => {
      const created = await tx.leaveRequest.create({
        data: { requesterId: user.id, leaveType: d.leaveType, startDate: start, endDate: end, reason: d.reason || null, approverDepartmentId: approverDepartmentId!, clientToken: d.clientToken },
      });
      for (const id of approvers) {
        await tx.notification.create({ data: { userId: id, type: "leave.submitted", title: "A leave request needs your decision", leaveId: created.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "leave.submit", resourceType: "leave", resourceId: created.id, outcome: "success" } });
      return created;
    });
    leaveId = l.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.leaveRequest.findUnique({ where: { clientToken: d.clientToken } });
      if (again && again.requesterId === user.id) redirect(`/leave/${again.id}`);
    }
    console.error("submitLeave failed", e);
    fail("The request could not be saved. Nothing was sent; please try again.");
  }
  revalidatePath("/leave");
  redirect(`/leave/${leaveId!}`);
}

const SUCCESS: Record<LeaveAction, string> = {
  approve: "Leave approved. The requester has been notified.",
  reject: "Leave rejected. The requester has been notified.",
  cancel: "Leave request cancelled.",
};

/** One entry point for approve, reject and cancel. The role comes from stored data; the write is status-guarded. */
export async function actOnLeave(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("leaveId") ?? "");
  const action = String(formData.get("action") ?? "");
  const path = `/leave/${id}`;

  const l = await db.leaveRequest.findUnique({ where: { id } });
  // Same reply for missing and forbidden so IDs cannot be probed.
  if (!l || !canViewLeave(user, l)) redirect("/leave");

  const dec = decideLeave(user, l, action, String(formData.get("text") ?? ""), todayStr());
  if (!dec.ok) back(path, dec.code === "ALREADY_DONE" ? "ok" : "error", dec.message);
  const ok = dec as Extract<typeof dec, { ok: true }>;
  const act = action as LeaveAction;
  const notify = LEAVE_NOTIFY[act];

  try {
    await db.$transaction(async (tx) => {
      const decided = act === "approve" || act === "reject";
      const res = await tx.leaveRequest.updateMany({
        where: { id: l.id, status: l.status },
        data: { status: ok.to, ...(decided ? { decidedById: user.id, decidedAt: new Date(), decisionNote: ok.note } : {}) },
      });
      if (res.count !== 1) throw new Error("STALE");
      const targets = notify.to === "requester"
        ? [l.requesterId]
        : (await tx.departmentMembership.findMany({ where: { type: "HEAD", departmentId: l.approverDepartmentId, userId: { not: l.requesterId }, user: { status: "ACTIVE" } }, select: { userId: true } })).map((x) => x.userId);
      for (const uid of targets) {
        await tx.notification.create({ data: { userId: uid, type: `leave.${act}`, title: notify.title, leaveId: l.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: `leave.${act}`, resourceType: "leave", resourceId: l.id, outcome: "success", metadata: { from: l.status, to: ok.to } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This request changed since you opened it. Review it and try again.");
    console.error("actOnLeave failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/leave");
  back(path, "ok", SUCCESS[act]);
}
