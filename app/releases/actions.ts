"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canCreateRelease, canViewReleases, decideRelease, validateRelease } from "@/lib/releases";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams({ [kind]: msg, ...(keep ?? {}) }).toString()}`);
}
const g = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function createRelease(formData: FormData) {
  const user = await requireUser();
  if (!canCreateRelease(user)) redirect("/");
  const raw = { version: g(formData, "version"), summary: g(formData, "summary"), assetId: g(formData, "assetId"), commitRef: g(formData, "commitRef"), changeUrl: g(formData, "changeUrl"), clientToken: g(formData, "clientToken") };
  // The summary is not echoed back: it may be long and may hold what the user should not have typed.
  const fail = (m: string): never => back("/releases/new", "error", m, { version: raw.version, assetId: raw.assetId, commitRef: raw.commitRef, clientToken: raw.clientToken });
  if (raw.clientToken.length < 8 || raw.clientToken.length > 80) fail("Could not submit the form. Reload and try again.");
  const dup = await db.release.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, creatorId: true } });
  if (dup) {
    if (dup.creatorId !== user.id) fail("Could not submit the form.");
    redirect(`/releases/${dup.id}`);
  }
  const v = validateRelease(raw);
  if (!v.ok) return fail(v.error);
  // The asset and its environment are looked up here, never taken from the form.
  const asset = await db.techAsset.findUnique({ where: { id: v.assetId }, select: { status: true, environment: true } });
  if (!asset || asset.status !== "ACTIVE") fail("Choose an active asset.");
  const environment = asset!.environment;
  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const x = await tx.release.create({ data: { version: v.version, summary: v.summary, assetId: v.assetId, environment, commitRef: v.commitRef, changeUrl: v.changeUrl, creatorId: user.id, clientToken: raw.clientToken } });
      await tx.releaseEvent.create({ data: { releaseId: x.id, actorId: user.id, action: "plan", toStatus: "PLANNED" } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "release.plan", resourceType: "release", resourceId: x.id, outcome: "success", metadata: { environment } } });
      return x.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.release.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, creatorId: true } });
      if (again && again.creatorId === user.id) redirect(`/releases/${again.id}`);
    }
    console.error("createRelease failed", e);
    fail("The release could not be saved. Nothing was recorded; please try again.");
  }
  revalidatePath("/releases");
  redirect(`/releases/${id!}`);
}

const SUCCESS: Record<string, string> = { deploy: "Recorded as deployed.", fail: "Recorded as failed.", cancel: "Release cancelled.", rollback: "Recorded as rolled back.", note: "Note added." };

/** deploy, fail, cancel, rollback and note. Roles come from stored data; status changes are status-guarded. */
export async function actOnRelease(formData: FormData) {
  const user = await requireUser();
  const id = g(formData, "releaseId");
  const action = g(formData, "action");
  const path = `/releases/${id}`;
  const x = await db.release.findUnique({ where: { id }, select: { id: true, status: true, creatorId: true } });
  // Same reply for missing and forbidden so IDs cannot be probed.
  if (!x || !canViewReleases(user)) redirect("/releases");
  const dec = decideRelease(user, x, action, g(formData, "text"));
  if (!dec.ok) back(path, "error", dec.message);
  const ok = dec as Extract<typeof dec, { ok: true }>;

  try {
    await db.$transaction(async (tx) => {
      if (action !== "note") {
        const data: Prisma.ReleaseUncheckedUpdateManyInput = { status: ok.to as "DEPLOYED" | "FAILED" | "CANCELLED" | "ROLLED_BACK" };
        if (action === "deploy") { data.deployedAt = new Date(); data.deployerId = user.id; data.outcomeNote = ok.text; }
        else data.outcomeNote = ok.text;
        const res = await tx.release.updateMany({ where: { id: x.id, status: x.status }, data });
        if (res.count !== 1) throw new Error("STALE");
      }
      await tx.releaseEvent.create({ data: { releaseId: x.id, actorId: user.id, action, fromStatus: x.status, toStatus: ok.to, comment: ok.text } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: `release.${action}`, resourceType: "release", resourceId: x.id, outcome: "success" } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This release changed since you opened it. Review it and try again.");
    console.error("actOnRelease failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/releases");
  back(path, "ok", SUCCESS[action]);
}
