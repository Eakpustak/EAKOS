"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessTask, parseDueDate, todayStr } from "@/lib/tasks";
import { canAccessHandover, decide, MAX_TEXT, parseReceiverChoice, type HandoverAction } from "@/lib/handovers";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  const params = new URLSearchParams({ [kind]: msg, ...(keep ?? {}) });
  redirect(`${path}?${params.toString()}`);
}

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title is too long (max 200)"),
  context: z.string().trim().min(1, "Add the context the receiver needs").max(MAX_TEXT, `Context is too long (max ${MAX_TEXT})`),
  deliverable: z.string().trim().min(1, "Say what you expect to be delivered").max(2000, "Expected deliverable is too long (max 2000)"),
  fromDepartmentId: z.string().min(1, "Choose the department you are handing over from"),
  receiver: z.string().min(1, "Choose who should receive this"),
  dueAt: z.string().optional(),
  linkedTaskId: z.string().optional(),
  clientToken: z.string().min(8).max(80),
});

export async function createHandover(formData: FormData) {
  const user = await requireUser();
  const raw = {
    title: String(formData.get("title") ?? ""),
    context: String(formData.get("context") ?? ""),
    deliverable: String(formData.get("deliverable") ?? ""),
    fromDepartmentId: String(formData.get("fromDepartmentId") ?? ""),
    receiver: String(formData.get("receiver") ?? ""),
    dueAt: String(formData.get("dueAt") ?? "") || undefined,
    linkedTaskId: String(formData.get("linkedTaskId") ?? "") || undefined,
    clientToken: String(formData.get("clientToken") ?? ""),
  };
  const keep = {
    title: raw.title, context: raw.context, deliverable: raw.deliverable,
    fromDepartmentId: raw.fromDepartmentId, receiver: raw.receiver,
    dueAt: raw.dueAt ?? "", linkedTaskId: raw.linkedTaskId ?? "", clientToken: raw.clientToken,
  };
  const fail = (msg: string): never => back("/handovers/new", "error", msg, keep);

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) fail(parsed.error.issues[0].message);
  const d = parsed.data!;

  // Retry-safe: the same form submission never creates a second handover.
  const existing = await db.handover.findUnique({ where: { clientToken: d.clientToken } });
  if (existing) {
    if (existing.senderId !== user.id) fail("Could not create the handover.");
    redirect(`/handovers/${existing.id}`);
  }

  // The sender must really belong to the department they hand over from.
  if (!user.memberships.some((m) => m.departmentId === d.fromDepartmentId)) {
    fail("You can only hand over on behalf of a department you belong to.");
  }
  const choice = parseReceiverChoice(d.receiver);
  if (!choice) fail("Choose who should receive this.");
  const { toDepartmentId, receiverId } = choice!;
  if (toDepartmentId === d.fromDepartmentId) fail("A handover must go to a different department. Use a task for work inside your own department.");
  if (receiverId === user.id) fail("You cannot hand over to yourself.");

  // Receiver must be an active member of the receiving department (never trust the posted IDs).
  const receiver = await db.user.findUnique({
    where: { id: receiverId },
    select: { id: true, status: true, memberships: { where: { departmentId: toDepartmentId }, select: { id: true } } },
  });
  if (!receiver || receiver.status !== "ACTIVE" || receiver.memberships.length === 0) {
    fail("The chosen receiver is not an active member of that department.");
  }

  let due: Date | null = null;
  if (d.dueAt) {
    due = parseDueDate(d.dueAt);
    if (!due) fail("Due date is not valid.");
    if (d.dueAt < todayStr()) fail("Due date cannot be in the past.");
  }

  let linkedTaskId: string | null = null;
  if (d.linkedTaskId) {
    const task = await db.task.findUnique({ where: { id: d.linkedTaskId } });
    // Same reply for missing and forbidden so task IDs cannot be probed.
    if (!task || !canAccessTask(user, task)) fail("The linked task could not be found.");
    linkedTaskId = task!.id;
  }

  let handoverId: string;
  try {
    const h = await db.$transaction(async (tx) => {
      const created = await tx.handover.create({
        data: {
          title: d.title, context: d.context, deliverable: d.deliverable,
          fromDepartmentId: d.fromDepartmentId, toDepartmentId, senderId: user.id, receiverId,
          dueAt: due, linkedTaskId, clientToken: d.clientToken,
        },
      });
      await tx.handoverEvent.create({
        data: { handoverId: created.id, actorId: user.id, type: "created", detail: { receiverId, toDepartmentId, fromDepartmentId: d.fromDepartmentId } },
      });
      await tx.notification.create({
        data: { userId: receiverId, type: "handover.received", title: "A handover needs your response", handoverId: created.id },
      });
      await tx.auditEvent.create({
        data: { actorUserId: user.id, action: "handover.create", resourceType: "handover", resourceId: created.id, outcome: "success" },
      });
      return created;
    });
    handoverId = h.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const h = await db.handover.findUnique({ where: { clientToken: d.clientToken } });
      if (h && h.senderId === user.id) redirect(`/handovers/${h.id}`);
    }
    console.error("createHandover failed", e);
    fail("The handover could not be saved. Nothing was sent; please try again.");
  }
  revalidatePath("/");
  revalidatePath("/handovers");
  redirect(`/handovers/${handoverId!}`);
}

/** Who is told about each transition, and the (deliberately generic) text they see. */
const NOTIFY: Record<HandoverAction, { to: "sender" | "receiver"; title: string }> = {
  accept: { to: "sender", title: "Your handover was accepted" },
  request_clarification: { to: "sender", title: "Clarification was requested on your handover" },
  reject: { to: "sender", title: "Your handover was rejected" },
  respond: { to: "receiver", title: "The sender answered your clarification request" },
  complete: { to: "sender", title: "A handover you sent was completed" },
  cancel: { to: "receiver", title: "A handover sent to you was cancelled" },
};

const SUCCESS: Record<HandoverAction, string> = {
  accept: "You accepted this handover. You now own the work.",
  request_clarification: "Clarification requested. The sender has been notified.",
  reject: "Handover rejected. The sender has been notified.",
  respond: "Answer sent. The receiver has been asked to respond again.",
  complete: "Handover marked complete.",
  cancel: "Handover cancelled.",
};

/**
 * One entry point for every state change. The actor's role is derived from the stored
 * sender/receiver, the transition is validated by `decide()`, and the write is guarded on the
 * previously-read status so a concurrent or repeated request cannot produce an inconsistent state.
 */
export async function actOnHandover(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("handoverId") ?? "");
  const action = String(formData.get("action") ?? "");
  const path = `/handovers/${id}`;

  const h = await db.handover.findUnique({ where: { id } });
  // Same reply for missing and forbidden so IDs cannot be probed.
  if (!h || !canAccessHandover(user, h)) redirect("/handovers");

  const decision = decide(h, user.id, action, String(formData.get("text") ?? ""));
  if (!decision.ok) {
    if (decision.code === "ALREADY_DONE") back(path, "ok", decision.message);
    back(path, "error", decision.message);
  }
  const act = action as HandoverAction;
  const dec = decision as Extract<typeof decision, { ok: true }>;
  const notify = NOTIFY[act];
  const notifyUserId = notify.to === "sender" ? h.senderId : h.receiverId;

  try {
    await db.$transaction(async (tx) => {
      const now = new Date();
      const res = await tx.handover.updateMany({
        where: { id: h.id, status: h.status },
        data: {
          status: dec.to,
          ...(act === "accept" || act === "request_clarification" || act === "reject" ? { respondedAt: now } : {}),
          ...(act === "respond" ? { sentAt: now } : {}),
          ...(act === "complete" ? { completedAt: now, completionSummary: dec.text } : {}),
        },
      });
      if (res.count !== 1) throw new Error("STALE");
      await tx.handoverEvent.create({
        data: {
          handoverId: h.id, actorId: user.id, type: dec.event,
          detail: { from: h.status, to: dec.to, ...(dec.text ? { text: dec.text } : {}) },
        },
      });
      await tx.notification.create({
        data: { userId: notifyUserId, type: `handover.${dec.event}`, title: notify.title, handoverId: h.id },
      });
      await tx.auditEvent.create({
        data: { actorUserId: user.id, action: `handover.${dec.event}`, resourceType: "handover", resourceId: h.id, outcome: "success" },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This handover changed since you opened it. Review it and try again.");
    console.error("actOnHandover failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/");
  revalidatePath("/handovers");
  back(path, "ok", SUCCESS[act]);
}
