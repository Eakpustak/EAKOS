"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayStr } from "@/lib/tasks";
import {
  CASE_NOTIFY, MAX_ITEMS, OPERATIONS_SLUG, TECHNOLOGY_SLUG, buildItems, canManageCases, canOwnItem, canViewCase,
  caseTypeLabel, decideCase, decideItem, isCaseType, openKeyFor, validateCaseInput, validateItemInput,
} from "@/lib/checklists";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams({ [kind]: msg, ...(keep ?? {}) }).toString()}`);
}
const g = (f: FormData, k: string) => String(f.get(k) ?? "");
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** Open a checklist for one person. HR head only. Owners are decided here from stored heads, never from the form. */
export async function createCase(formData: FormData) {
  const user = await requireUser();
  if (!canManageCases(user)) redirect("/");
  const raw = { subjectId: g(formData, "subjectId"), type: g(formData, "type"), effectiveDate: g(formData, "effectiveDate"), clientToken: g(formData, "clientToken") };
  const keep = { ...raw };
  const fail = (m: string): never => back("/checklists/new", "error", m, keep);

  if (raw.clientToken.length < 8 || raw.clientToken.length > 80) fail("Could not submit the form. Reload and try again.");
  const dup = await db.peopleCase.findUnique({ where: { clientToken: raw.clientToken } });
  if (dup) {
    if (dup.createdById !== user.id) fail("Could not submit the form.");
    redirect(`/checklists/${dup.id}`);
  }
  const problem = validateCaseInput(raw.type, raw.effectiveDate, todayStr());
  if (problem) fail(problem);
  if (!raw.subjectId) fail("Choose a person.");
  if (raw.subjectId === user.id) fail("You cannot open a checklist about yourself.");
  const type = raw.type as "ONBOARDING" | "OFFBOARDING";
  if (!isCaseType(type)) fail("Choose onboarding or offboarding.");

  const subject = await db.user.findUnique({ where: { id: raw.subjectId }, select: { id: true, displayName: true, status: true } });
  if (!subject || subject.status !== "ACTIVE") fail("Choose an active person.");
  if (await db.peopleCase.findUnique({ where: { openKey: openKeyFor(subject!.id, type) }, select: { id: true } })) {
    fail(`${subject!.displayName} already has an open ${caseTypeLabel(type).toLowerCase()} checklist.`);
  }

  const subjectDepts = (await db.departmentMembership.findMany({ where: { userId: subject!.id }, select: { departmentId: true } })).map((m) => m.departmentId);
  const heads = await db.departmentMembership.findMany({
    where: {
      type: "HEAD", user: { status: "ACTIVE" },
      OR: [{ department: { slug: { in: [TECHNOLOGY_SLUG, OPERATIONS_SLUG] } } }, { departmentId: { in: subjectDepts } }],
    },
    select: { userId: true, departmentId: true, department: { select: { slug: true } } },
  });
  const ids = (f: (h: (typeof heads)[number]) => boolean) => heads.filter(f).map((h) => h.userId);
  const items = buildItems(type, {
    managerHeadIds: ids((h) => subjectDepts.includes(h.departmentId)),
    technologyHeadIds: ids((h) => h.department.slug === TECHNOLOGY_SLUG),
    operationsHeadIds: ids((h) => h.department.slug === OPERATIONS_SLUG),
    creatorId: user.id,
    subjectId: subject!.id,
  });
  const due = day(raw.effectiveDate);

  let caseId: string;
  try {
    const created = await db.$transaction(async (tx) => {
      const c = await tx.peopleCase.create({
        data: {
          type, subjectId: subject!.id, createdById: user.id, effectiveDate: due,
          openKey: openKeyFor(subject!.id, type), clientToken: raw.clientToken,
          items: { create: items.map((i) => ({ title: i.title, ownerId: i.ownerId, position: i.position, dueAt: due })) },
        },
      });
      for (const uid of new Set(items.map((i) => i.ownerId).filter((id) => id !== user.id))) {
        await tx.notification.create({ data: { userId: uid, type: "case.assigned", title: CASE_NOTIFY.assigned, caseId: c.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "case.create", resourceType: "case", resourceId: c.id, outcome: "success", metadata: { type } } });
      return c;
    });
    caseId = created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.peopleCase.findUnique({ where: { clientToken: raw.clientToken } });
      if (again && again.createdById === user.id) redirect(`/checklists/${again.id}`);
      fail(`${subject!.displayName} already has an open ${caseTypeLabel(type).toLowerCase()} checklist.`);
    }
    console.error("createCase failed", e);
    fail("The checklist could not be saved. Nothing was created; please try again.");
  }
  revalidatePath("/checklists");
  redirect(`/checklists/${caseId!}`);
}

/** Load an item and its case; the same redirect for missing and forbidden so IDs cannot be probed. */
async function loadItem(user: Awaited<ReturnType<typeof requireUser>>, itemId: string) {
  const item = await db.caseItem.findUnique({ where: { id: itemId }, include: { case: { select: { id: true, status: true, subjectId: true } } } });
  if (!item) redirect("/checklists");
  const siblings = await db.caseItem.findMany({ where: { caseId: item.caseId }, select: { ownerId: true } });
  if (!canViewCase(user, item.case.subjectId, siblings)) redirect("/checklists");
  return item;
}

/** Mark one item done, or reopen it. The write is guarded on the status that was read. */
export async function markItem(formData: FormData) {
  const user = await requireUser();
  const item = await loadItem(user, g(formData, "itemId"));
  const path = `/checklists/${item.caseId}`;
  const action = g(formData, "action");
  const dec = decideItem(user, item.case, item, action);
  if (!dec.ok) back(path, dec.code === "ALREADY_DONE" ? "ok" : "error", dec.message);
  const to = (dec as Extract<typeof dec, { ok: true }>).to;

  try {
    await db.$transaction(async (tx) => {
      const res = await tx.caseItem.updateMany({
        where: { id: item.id, status: item.status },
        data: to === "DONE" ? { status: "DONE", doneAt: new Date(), doneById: user.id } : { status: "OPEN", doneAt: null, doneById: null },
      });
      if (res.count !== 1) throw new Error("STALE");
      if (to === "OPEN" && item.ownerId !== user.id) {
        await tx.notification.create({ data: { userId: item.ownerId, type: "case.reopened", title: CASE_NOTIFY.reopened, caseId: item.caseId } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: `case.item_${to === "DONE" ? "done" : "reopen"}`, resourceType: "case", resourceId: item.caseId, outcome: "success", metadata: { itemId: item.id } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This item changed since you opened it. Review it and try again.");
    console.error("markItem failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath(path);
  back(path, "ok", to === "DONE" ? "Item marked done." : "Item reopened.");
}

/** Move an item to a different owner. HR head only; the owner must be an active person other than the subject. */
export async function reassignItem(formData: FormData) {
  const user = await requireUser();
  if (!canManageCases(user)) redirect("/checklists");
  const item = await loadItem(user, g(formData, "itemId"));
  const path = `/checklists/${item.caseId}`;
  const ownerId = g(formData, "ownerId");
  if (item.case.status !== "OPEN") back(path, "error", "This checklist is closed, so its items can't be changed.");
  if (!ownerId || ownerId === item.ownerId) back(path, "error", "Choose a different person.");
  if (!canOwnItem(ownerId, item.case.subjectId)) back(path, "error", "The person this checklist is about cannot own its items.");
  const next = await db.user.findUnique({ where: { id: ownerId }, select: { status: true } });
  if (!next || next.status !== "ACTIVE") back(path, "error", "Choose an active person.");

  try {
    await db.$transaction(async (tx) => {
      const res = await tx.caseItem.updateMany({ where: { id: item.id, ownerId: item.ownerId }, data: { ownerId } });
      if (res.count !== 1) throw new Error("STALE");
      if (ownerId !== user.id) await tx.notification.create({ data: { userId: ownerId, type: "case.assigned", title: CASE_NOTIFY.assigned, caseId: item.caseId } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "case.item_reassign", resourceType: "case", resourceId: item.caseId, outcome: "success", metadata: { itemId: item.id } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This item changed since you opened it. Review it and try again.");
    console.error("reassignItem failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath(path);
  back(path, "ok", "Item reassigned.");
}

/** Add a custom item to an open checklist. HR head only. */
export async function addItem(formData: FormData) {
  const user = await requireUser();
  if (!canManageCases(user)) redirect("/checklists");
  const caseId = g(formData, "caseId");
  const path = `/checklists/${caseId}`;
  const c = await db.peopleCase.findUnique({ where: { id: caseId }, select: { id: true, status: true, subjectId: true, _count: { select: { items: true } } } });
  if (!c) redirect("/checklists");
  if (c.status !== "OPEN") back(path, "error", "This checklist is closed, so its items can't be changed.");
  const title = g(formData, "title").trim();
  const dueAt = g(formData, "dueAt");
  const ownerId = g(formData, "ownerId");
  const problem = validateItemInput(title, dueAt);
  if (problem) back(path, "error", problem);
  if (c.subjectId === ownerId || !canOwnItem(ownerId, c.subjectId)) back(path, "error", "The person this checklist is about cannot own its items.");
  if (c._count.items >= MAX_ITEMS) back(path, "error", `A checklist can have at most ${MAX_ITEMS} items.`);
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { status: true } });
  if (!owner || owner.status !== "ACTIVE") back(path, "error", "Choose an active owner.");

  try {
    await db.$transaction(async (tx) => {
      const item = await tx.caseItem.create({ data: { caseId: c.id, title, ownerId, dueAt: dueAt ? day(dueAt) : null, position: c._count.items } });
      if (ownerId !== user.id) await tx.notification.create({ data: { userId: ownerId, type: "case.assigned", title: CASE_NOTIFY.assigned, caseId: c.id } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "case.item_add", resourceType: "case", resourceId: c.id, outcome: "success", metadata: { itemId: item.id } } });
    });
  } catch (e) {
    console.error("addItem failed", e);
    back(path, "error", "The item could not be saved. Nothing was added.");
  }
  revalidatePath(path);
  back(path, "ok", "Item added.");
}

/** Complete (every item done) or cancel (reason required) a checklist. HR head only. Never automatic. */
export async function closeCase(formData: FormData) {
  const user = await requireUser();
  if (!canManageCases(user)) redirect("/checklists");
  const caseId = g(formData, "caseId");
  const path = `/checklists/${caseId}`;
  const c = await db.peopleCase.findUnique({ where: { id: caseId }, select: { id: true, status: true } });
  if (!c) redirect("/checklists");
  const action = g(formData, "action");
  const openItems = await db.caseItem.count({ where: { caseId: c.id, status: "OPEN" } });
  const dec = decideCase(user, c, action, openItems, g(formData, "note"));
  if (!dec.ok) back(path, dec.code === "ALREADY_DONE" ? "ok" : "error", dec.message);
  const ok = dec as Extract<typeof dec, { ok: true }>;

  try {
    await db.$transaction(async (tx) => {
      const res = await tx.peopleCase.updateMany({
        where: { id: c.id, status: "OPEN" },
        data: { status: ok.to, closedAt: new Date(), closedById: user.id, closeNote: ok.note, openKey: null },
      });
      if (res.count !== 1) throw new Error("STALE");
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: `case.${action}`, resourceType: "case", resourceId: c.id, outcome: "success", metadata: { to: ok.to } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This checklist changed since you opened it. Review it and try again.");
    console.error("closeCase failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/checklists");
  back(path, "ok", ok.to === "COMPLETED" ? "Checklist completed." : "Checklist cancelled.");
}
