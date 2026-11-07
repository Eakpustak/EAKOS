"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageVendors, changedFields, validateVendor } from "@/lib/vendors";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams({ [kind]: msg, ...(keep ?? {}) }).toString()}`);
}
const g = (f: FormData, k: string) => String(f.get(k) ?? "");
const DUPLICATE = "A vendor with that name already exists.";
const isUnique = (e: unknown, field: string) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && JSON.stringify(e.meta ?? {}).includes(field);

async function requireManager() {
  const user = await requireUser();
  if (!canManageVendors(user)) {
    await db.auditEvent.create({ data: { actorUserId: user.id, action: "vendor.write", resourceType: "vendor", outcome: "denied" } });
    redirect("/");
  }
  return user;
}

export async function createVendor(formData: FormData) {
  const user = await requireManager();
  const raw = { name: g(formData, "name"), category: g(formData, "category"), contactName: g(formData, "contactName"), email: g(formData, "email"), phone: g(formData, "phone"), notes: g(formData, "notes"), clientToken: g(formData, "clientToken") };
  const fail = (m: string): never => back("/vendors/new", "error", m, raw);
  if (raw.clientToken.length < 8 || raw.clientToken.length > 80) fail("Could not submit the form. Reload and try again.");
  const dup = await db.vendor.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, createdById: true } });
  if (dup) {
    if (dup.createdById !== user.id) fail("Could not submit the form.");
    redirect(`/vendors/${dup.id}`);
  }
  const v = validateVendor(raw);
  if (!v.ok) return fail(v.error);
  if (await db.vendor.findUnique({ where: { nameKey: v.nameKey }, select: { id: true } })) fail(DUPLICATE);

  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const x = await tx.vendor.create({ data: { name: v.name, nameKey: v.nameKey, category: v.category, contactName: v.contactName, email: v.email, phone: v.phone, notes: v.notes, createdById: user.id, clientToken: raw.clientToken } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "vendor.create", resourceType: "vendor", resourceId: x.id, outcome: "success", metadata: { category: v.category } } });
      return x.id;
    });
  } catch (e) {
    if (isUnique(e, "nameKey")) fail(DUPLICATE);
    if (isUnique(e, "clientToken")) {
      const again = await db.vendor.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, createdById: true } });
      if (again && again.createdById === user.id) redirect(`/vendors/${again.id}`);
    }
    console.error("createVendor failed", e);
    fail("The vendor could not be saved. Nothing was added; please try again.");
  }
  revalidatePath("/vendors");
  redirect(`/vendors/${id!}`);
}

/** Edit. `version` is the updatedAt the form was loaded with: if someone saved since, nothing is written. */
export async function updateVendor(formData: FormData) {
  const user = await requireManager();
  const id = g(formData, "id");
  const path = `/vendors/${id}`;
  const raw = { name: g(formData, "name"), category: g(formData, "category"), contactName: g(formData, "contactName"), email: g(formData, "email"), phone: g(formData, "phone"), notes: g(formData, "notes") };
  const before = await db.vendor.findUnique({ where: { id } });
  if (!before) back("/vendors", "error", "That vendor is not available.");
  const b = before!;
  const fail = (m: string): never => back(path, "error", m, raw);
  const version = Number(g(formData, "version"));
  if (!Number.isFinite(version) || b.updatedAt.getTime() !== version) fail("This vendor was changed by someone else since you opened it. Reload and try again.");
  const v = validateVendor(raw);
  if (!v.ok) return fail(v.error);

  const next = { name: v.name, nameKey: v.nameKey, category: v.category, contactName: v.contactName, email: v.email, phone: v.phone, notes: v.notes };
  const changed = changedFields(b as unknown as Record<string, unknown>, next).filter((k) => k !== "nameKey");
  if (changed.length === 0) back(path, "ok", "No changes to save.");
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.vendor.updateMany({ where: { id: b.id, updatedAt: b.updatedAt }, data: next });
      if (res.count !== 1) throw new Error("STALE");
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "vendor.update", resourceType: "vendor", resourceId: b.id, outcome: "success", metadata: { fields: changed } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") fail("This vendor was changed by someone else since you opened it. Reload and try again.");
    if (isUnique(e, "nameKey")) fail(DUPLICATE);
    console.error("updateVendor failed", e);
    fail("The changes could not be saved. Nothing was changed.");
  }
  revalidatePath("/vendors");
  back(path, "ok", "Vendor updated.");
}

export async function setVendorStatus(formData: FormData) {
  const user = await requireManager();
  const id = g(formData, "id");
  const to = g(formData, "to");
  const path = `/vendors/${id}`;
  if (to !== "ACTIVE" && to !== "INACTIVE") back(path, "error", "That action is not valid.");
  const v = await db.vendor.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!v) back("/vendors", "error", "That vendor is not available.");
  if (v!.status === to) back(path, "ok", `This vendor is already ${to === "ACTIVE" ? "active" : "inactive"}.`);
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.vendor.updateMany({ where: { id: v!.id, status: v!.status }, data: { status: to as "ACTIVE" | "INACTIVE" } });
      if (res.count !== 1) throw new Error("STALE");
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: to === "ACTIVE" ? "vendor.reactivate" : "vendor.deactivate", resourceType: "vendor", resourceId: v!.id, outcome: "success" } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This vendor changed since you opened it. Review it and try again.");
    console.error("setVendorStatus failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/vendors");
  back(path, "ok", to === "ACTIVE" ? "Vendor reactivated." : "Vendor deactivated. It stays in the register.");
}
