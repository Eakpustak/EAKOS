"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessTask, dueStr, parseDueDate, PRIORITIES, STATUSES, STATUS_LABEL } from "@/lib/tasks";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  const params = new URLSearchParams({ [kind]: msg, ...(keep ?? {}) });
  redirect(`${path}?${params.toString()}`);
}

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title is too long (max 200)"),
  description: z.string().trim().max(5000, "Description is too long (max 5000)").optional(),
  assigneeId: z.string().min(1, "Choose an owner"),
  departmentId: z.string().optional(),
  priority: z.enum(PRIORITIES),
  dueAt: z.string().optional(),
  clientToken: z.string().min(8).max(80),
});

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const raw = {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    assigneeId: String(formData.get("assigneeId") ?? ""),
    departmentId: String(formData.get("departmentId") ?? "") || undefined,
    priority: String(formData.get("priority") ?? "NORMAL"),
    dueAt: String(formData.get("dueAt") ?? "") || undefined,
    clientToken: String(formData.get("clientToken") ?? ""),
  };
  // Preserve what was typed so a validation error doesn't lose the whole form.
  const keep = {
    title: raw.title, description: raw.description, assigneeId: raw.assigneeId,
    departmentId: raw.departmentId ?? "", priority: raw.priority, dueAt: raw.dueAt ?? "",
    clientToken: raw.clientToken,
  };
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) back("/tasks/new", "error", parsed.error.issues[0].message, keep);
  const d = parsed.data;

  // Retry-safe: the same form submission never creates a second task.
  const existing = await db.task.findUnique({ where: { clientToken: d.clientToken } });
  if (existing) {
    if (existing.creatorId !== user.id) back("/tasks/new", "error", "Could not create the task.", keep);
    redirect(`/tasks/${existing.id}`);
  }

  const due = d.dueAt ? parseDueDate(d.dueAt) : null;
  if (d.dueAt && !due) back("/tasks/new", "error", "Due date is not valid.", keep);

  const assignee = await db.user.findUnique({ where: { id: d.assigneeId }, select: { id: true, status: true } });
  if (!assignee || assignee.status !== "ACTIVE") back("/tasks/new", "error", "The chosen owner is not an active user.", keep);
  if (d.departmentId && !user.memberships.some((m) => m.departmentId === d.departmentId)) {
    back("/tasks/new", "error", "You can only file a task under a department you belong to.", keep);
  }

  let taskId: string;
  try {
    const task = await db.$transaction(async (tx) => {
      const t = await tx.task.create({
        data: {
          title: d.title, description: d.description || null, priority: d.priority, dueAt: due,
          creatorId: user.id, assigneeId: assignee!.id, departmentId: d.departmentId ?? null,
          clientToken: d.clientToken,
        },
      });
      await tx.taskEvent.create({ data: { taskId: t.id, actorId: user.id, type: "created", detail: { assigneeId: t.assigneeId } } });
      if (t.assigneeId !== user.id) {
        await tx.notification.create({ data: { userId: t.assigneeId, type: "task.assigned", title: "A task was assigned to you", taskId: t.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "task.create", resourceType: "task", resourceId: t.id, outcome: "success" } });
      return t;
    });
    taskId = task.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const t = await db.task.findUnique({ where: { clientToken: d.clientToken } });
      if (t && t.creatorId === user.id) redirect(`/tasks/${t.id}`);
    }
    console.error("createTask failed", e);
    back("/tasks/new", "error", "The task could not be saved. Nothing was created; please try again.", keep);
  }
  revalidatePath("/");
  revalidatePath("/tasks");
  redirect(`/tasks/${taskId}`);
}

async function loadAccessible(taskId: string) {
  const user = await requireUser();
  const task = await db.task.findUnique({ where: { id: taskId } });
  // Same response for "missing" and "forbidden" so IDs cannot be probed.
  if (!task || !canAccessTask(user, task)) redirect("/tasks");
  return { user, task };
}

export async function updateStatus(formData: FormData) {
  const id = String(formData.get("taskId") ?? "");
  const path = `/tasks/${id}`;
  const { user, task } = await loadAccessible(id);
  const status = z.enum(STATUSES).safeParse(formData.get("status"));
  if (!status.success) back(path, "error", "Choose a valid status.");
  if (status.data === task.status) back(path, "ok", "Status unchanged.");
  try {
    await db.$transaction(async (tx) => {
      // Optimistic guard: fails if someone else changed the status since the page loaded.
      const res = await tx.task.updateMany({
        where: { id: task.id, status: task.status },
        data: { status: status.data, completedAt: status.data === "DONE" ? new Date() : null },
      });
      if (res.count !== 1) throw new Error("STALE");
      await tx.taskEvent.create({ data: { taskId: task.id, actorId: user.id, type: "status", detail: { from: task.status, to: status.data } } });
      const notify = new Set([task.creatorId, task.assigneeId]);
      notify.delete(user.id);
      for (const uid of notify) {
        await tx.notification.create({ data: { userId: uid, type: "task.status", title: `Task marked ${STATUS_LABEL[status.data].toLowerCase()}`, taskId: task.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "task.status", resourceType: "task", resourceId: task.id, outcome: "success" } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This task was changed by someone else. Review it and try again.");
    console.error("updateStatus failed", e);
    back(path, "error", "The status could not be saved. Nothing was changed.");
  }
  revalidatePath("/");
  revalidatePath("/tasks");
  back(path, "ok", "Status updated.");
}

export async function reassignTask(formData: FormData) {
  const id = String(formData.get("taskId") ?? "");
  const path = `/tasks/${id}`;
  const { user, task } = await loadAccessible(id);
  const assigneeId = String(formData.get("assigneeId") ?? "");
  if (!assigneeId) back(path, "error", "Choose a new owner.");
  if (assigneeId === task.assigneeId) back(path, "ok", "Owner unchanged.");
  const assignee = await db.user.findUnique({ where: { id: assigneeId }, select: { id: true, status: true } });
  if (!assignee || assignee.status !== "ACTIVE") back(path, "error", "The chosen owner is not an active user.");
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.task.updateMany({
        where: { id: task.id, assigneeId: task.assigneeId },
        data: { assigneeId: assignee!.id },
      });
      if (res.count !== 1) throw new Error("STALE");
      await tx.taskEvent.create({ data: { taskId: task.id, actorId: user.id, type: "reassigned", detail: { from: task.assigneeId, to: assignee!.id } } });
      if (assignee!.id !== user.id) {
        await tx.notification.create({ data: { userId: assignee!.id, type: "task.assigned", title: "A task was assigned to you", taskId: task.id } });
      }
      if (task.assigneeId !== user.id) {
        await tx.notification.create({ data: { userId: task.assigneeId, type: "task.reassigned", title: "A task was reassigned away from you", taskId: task.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "task.reassign", resourceType: "task", resourceId: task.id, outcome: "success" } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This task was changed by someone else. Review it and try again.");
    console.error("reassignTask failed", e);
    back(path, "error", "The owner could not be changed. Nothing was changed.");
  }
  revalidatePath("/");
  revalidatePath("/tasks");
  back(path, "ok", "Owner changed.");
}

const editSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title is too long (max 200)"),
  description: z.string().trim().max(5000, "Description is too long (max 5000)").optional(),
  dueAt: z.string().optional(),
});

/** Only the creator may edit title, description or due date (RULES: owner/head/assignee don't author the task). */
export async function editTask(formData: FormData) {
  const id = String(formData.get("taskId") ?? "");
  const path = `/tasks/${id}`;
  const { user, task } = await loadAccessible(id);
  if (task.creatorId !== user.id) back(path, "error", "Only the person who filed this task can edit it.");

  const raw = {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    dueAt: String(formData.get("dueAt") ?? "") || undefined,
  };
  const parsed = editSchema.safeParse(raw);
  if (!parsed.success) back(path, "error", parsed.error.issues[0].message);
  const d = parsed.data;

  const due = d.dueAt ? parseDueDate(d.dueAt) : null;
  if (d.dueAt && !due) back(path, "error", "Due date is not valid.");

  const noChange = d.title === task.title && (d.description || null) === task.description && dueStr(due) === dueStr(task.dueAt);
  if (noChange) back(path, "ok", "Nothing changed.");

  try {
    await db.$transaction(async (tx) => {
      await tx.task.update({ where: { id: task.id }, data: { title: d.title, description: d.description || null, dueAt: due } });
      await tx.taskEvent.create({ data: { taskId: task.id, actorId: user.id, type: "edited" } });
      const notify = new Set([task.assigneeId]);
      notify.delete(user.id);
      for (const uid of notify) {
        await tx.notification.create({ data: { userId: uid, type: "task.edited", title: "A task you own was edited", taskId: task.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "task.edit", resourceType: "task", resourceId: task.id, outcome: "success" } });
    });
  } catch (e) {
    console.error("editTask failed", e);
    back(path, "error", "The task could not be saved. Nothing was changed.");
  }
  revalidatePath("/");
  revalidatePath("/tasks");
  back(path, "ok", "Task updated.");
}

export async function addComment(formData: FormData) {
  const id = String(formData.get("taskId") ?? "");
  const path = `/tasks/${id}`;
  const { user, task } = await loadAccessible(id);
  const body = z.string().trim().min(1, "Write a comment first").max(4000, "Comment is too long (max 4000)").safeParse(formData.get("body") ?? "");
  if (!body.success) back(path, "error", body.error.issues[0].message);
  try {
    await db.$transaction(async (tx) => {
      await tx.taskComment.create({ data: { taskId: task.id, authorId: user.id, body: body.data } });
      await tx.taskEvent.create({ data: { taskId: task.id, actorId: user.id, type: "comment" } });
      const notify = new Set([task.creatorId, task.assigneeId]);
      notify.delete(user.id);
      for (const uid of notify) {
        await tx.notification.create({ data: { userId: uid, type: "task.comment", title: "New comment on a task", taskId: task.id } });
      }
    });
  } catch (e) {
    console.error("addComment failed", e);
    back(path, "error", "Your comment could not be saved. Please try again.");
  }
  back(path, "ok", "Comment added.");
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
  redirect("/notifications");
}

