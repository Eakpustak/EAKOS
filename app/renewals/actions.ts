"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayStr } from "@/lib/tasks";
import { addCycle, canManageRenewals, validateRenewal } from "@/lib/renewals";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams({ [kind]: msg, ...(keep ?? {}) }).toString()}`);
}
const g = (f: FormData, k: string) => String(f.get(k) ?? "");
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function requireManager() {
  const user = await requireUser();
  if (!canManageRenewals(user)) {
    await db.auditEvent.create({ data: { actorUserId: user.id, action: "renewal.write", resourceType: "renewal", outcome: "denied" } });
    redirect("/");
  }
  return user;
}

export async function createRenewal(formData: FormData) {
  const user = await requireManager();
  const raw = {
    name: g(formData, "name"), category: g(formData, "category"), vendorId: g(formData, "vendorId"), amount: g(formData, "amount"), currency: g(formData, "currency"),
    cycle: g(formData, "cycle"), renewalDate: g(formData, "renewalDate"), reminderDays: g(formData, "reminderDays"), clientToken: g(formData, "clientToken"),
  };
  const fail = (m: string): never => back("/renewals/new", "error", m, raw);
  if (raw.clientToken.length < 8 || raw.clientToken.length > 80) fail("Could not submit the form. Reload and try again.");
  const dup = await db.renewal.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, createdById: true } });
  if (dup) {
    if (dup.createdById !== user.id) fail("Could not submit the form.");
    redirect(`/renewals/${dup.id}`);
  }
  const v = validateRenewal(raw, todayStr());
  if (!v.ok) return fail(v.error);
  if (v.vendorId) {
    const vendor = await db.vendor.findUnique({ where: { id: v.vendorId }, select: { status: true } });
    if (!vendor || vendor.status !== "ACTIVE") fail("Choose an active vendor, or leave the vendor empty.");
  }
  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const x = await tx.renewal.create({
        data: { name: v.name, category: v.category, vendorId: v.vendorId, amountMinor: v.amountMinor, currency: v.currency, cycle: v.cycle, renewalDate: new Date(`${v.renewalDate}T00:00:00.000Z`), reminderDays: v.reminderDays, createdById: user.id, clientToken: raw.clientToken },
      });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "renewal.create", resourceType: "renewal", resourceId: x.id, outcome: "success", metadata: { category: v.category, cycle: v.cycle } } });
      return x.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.renewal.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, createdById: true } });
      if (again && again.createdById === user.id) redirect(`/renewals/${again.id}`);
    }
    console.error("createRenewal failed", e);
    fail("The renewal could not be saved. Nothing was added; please try again.");
  }
  revalidatePath("/renewals");
  redirect(`/renewals/${id!}`);
}

/** Advance by one cycle from the CURRENT date. Guarded on that date, so a double click advances once. */
export async function markRenewed(formData: FormData) {
  const user = await requireManager();
  const id = g(formData, "id");
  const path = `/renewals/${id}`;
  const r = await db.renewal.findUnique({ where: { id }, select: { id: true, status: true, cycle: true, renewalDate: true } });
  if (!r) back("/renewals", "error", "That renewal is not available.");
  const x = r!;
  if (x.status !== "ACTIVE") back(path, "error", "This renewal is cancelled.");
  // The page posts the date it showed; if it no longer matches, someone already renewed it.
  if (g(formData, "current") !== iso(x.renewalDate)) back(path, "error", "This renewal changed since you opened it. Review the new date first.");
  const next = new Date(`${addCycle(iso(x.renewalDate), x.cycle)}T00:00:00.000Z`);
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.renewal.updateMany({ where: { id: x.id, status: "ACTIVE", renewalDate: x.renewalDate }, data: { renewalDate: next, lastRenewedAt: new Date() } });
      if (res.count !== 1) throw new Error("STALE");
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "renewal.renew", resourceType: "renewal", resourceId: x.id, outcome: "success" } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This renewal changed since you opened it. Review it and try again.");
    console.error("markRenewed failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/renewals");
  back(path, "ok", "Marked as renewed. The next renewal date has moved forward one cycle.");
}

export async function cancelRenewal(formData: FormData) {
  const user = await requireManager();
  const id = g(formData, "id");
  const path = `/renewals/${id}`;
  const r = await db.renewal.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!r) back("/renewals", "error", "That renewal is not available.");
  if (r!.status === "CANCELLED") back(path, "ok", "This renewal is already cancelled.");
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.renewal.updateMany({ where: { id: r!.id, status: "ACTIVE" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      if (res.count !== 1) throw new Error("STALE");
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "renewal.cancel", resourceType: "renewal", resourceId: r!.id, outcome: "success" } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This renewal changed since you opened it.");
    console.error("cancelRenewal failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/renewals");
  back(path, "ok", "Renewal cancelled. It stays in the register.");
}
