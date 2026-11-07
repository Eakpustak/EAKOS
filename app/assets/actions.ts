"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageAssets, validateAsset } from "@/lib/assets";
import { TECHNOLOGY_SLUG } from "@/lib/checklists";
import { changedFields } from "@/lib/vendors";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams({ [kind]: msg, ...(keep ?? {}) }).toString()}`);
}
const g = (f: FormData, k: string) => String(f.get(k) ?? "");
const DUPLICATE = "An asset with that name already exists.";
const isUnique = (e: unknown, field: string) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && JSON.stringify(e.meta ?? {}).includes(field);

async function requireManager() {
  const user = await requireUser();
  if (!canManageAssets(user)) {
    await db.auditEvent.create({ data: { actorUserId: user.id, action: "asset.write", resourceType: "tech-asset", outcome: "denied" } });
    redirect("/");
  }
  return user;
}
/** The owner must be an ACTIVE Technology member, looked up server-side. */
async function ownerOk(ownerId: string | null): Promise<boolean> {
  if (!ownerId) return true;
  const n = await db.user.count({ where: { id: ownerId, status: "ACTIVE", memberships: { some: { department: { slug: TECHNOLOGY_SLUG } } } } });
  return n === 1;
}

export async function createAsset(formData: FormData) {
  const user = await requireManager();
  const raw = { name: g(formData, "name"), assetType: g(formData, "assetType"), environment: g(formData, "environment"), url: g(formData, "url"), ownerId: g(formData, "ownerId"), notes: g(formData, "notes"), clientToken: g(formData, "clientToken") };
  // Never echo notes back in the query string: they were refused or may contain what the user should not have typed.
  const keep = { name: raw.name, assetType: raw.assetType, environment: raw.environment, ownerId: raw.ownerId, clientToken: raw.clientToken };
  const fail = (m: string): never => back("/assets/new", "error", m, keep);
  if (raw.clientToken.length < 8 || raw.clientToken.length > 80) fail("Could not submit the form. Reload and try again.");
  const dup = await db.techAsset.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, createdById: true } });
  if (dup) {
    if (dup.createdById !== user.id) fail("Could not submit the form.");
    redirect(`/assets/${dup.id}`);
  }
  const v = validateAsset(raw);
  if (!v.ok) return fail(v.error);
  if (!(await ownerOk(v.ownerId))) fail("Choose an active member of Technology as owner.");
  if (await db.techAsset.findUnique({ where: { nameKey: v.nameKey }, select: { id: true } })) fail(DUPLICATE);
  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const x = await tx.techAsset.create({ data: { name: v.name, nameKey: v.nameKey, assetType: v.assetType, environment: v.environment, url: v.url, ownerId: v.ownerId, notes: v.notes, createdById: user.id, clientToken: raw.clientToken } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "asset.create", resourceType: "tech-asset", resourceId: x.id, outcome: "success", metadata: { assetType: v.assetType, environment: v.environment } } });
      return x.id;
    });
  } catch (e) {
    if (isUnique(e, "nameKey")) fail(DUPLICATE);
    if (isUnique(e, "clientToken")) {
      const again = await db.techAsset.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, createdById: true } });
      if (again && again.createdById === user.id) redirect(`/assets/${again.id}`);
    }
    console.error("createAsset failed", e);
    fail("The asset could not be saved. Nothing was added; please try again.");
  }
  revalidatePath("/assets");
  redirect(`/assets/${id!}`);
}

/** `version` is the updatedAt the form was loaded with: if someone saved since, nothing is written. */
export async function updateAsset(formData: FormData) {
  const user = await requireManager();
  const id = g(formData, "id");
  const path = `/assets/${id}`;
  const raw = { name: g(formData, "name"), assetType: g(formData, "assetType"), environment: g(formData, "environment"), url: g(formData, "url"), ownerId: g(formData, "ownerId"), notes: g(formData, "notes") };
  const before = await db.techAsset.findUnique({ where: { id } });
  if (!before) back("/assets", "error", "That asset is not available.");
  const b = before!;
  const fail = (m: string): never => back(path, "error", m, { name: raw.name, assetType: raw.assetType, environment: raw.environment, ownerId: raw.ownerId });
  const version = Number(g(formData, "version"));
  if (!Number.isFinite(version) || b.updatedAt.getTime() !== version) fail("This asset was changed by someone else since you opened it. Reload and try again.");
  const v = validateAsset(raw);
  if (!v.ok) return fail(v.error);
  if (v.ownerId !== b.ownerId && !(await ownerOk(v.ownerId))) fail("Choose an active member of Technology as owner.");
  const next = { name: v.name, assetType: v.assetType, environment: v.environment, url: v.url, ownerId: v.ownerId, notes: v.notes };
  const changed = changedFields(b as unknown as Record<string, unknown>, next);
  if (changed.length === 0) back(path, "ok", "No changes to save.");
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.techAsset.updateMany({ where: { id: b.id, updatedAt: b.updatedAt }, data: { ...next, nameKey: v.nameKey } });
      if (res.count !== 1) throw new Error("STALE");
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "asset.update", resourceType: "tech-asset", resourceId: b.id, outcome: "success", metadata: { fields: changed } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") fail("This asset was changed by someone else since you opened it. Reload and try again.");
    if (isUnique(e, "nameKey")) fail(DUPLICATE);
    console.error("updateAsset failed", e);
    fail("The changes could not be saved. Nothing was changed.");
  }
  revalidatePath("/assets");
  back(path, "ok", "Asset updated.");
}

export async function setAssetStatus(formData: FormData) {
  const user = await requireManager();
  const id = g(formData, "id");
  const to = g(formData, "to");
  const path = `/assets/${id}`;
  if (to !== "ACTIVE" && to !== "RETIRED") back(path, "error", "That action is not valid.");
  const a = await db.techAsset.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!a) back("/assets", "error", "That asset is not available.");
  if (a!.status === to) back(path, "ok", `This asset is already ${to === "ACTIVE" ? "active" : "retired"}.`);
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.techAsset.updateMany({ where: { id: a!.id, status: a!.status }, data: { status: to as "ACTIVE" | "RETIRED" } });
      if (res.count !== 1) throw new Error("STALE");
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: to === "ACTIVE" ? "asset.reactivate" : "asset.retire", resourceType: "tech-asset", resourceId: a!.id, outcome: "success" } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This asset changed since you opened it. Review it and try again.");
    console.error("setAssetStatus failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/assets");
  back(path, "ok", to === "ACTIVE" ? "Asset reactivated." : "Asset retired. It stays in the inventory.");
}
