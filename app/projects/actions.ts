"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDueDate, todayStr } from "@/lib/tasks";
import {
  MAX_DESCRIPTION, MAX_NAME, canAccessProject, canCreateFromHandover, canManageProject, decideProjectStatus,
  isProjectOpen, projectStartedNote,
} from "@/lib/projects";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  const params = new URLSearchParams({ [kind]: msg, ...(keep ?? {}) });
  redirect(`${path}?${params.toString()}`);
}

/** Active member of the department. Owners, members and assignees must pass this (never trust posted IDs). */
async function activeDeptMember(userId: string, departmentId: string) {
  if (!userId) return null;
  return db.user.findFirst({
    where: { id: userId, status: "ACTIVE", memberships: { some: { departmentId } } },
    select: { id: true, displayName: true },
  });
}

/** Load a project the user may read AND manage. Same reply for missing and forbidden-to-read. */
async function loadManageable(id: string, opts: { needOpen?: boolean } = {}) {
  const user = await requireUser();
  const project = await db.project.findUnique({ where: { id }, include: { members: { select: { userId: true } } } });
  if (!project || !canAccessProject(user, project)) redirect("/projects");
  if (!canManageProject(user, project)) back(`/projects/${id}`, "error", "Only the project owner or the department head can change this project.");
  if (opts.needOpen && !isProjectOpen(project.status)) back(`/projects/${id}`, "error", "This project is closed. Reopen is not possible; start a new project if work continues.");
  return { user, project: project! };
}

function dateOrNull(v: string, path: string, keep?: Record<string, string>, allowPast = false): Date | null {
  if (!v) return null;
  const d = parseDueDate(v);
  if (!d) back(path, "error", "The date is not valid.", keep);
  if (!allowPast && v < todayStr()) back(path, "error", "The date cannot be in the past.", keep);
  return d;
}

// ---- create -----------------------------------------------------------------------------------

const createSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(MAX_NAME, `Name is too long (max ${MAX_NAME})`),
  description: z.string().trim().max(MAX_DESCRIPTION, `Description is too long (max ${MAX_DESCRIPTION})`).optional(),
  departmentId: z.string().optional(),
  handoverId: z.string().optional(),
  ownerId: z.string().min(1, "Choose the delivery owner"),
  dueAt: z.string().optional(),
  clientToken: z.string().min(8).max(80),
});

export async function createProject(formData: FormData) {
  const user = await requireUser();
  const g = (k: string) => String(formData.get(k) ?? "");
  const raw = {
    name: g("name"), description: g("description") || undefined, departmentId: g("departmentId") || undefined,
    handoverId: g("handoverId") || undefined, ownerId: g("ownerId"), dueAt: g("dueAt") || undefined, clientToken: g("clientToken"),
  };
  const keep = {
    name: raw.name, description: raw.description ?? "", departmentId: raw.departmentId ?? "", handoverId: raw.handoverId ?? "",
    ownerId: raw.ownerId, dueAt: raw.dueAt ?? "", clientToken: raw.clientToken,
  };
  const fail = (msg: string): never => back("/projects/new", "error", msg, keep);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) fail(parsed.error.issues[0].message);
  const d = parsed.data!;

  // Retry-safe: the same form submission never creates a second project.
  const dup = await db.project.findUnique({ where: { clientToken: d.clientToken } });
  if (dup) {
    if (dup.createdById !== user.id) fail("Could not create the project.");
    redirect(`/projects/${dup.id}`);
  }

  let departmentId = d.departmentId ?? "";
  let handover: Awaited<ReturnType<typeof db.handover.findUnique>> = null;
  if (d.handoverId) {
    handover = await db.handover.findUnique({ where: { id: d.handoverId } });
    // Same reply for missing and not-yours so handover IDs cannot be probed.
    if (!handover || handover.receiverId !== user.id) fail("The handover could not be found.");
    const existing = await db.project.findUnique({ where: { handoverId: handover!.id }, select: { id: true } });
    const ok = canCreateFromHandover(user, handover!, !!existing);
    if (!ok.ok) fail(ok.message);
    departmentId = handover!.toDepartmentId;
  }
  if (!departmentId || !user.memberships.some((m) => m.departmentId === departmentId)) {
    fail("You can only create a project for a department you belong to.");
  }
  const owner = await activeDeptMember(d.ownerId, departmentId);
  if (!owner) fail("The delivery owner must be an active member of the delivering department.");
  const due = dateOrNull(d.dueAt ?? "", "/projects/new", keep);

  let projectId: string;
  try {
    const p = await db.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name: d.name, description: d.description || null, departmentId, ownerId: owner!.id, createdById: user.id,
          handoverId: handover?.id ?? null, dueAt: due, clientToken: d.clientToken,
        },
      });
      if (handover) {
        await tx.handoverEvent.create({ data: { handoverId: handover.id, actorId: user.id, type: "project_created", detail: { projectId: created.id } } });
        await tx.notification.create({ data: { userId: handover.senderId, type: "project.started", title: "Delivery has started on your handover", projectId: created.id } });
        if (handover.leadId) {
          await tx.leadInteraction.create({ data: { leadId: handover.leadId, actorId: user.id, type: "NOTE", summary: projectStartedNote(d.name, owner!.displayName) } });
          await tx.lead.update({ where: { id: handover.leadId }, data: { lastActivityAt: new Date() } });
        }
      }
      if (owner!.id !== user.id) {
        await tx.notification.create({ data: { userId: owner!.id, type: "project.assigned", title: "You were made delivery owner of a project", projectId: created.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "project.create", resourceType: "project", resourceId: created.id, outcome: "success" } });
      return created;
    });
    projectId = p.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.project.findFirst({
        where: { OR: [{ clientToken: d.clientToken }, ...(handover ? [{ handoverId: handover.id }] : [])] }, select: { id: true, createdById: true },
      });
      if (again && again.createdById === user.id) redirect(`/projects/${again.id}`);
      fail(handover ? "This handover already has a project." : "Could not create the project.");
    }
    console.error("createProject failed", e);
    fail("The project could not be saved. Nothing was created; please try again.");
  }
  revalidatePath("/projects");
  if (handover) { revalidatePath(`/handovers/${handover.id}`); revalidatePath("/handovers"); }
  redirect(`/projects/${projectId!}`);
}

// ---- milestones --------------------------------------------------------------------------------

export async function addMilestone(formData: FormData) {
  const id = String(formData.get("projectId") ?? "");
  const path = `/projects/${id}`;
  const { user, project } = await loadManageable(id, { needOpen: true });
  const parsed = z.object({
    title: z.string().trim().min(1, "Name the milestone").max(200, "Title is too long (max 200)"),
    dueAt: z.string().optional(),
  }).safeParse({ title: String(formData.get("title") ?? ""), dueAt: String(formData.get("dueAt") ?? "") || undefined });
  if (!parsed.success) back(path, "error", parsed.error.issues[0].message);
  const due = dateOrNull(parsed.data!.dueAt ?? "", path);
  const count = await db.milestone.count({ where: { projectId: project.id } });
  if (count >= 50) back(path, "error", "A project can have at most 50 milestones.");
  try {
    await db.$transaction(async (tx) => {
      const m = await tx.milestone.create({ data: { projectId: project.id, title: parsed.data!.title, dueAt: due } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "project.milestone_add", resourceType: "project", resourceId: project.id, outcome: "success", metadata: { milestoneId: m.id } } });
    });
  } catch (e) {
    console.error("addMilestone failed", e);
    back(path, "error", "The milestone could not be saved. Nothing was changed.");
  }
  revalidatePath(path);
  back(path, "ok", "Milestone added.");
}

export async function setMilestone(formData: FormData) {
  const id = String(formData.get("projectId") ?? "");
  const path = `/projects/${id}`;
  const { user, project } = await loadManageable(id, { needOpen: true });
  const mid = String(formData.get("milestoneId") ?? "");
  const to = String(formData.get("to") ?? "");
  if (to !== "DONE" && to !== "OPEN" && to !== "REMOVE") back(path, "error", "That action is not valid.");
  const m = await db.milestone.findFirst({ where: { id: mid, projectId: project.id } });
  if (!m) back(path, "error", "That milestone no longer exists.");
  if (to !== "REMOVE" && m!.status === to) back(path, "ok", to === "DONE" ? "Already marked done." : "Already open.");
  try {
    await db.$transaction(async (tx) => {
      if (to === "REMOVE") {
        await tx.milestone.delete({ where: { id: m!.id } });
      } else {
        const res = await tx.milestone.updateMany({
          where: { id: m!.id, status: m!.status },
          data: to === "DONE" ? { status: "DONE", doneAt: new Date(), doneById: user.id } : { status: "OPEN", doneAt: null, doneById: null },
        });
        if (res.count !== 1) throw new Error("STALE");
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: `project.milestone_${to.toLowerCase()}`, resourceType: "project", resourceId: project.id, outcome: "success", metadata: { milestoneId: m!.id } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This milestone changed since you opened it. Review it and try again.");
    console.error("setMilestone failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath(path);
  back(path, "ok", to === "DONE" ? "Milestone marked done." : to === "OPEN" ? "Milestone reopened." : "Milestone removed.");
}

// ---- status --------------------------------------------------------------------------------------

export async function changeProjectStatus(formData: FormData) {
  const id = String(formData.get("projectId") ?? "");
  const path = `/projects/${id}`;
  const { user, project } = await loadManageable(id);
  const openMilestones = await db.milestone.count({ where: { projectId: project.id, status: "OPEN" } });
  const dec = decideProjectStatus(user, project, String(formData.get("status") ?? ""), openMilestones);
  if (!dec.ok) back(path, dec.code === "ALREADY_DONE" ? "ok" : "error", dec.message);
  const ok = dec as Extract<typeof dec, { ok: true }>;
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.project.updateMany({
        where: { id: project.id, status: project.status },
        data: { status: ok.to, completedAt: ok.completes ? new Date() : null },
      });
      if (res.count !== 1) throw new Error("STALE");
      if (project.ownerId !== user.id) {
        await tx.notification.create({ data: { userId: project.ownerId, type: "project.status", title: "A project you own changed status", projectId: project.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "project.status", resourceType: "project", resourceId: project.id, outcome: "success", metadata: { from: project.status, to: ok.to } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This project changed since you opened it. Review it and try again.");
    console.error("changeProjectStatus failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath(path);
  revalidatePath("/projects");
  back(path, "ok", "Project status updated.");
}

// ---- members ---------------------------------------------------------------------------------------

export async function addMember(formData: FormData) {
  const id = String(formData.get("projectId") ?? "");
  const path = `/projects/${id}`;
  const { user, project } = await loadManageable(id, { needOpen: true });
  const person = await activeDeptMember(String(formData.get("userId") ?? ""), project.departmentId);
  if (!person) back(path, "error", "Only active members of the delivering department can be added.");
  if (person!.id === project.ownerId || project.members.some((m) => m.userId === person!.id)) back(path, "ok", `${person!.displayName} is already on this project.`);
  try {
    await db.$transaction(async (tx) => {
      await tx.projectMember.create({ data: { projectId: project.id, userId: person!.id } });
      await tx.notification.create({ data: { userId: person!.id, type: "project.member", title: "You were added to a project", projectId: project.id } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "project.member_add", resourceType: "project", resourceId: project.id, outcome: "success", metadata: { userId: person!.id } } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") back(path, "ok", `${person!.displayName} is already on this project.`);
    console.error("addMember failed", e);
    back(path, "error", "The member could not be added. Nothing was changed.");
  }
  revalidatePath(path);
  back(path, "ok", `${person!.displayName} added.`);
}

export async function removeMember(formData: FormData) {
  const id = String(formData.get("projectId") ?? "");
  const path = `/projects/${id}`;
  const { user, project } = await loadManageable(id, { needOpen: true });
  const uid = String(formData.get("userId") ?? "");
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.projectMember.deleteMany({ where: { projectId: project.id, userId: uid } });
      if (res.count === 1) {
        await tx.auditEvent.create({ data: { actorUserId: user.id, action: "project.member_remove", resourceType: "project", resourceId: project.id, outcome: "success", metadata: { userId: uid } } });
      }
    });
  } catch (e) {
    console.error("removeMember failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath(path);
  back(path, "ok", "Member removed.");
}

// ---- tasks ---------------------------------------------------------------------------------------------

export async function createProjectTask(formData: FormData) {
  const id = String(formData.get("projectId") ?? "");
  const path = `/projects/${id}`;
  const { user, project } = await loadManageable(id, { needOpen: true });
  const parsed = z.object({
    title: z.string().trim().min(1, "Describe the task").max(200, "Title is too long (max 200)"),
    assigneeId: z.string().min(1, "Choose who will do it"),
    dueAt: z.string().optional(),
    clientToken: z.string().min(8).max(80),
  }).safeParse({
    title: String(formData.get("title") ?? ""), assigneeId: String(formData.get("assigneeId") ?? ""),
    dueAt: String(formData.get("dueAt") ?? "") || undefined, clientToken: String(formData.get("clientToken") ?? ""),
  });
  if (!parsed.success) back(path, "error", parsed.error.issues[0].message);
  const d = parsed.data!;
  const dup = await db.task.findUnique({ where: { clientToken: d.clientToken } });
  if (dup) {
    if (dup.creatorId !== user.id) back(path, "error", "Could not create the task.");
    back(path, "ok", "Task already created.");
  }
  const due = dateOrNull(d.dueAt ?? "", path);
  // Tasks go to the owner or a listed member who is still active in the department.
  const eligible = d.assigneeId === project.ownerId || project.members.some((m) => m.userId === d.assigneeId);
  const assignee = eligible ? await activeDeptMember(d.assigneeId, project.departmentId) : null;
  if (!assignee) back(path, "error", "Assign the task to the project owner or a project member who is active in the department.");
  try {
    await db.$transaction(async (tx) => {
      const t = await tx.task.create({
        data: { title: d.title, priority: "NORMAL", dueAt: due, creatorId: user.id, assigneeId: assignee!.id, departmentId: project.departmentId, projectId: project.id, clientToken: d.clientToken },
      });
      await tx.taskEvent.create({ data: { taskId: t.id, actorId: user.id, type: "created", detail: { assigneeId: t.assigneeId, projectId: project.id } } });
      if (t.assigneeId !== user.id) {
        await tx.notification.create({ data: { userId: t.assigneeId, type: "task.assigned", title: "A task was assigned to you", taskId: t.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "project.task_create", resourceType: "project", resourceId: project.id, outcome: "success", metadata: { taskId: t.id } } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") back(path, "ok", "Task already created.");
    console.error("createProjectTask failed", e);
    back(path, "error", "The task could not be saved. Nothing was created.");
  }
  revalidatePath(path);
  revalidatePath("/tasks");
  back(path, "ok", "Task created.");
}
