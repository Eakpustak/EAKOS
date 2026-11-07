"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDueDate, todayStr } from "@/lib/tasks";
import {
  LEAD_SOURCES, MANUAL_INTERACTIONS, MAX_SUMMARY, SALES_SLUG, canAccessLead, canCreateLead, canManageLead,
  decideStage, isOpenStage, isSource, stageLabel, validEmail, validOccurredAt, validPhone,
} from "@/lib/leads";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  const params = new URLSearchParams({ [kind]: msg, ...(keep ?? {}) });
  redirect(`${path}?${params.toString()}`);
}

/** Active user who belongs to Sales. Owners and follow-up assignees must pass this (never trust the posted ID). */
async function eligibleSalesUser(id: string) {
  if (!id) return null;
  return db.user.findFirst({
    where: { id, status: "ACTIVE", memberships: { some: { department: { slug: SALES_SLUG } } } },
    select: { id: true, displayName: true },
  });
}

/** Load a lead the user may read AND change. Same reply for missing and forbidden-to-read. */
async function loadManageable(id: string) {
  const user = await requireUser();
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead || !canAccessLead(user, lead)) redirect("/leads");
  if (!canManageLead(user, lead)) back(`/leads/${id}`, "error", "Only the lead's owner or the Sales head can change this lead.");
  return { user, lead: lead! };
}

// ---- create -----------------------------------------------------------------------------------

const createSchema = z.object({
  organizationName: z.string().trim().min(1, "Organisation name is required").max(200, "Organisation name is too long (max 200)"),
  contactName: z.string().trim().min(1, "Contact name is required").max(120, "Contact name is too long (max 120)"),
  contactEmail: z.string().trim().max(254).optional(),
  contactPhone: z.string().trim().max(25).optional(),
  source: z.string(),
  ownerId: z.string().min(1, "Choose an owner"),
  nextFollowUpAt: z.string().optional(),
  clientToken: z.string().min(8).max(80),
});

export async function createLead(formData: FormData) {
  const user = await requireUser();
  if (!canCreateLead(user)) redirect("/");
  const raw = {
    organizationName: String(formData.get("organizationName") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? "") || undefined,
    contactPhone: String(formData.get("contactPhone") ?? "") || undefined,
    source: String(formData.get("source") ?? ""),
    ownerId: String(formData.get("ownerId") ?? ""),
    nextFollowUpAt: String(formData.get("nextFollowUpAt") ?? "") || undefined,
    clientToken: String(formData.get("clientToken") ?? ""),
  };
  const keep = { ...Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v ?? ""])) } as Record<string, string>;
  const fail = (msg: string): never => back("/leads/new", "error", msg, keep);

  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) fail(parsed.error.issues[0].message);
  const d = parsed.data!;
  if (!d.contactEmail && !d.contactPhone) fail("Add an email address or a phone number so the lead can be contacted.");
  if (d.contactEmail && !validEmail(d.contactEmail)) fail("The email address is not valid.");
  if (d.contactPhone && !validPhone(d.contactPhone)) fail("The phone number is not valid.");
  if (!isSource(d.source)) fail(`Choose a source (${LEAD_SOURCES.join(", ")}).`);

  const existing = await db.lead.findUnique({ where: { clientToken: d.clientToken } });
  if (existing) {
    if (existing.createdById !== user.id) fail("Could not create the lead.");
    redirect(`/leads/${existing.id}`);
  }

  const owner = await eligibleSalesUser(d.ownerId);
  if (!owner) fail("The owner must be an active member of Sales & Marketing.");

  let follow: Date | null = null;
  if (d.nextFollowUpAt) {
    follow = parseDueDate(d.nextFollowUpAt);
    if (!follow) fail("The follow-up date is not valid.");
    if (d.nextFollowUpAt < todayStr()) fail("The follow-up date cannot be in the past.");
  }

  let leadId: string;
  try {
    const lead = await db.$transaction(async (tx) => {
      const l = await tx.lead.create({
        data: {
          organizationName: d.organizationName, contactName: d.contactName,
          contactEmail: d.contactEmail ?? null, contactPhone: d.contactPhone ?? null, source: d.source,
          ownerId: owner!.id, createdById: user.id, nextFollowUpAt: follow, clientToken: d.clientToken,
        },
      });
      await tx.leadInteraction.create({
        data: {
          leadId: l.id, actorId: user.id, type: "OWNER",
          summary: owner!.id === user.id ? "Lead created" : `Lead created and assigned to ${owner!.displayName}`,
        },
      });
      if (owner!.id !== user.id) {
        await tx.notification.create({ data: { userId: owner!.id, type: "lead.assigned", title: "A lead was assigned to you", leadId: l.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "lead.create", resourceType: "lead", resourceId: l.id, outcome: "success" } });
      return l;
    });
    leadId = lead.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const l = await db.lead.findUnique({ where: { clientToken: d.clientToken } });
      if (l && l.createdById === user.id) redirect(`/leads/${l.id}`);
    }
    console.error("createLead failed", e);
    fail("The lead could not be saved. Nothing was created; please try again.");
  }
  revalidatePath("/leads");
  redirect(`/leads/${leadId!}`);
}

// ---- log an interaction ------------------------------------------------------------------------

export async function logInteraction(formData: FormData) {
  const id = String(formData.get("leadId") ?? "");
  const path = `/leads/${id}`;
  const { user, lead } = await loadManageable(id);
  const parsed = z.object({
    type: z.enum(MANUAL_INTERACTIONS),
    summary: z.string().trim().min(1, "Write what happened").max(MAX_SUMMARY, `Summary is too long (max ${MAX_SUMMARY})`),
    date: z.string().optional(),
  }).safeParse({
    type: String(formData.get("type") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    date: String(formData.get("date") ?? "") || undefined,
  });
  if (!parsed.success) back(path, "error", parsed.error.issues[0].message);
  const d = parsed.data;

  // "Today" is recorded with its real time; an earlier date is recorded at midday UTC.
  let occurredAt = new Date();
  if (d.date && d.date !== todayStr()) {
    const day = parseDueDate(d.date);
    if (!day) back(path, "error", "The date is not valid.");
    occurredAt = new Date(day!.getTime() + 12 * 3_600_000);
  }
  if (!validOccurredAt(occurredAt)) back(path, "error", "The date cannot be in the future.");

  try {
    await db.$transaction(async (tx) => {
      await tx.leadInteraction.create({ data: { leadId: lead.id, actorId: user.id, type: d.type, summary: d.summary, occurredAt } });
      await tx.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "lead.interaction", resourceType: "lead", resourceId: lead.id, outcome: "success" } });
    });
  } catch (e) {
    console.error("logInteraction failed", e);
    back(path, "error", "That could not be saved. Nothing was logged.");
  }
  revalidatePath(path);
  revalidatePath("/leads");
  back(path, "ok", "Logged.");
}

// ---- stage -------------------------------------------------------------------------------------

export async function changeStage(formData: FormData) {
  const id = String(formData.get("leadId") ?? "");
  const path = `/leads/${id}`;
  const { user, lead } = await loadManageable(id);
  const dec = decideStage(user, lead, String(formData.get("stage") ?? ""), String(formData.get("reason") ?? ""));
  if (!dec.ok) {
    if (dec.code === "ALREADY_DONE") back(path, "ok", dec.message);
    back(path, "error", dec.message);
  }
  const ok = dec as Extract<typeof dec, { ok: true }>;
  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.lead.updateMany({
        where: { id: lead.id, stage: lead.stage },
        data: {
          stage: ok.to, lastActivityAt: now,
          closedAt: ok.closes ? now : null,
          lostReason: ok.to === "LOST" ? ok.reason : null,
          // A closed lead has nothing left to follow up.
          ...(ok.closes ? { nextFollowUpAt: null } : {}),
        },
      });
      if (res.count !== 1) throw new Error("STALE");
      await tx.leadInteraction.create({
        data: {
          leadId: lead.id, actorId: user.id, type: "STAGE",
          summary: `${stageLabel(lead.stage)} → ${stageLabel(ok.to)}${ok.reason ? `: ${ok.reason}` : ""}`,
        },
      });
      if (lead.ownerId !== user.id) {
        await tx.notification.create({ data: { userId: lead.ownerId, type: "lead.stage", title: "A lead you own changed stage", leadId: lead.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "lead.stage", resourceType: "lead", resourceId: lead.id, outcome: "success", metadata: { from: lead.stage, to: ok.to } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This lead changed since you opened it. Review it and try again.");
    console.error("changeStage failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath(path);
  revalidatePath("/leads");
  back(path, "ok", `Moved to ${stageLabel(ok.to).toLowerCase()}.`);
}

// ---- follow-up date ----------------------------------------------------------------------------

export async function setFollowUp(formData: FormData) {
  const id = String(formData.get("leadId") ?? "");
  const path = `/leads/${id}`;
  const { user, lead } = await loadManageable(id);
  if (!isOpenStage(lead.stage)) back(path, "error", "A closed lead has no follow-up.");
  const v = String(formData.get("nextFollowUpAt") ?? "");
  let date: Date | null = null;
  if (v) {
    date = parseDueDate(v);
    if (!date) back(path, "error", "The date is not valid.");
    if (v < todayStr()) back(path, "error", "The follow-up date cannot be in the past.");
  }
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.lead.updateMany({ where: { id: lead.id, stage: lead.stage }, data: { nextFollowUpAt: date } });
      if (res.count !== 1) throw new Error("STALE");
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "lead.followup", resourceType: "lead", resourceId: lead.id, outcome: "success" } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This lead changed since you opened it. Review it and try again.");
    console.error("setFollowUp failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath(path);
  revalidatePath("/leads");
  back(path, "ok", date ? "Follow-up date saved." : "Follow-up date cleared.");
}

// ---- follow-up task ----------------------------------------------------------------------------

export async function createFollowUpTask(formData: FormData) {
  const id = String(formData.get("leadId") ?? "");
  const path = `/leads/${id}`;
  const { user, lead } = await loadManageable(id);
  if (!isOpenStage(lead.stage)) back(path, "error", "A closed lead needs no follow-up task.");
  const parsed = z.object({
    title: z.string().trim().min(1, "Describe the follow-up").max(200, "Title is too long (max 200)"),
    dueAt: z.string().min(1, "Choose a due date"),
    assigneeId: z.string().min(1, "Choose who will do it"),
    clientToken: z.string().min(8).max(80),
  }).safeParse({
    title: String(formData.get("title") ?? ""), dueAt: String(formData.get("dueAt") ?? ""),
    assigneeId: String(formData.get("assigneeId") ?? ""), clientToken: String(formData.get("clientToken") ?? ""),
  });
  if (!parsed.success) back(path, "error", parsed.error.issues[0].message);
  const d = parsed.data;

  const dup = await db.task.findUnique({ where: { clientToken: d.clientToken } });
  if (dup) {
    if (dup.creatorId !== user.id) back(path, "error", "Could not create the task.");
    back(path, "ok", "Follow-up task already created.");
  }
  const due = parseDueDate(d.dueAt);
  if (!due) back(path, "error", "The due date is not valid.");
  if (d.dueAt < todayStr()) back(path, "error", "The due date cannot be in the past.");
  const assignee = await eligibleSalesUser(d.assigneeId);
  if (!assignee) back(path, "error", "The follow-up must be assigned to an active member of Sales & Marketing.");
  const salesDept = user.memberships.find((m) => m.department.slug === SALES_SLUG)?.departmentId ?? null;

  try {
    await db.$transaction(async (tx) => {
      const t = await tx.task.create({
        data: {
          title: d.title, priority: "NORMAL", dueAt: due!, creatorId: user.id, assigneeId: assignee!.id,
          departmentId: salesDept, leadId: lead.id, clientToken: d.clientToken,
        },
      });
      await tx.taskEvent.create({ data: { taskId: t.id, actorId: user.id, type: "created", detail: { assigneeId: t.assigneeId, leadId: lead.id } } });
      if (t.assigneeId !== user.id) {
        await tx.notification.create({ data: { userId: t.assigneeId, type: "task.assigned", title: "A task was assigned to you", taskId: t.id } });
      }
      // The lead's visible follow-up date follows the soonest open follow-up.
      if (!lead.nextFollowUpAt || due! < lead.nextFollowUpAt) {
        await tx.lead.update({ where: { id: lead.id }, data: { nextFollowUpAt: due! } });
      }
      await tx.leadInteraction.create({
        data: { leadId: lead.id, actorId: user.id, type: "NOTE", summary: `Follow-up task created for ${assignee!.displayName}, due ${d.dueAt}: ${d.title}` },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "lead.followup_task", resourceType: "lead", resourceId: lead.id, outcome: "success" } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") back(path, "ok", "Follow-up task already created.");
    console.error("createFollowUpTask failed", e);
    back(path, "error", "The task could not be saved. Nothing was created.");
  }
  revalidatePath(path);
  revalidatePath("/leads");
  revalidatePath("/tasks");
  back(path, "ok", "Follow-up task created.");
}

// ---- reassign ----------------------------------------------------------------------------------

export async function reassignLead(formData: FormData) {
  const id = String(formData.get("leadId") ?? "");
  const path = `/leads/${id}`;
  const { user, lead } = await loadManageable(id);
  if (!isOpenStage(lead.stage)) back(path, "error", "A closed lead can't be reassigned.");
  const newOwner = await eligibleSalesUser(String(formData.get("ownerId") ?? ""));
  if (!newOwner) back(path, "error", "The new owner must be an active member of Sales & Marketing.");
  if (newOwner!.id === lead.ownerId) back(path, "ok", "That person already owns this lead.");
  const oldOwner = await db.user.findUnique({ where: { id: lead.ownerId }, select: { displayName: true } });

  try {
    await db.$transaction(async (tx) => {
      const res = await tx.lead.updateMany({ where: { id: lead.id, ownerId: lead.ownerId }, data: { ownerId: newOwner!.id, lastActivityAt: new Date() } });
      if (res.count !== 1) throw new Error("STALE");
      await tx.leadInteraction.create({
        data: { leadId: lead.id, actorId: user.id, type: "OWNER", summary: `Owner changed from ${oldOwner?.displayName ?? "previous owner"} to ${newOwner!.displayName}` },
      });
      await tx.notification.create({ data: { userId: newOwner!.id, type: "lead.assigned", title: "A lead was assigned to you", leadId: lead.id } });
      if (lead.ownerId !== user.id) {
        await tx.notification.create({ data: { userId: lead.ownerId, type: "lead.reassigned", title: "A lead you owned was reassigned", leadId: lead.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "lead.reassign", resourceType: "lead", resourceId: lead.id, outcome: "success" } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This lead changed since you opened it. Review it and try again.");
    console.error("reassignLead failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath(path);
  revalidatePath("/leads");
  // The previous owner may no longer be allowed to see it.
  if (lead.ownerId === user.id && newOwner!.id !== user.id) redirect("/leads?ok=" + encodeURIComponent("Lead reassigned."));
  back(path, "ok", "Lead reassigned.");
}
