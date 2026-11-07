"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  CONTENT_ACTION_DONE, CONTENT_TYPES, MAX_BODY, MAX_TITLE, canAuthor, canEditItem, canPublishTo,
  decideContentAction, parseAudience, safeHttpUrl, type ContentAction,
} from "@/lib/hub";
import { techContentSecretProblem } from "@/lib/assets";

export type SaveResult = { error: string } | undefined;

const schema = z.object({
  type: z.enum(CONTENT_TYPES),
  title: z.string().trim().min(1, "Title is required").max(MAX_TITLE, `Title is too long (max ${MAX_TITLE})`),
  body: z.string().max(MAX_BODY, `Text is too long (max ${MAX_BODY} characters)`),
  resourceUrl: z.string().optional(),
  scope: z.string(),
  clientToken: z.string().min(8).max(80),
});

/**
 * Create a draft (no `contentId`) or edit an item. Returns `{ error }` instead of redirecting on a
 * validation failure so the client form keeps everything the user typed (RULES 4). On success it
 * redirects, so success is never shown for a write that did not happen.
 */
export async function saveContent(formData: FormData): Promise<SaveResult> {
  const user = await requireUser();
  if (!canAuthor(user)) redirect("/hub");

  const contentId = String(formData.get("contentId") ?? "");
  const editing = contentId !== "";
  const raw = {
    type: String(formData.get("type") ?? ""),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    resourceUrl: String(formData.get("resourceUrl") ?? ""),
    scope: String(formData.get("scope") ?? ""),
    clientToken: String(formData.get("clientToken") ?? ""),
  };
  const deptInput = formData.getAll("departmentIds").map(String);

  let existing: Awaited<ReturnType<typeof loadItem>> = null;
  if (editing) {
    existing = await loadItem(contentId);
    // Same reply for missing and forbidden so IDs cannot be probed.
    if (!existing || !canEditItem(user, toHubItem(existing))) redirect("/hub");
    raw.type = existing!.type; // type is fixed once created
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const body = d.body.replace(/\r\n?/g, "\n").trim();

  if (d.type !== "RESOURCE" && !body) return { error: "Write the content before saving." };
  let resourceUrl: string | null = null;
  if (d.type === "RESOURCE") {
    resourceUrl = safeHttpUrl(d.resourceUrl ?? "");
    if (!resourceUrl) return { error: "Enter a full web address starting with http:// or https://." };
  }

  const audience = parseAudience(d.scope, deptInput);
  if (!audience) return { error: "Choose who can see this: everyone, or at least one department." };
  if (audience.scope === "DEPARTMENTS") {
    const found = await db.department.findMany({ where: { id: { in: audience.departmentIds } }, select: { slug: true } });
    if (found.length !== audience.departmentIds.length) return { error: "One of the chosen departments does not exist." };
    // Technical SOPs: refuse obvious secrets in content addressed to Technology (slugs come from the DB, not the form).
    const secret = techContentSecretProblem({ scope: audience.scope, departmentSlugs: found.map((f) => f.slug) }, d.title, body);
    if (secret) return { error: secret };
  }
  // Authors may only address audiences they could publish to themselves.
  if (!canPublishTo(user, audience.scope, audience.departmentIds)) {
    return { error: "You can only address content to everyone if you are an administrator or the head of Management, or to departments you head." };
  }

  if (!editing) {
    const dup = await db.contentItem.findUnique({ where: { clientToken: d.clientToken } });
    if (dup) {
      if (dup.authorId !== user.id) return { error: "Could not save." };
      redirect(`/hub/${dup.id}`);
    }
    let id: string;
    try {
      const created = await db.$transaction(async (tx) => {
        const c = await tx.contentItem.create({
          data: {
            type: d.type, title: d.title, body, resourceUrl, status: "DRAFT",
            audienceScope: audience.scope, authorId: user.id, clientToken: d.clientToken,
            audiences: { create: audience.departmentIds.map((departmentId) => ({ departmentId })) },
          },
        });
        await tx.contentVersion.create({
          data: { contentId: c.id, version: 1, title: d.title, body, resourceUrl, editedById: user.id },
        });
        await tx.auditEvent.create({
          data: { actorUserId: user.id, action: "content.create", resourceType: "content", resourceId: c.id, outcome: "success" },
        });
        return c;
      });
      id = created.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const c = await db.contentItem.findUnique({ where: { clientToken: d.clientToken } });
        if (c && c.authorId === user.id) redirect(`/hub/${c.id}`);
      }
      console.error("saveContent(create) failed", e);
      return { error: "It could not be saved. Nothing was created; please try again." };
    }
    revalidatePath("/hub");
    redirect(`/hub/${id}`);
  }

  // ---- edit ----
  const ex = existing!;
  const postedVersion = Number.parseInt(String(formData.get("version") ?? ""), 10);
  if (postedVersion !== ex.version) {
    return { error: "Someone else changed this item since you opened it. Reload the page to see the latest version, then reapply your edit." };
  }
  const contentChanged = ex.title !== d.title || ex.body !== body || (ex.resourceUrl ?? null) !== resourceUrl;
  const oldIds = ex.audiences.map((a) => a.departmentId).sort();
  const newIds = [...audience.departmentIds].sort();
  const audienceChanged = ex.audienceScope !== audience.scope || oldIds.join("|") !== newIds.join("|");
  if (!contentChanged && !audienceChanged) redirect(`/hub/${ex.id}?ok=${encodeURIComponent("No changes to save.")}`);

  try {
    await db.$transaction(async (tx) => {
      const res = await tx.contentItem.updateMany({
        where: { id: ex.id, version: ex.version, status: ex.status },
        data: {
          title: d.title, body, resourceUrl, audienceScope: audience.scope,
          ...(contentChanged ? { version: { increment: 1 } } : {}),
        },
      });
      if (res.count !== 1) throw new Error("STALE");
      if (audienceChanged) {
        await tx.contentAudience.deleteMany({ where: { contentId: ex.id } });
        if (audience.departmentIds.length) {
          await tx.contentAudience.createMany({ data: audience.departmentIds.map((departmentId) => ({ contentId: ex.id, departmentId })) });
        }
      }
      if (contentChanged) {
        await tx.contentVersion.create({
          data: { contentId: ex.id, version: ex.version + 1, title: d.title, body, resourceUrl, editedById: user.id },
        });
      }
      await tx.auditEvent.create({
        data: {
          actorUserId: user.id, action: "content.edit", resourceType: "content", resourceId: ex.id, outcome: "success",
          metadata: { contentChanged, audienceChanged, status: ex.status },
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") {
      return { error: "This item changed since you opened it. Reload the page and try again." };
    }
    console.error("saveContent(edit) failed", e);
    return { error: "It could not be saved. Nothing was changed; please try again." };
  }
  revalidatePath("/hub");
  revalidatePath(`/hub/${ex.id}`);
  redirect(`/hub/${ex.id}?ok=${encodeURIComponent(contentChanged ? "Saved as a new version." : "Audience updated.")}`);
}

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string): never {
  redirect(`${path}?${new URLSearchParams({ [kind]: msg }).toString()}`);
}

/** Publish / unpublish / archive / restore. Authorisation comes from the stored audience, not the form. */
export async function actOnContent(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("contentId") ?? "");
  const action = String(formData.get("action") ?? "");
  const path = `/hub/${id}`;

  const item = await loadItem(id);
  if (!item) redirect("/hub");
  const hubItem = toHubItem(item);
  // A user who cannot manage the item gets the same reply as for a missing one.
  const dec = decideContentAction(user, hubItem, action);
  if (!dec.ok) {
    if (dec.code === "FORBIDDEN") redirect("/hub");
    if (dec.code === "ALREADY_DONE") back(path, "ok", dec.message);
    back(path, "error", dec.message);
  }
  const ok = dec as Extract<typeof dec, { ok: true }>;
  const act = action as ContentAction;

  // Audience members to tell on publish: active users in the audience, never the publisher.
  let recipients: string[] = [];
  if (act === "publish") {
    const users = await db.user.findMany({
      where: {
        status: "ACTIVE", id: { not: user.id },
        ...(item.audienceScope === "DEPARTMENTS"
          ? { memberships: { some: { departmentId: { in: item.audiences.map((a) => a.departmentId) } } } }
          : {}),
      },
      select: { id: true },
    });
    recipients = users.map((u) => u.id);
  }

  try {
    await db.$transaction(async (tx) => {
      const now = new Date();
      const res = await tx.contentItem.updateMany({
        where: { id: item.id, status: item.status },
        data: act === "publish"
          ? { status: ok.to, publisherId: user.id, publishedAt: now }
          : act === "unpublish" || act === "restore"
            ? { status: ok.to, publisherId: null, publishedAt: null }
            : { status: ok.to },
      });
      if (res.count !== 1) throw new Error("STALE");
      if (recipients.length) {
        await tx.notification.createMany({
          data: recipients.map((userId) => ({
            userId, type: "content.published", contentId: item.id,
            // Generic text only: the title is not shown in previews (RULES 3).
            title: item.type === "ANNOUNCEMENT" ? "New announcement" : "New company hub item",
          })),
        });
      }
      await tx.auditEvent.create({
        data: { actorUserId: user.id, action: `content.${ok.event}`, resourceType: "content", resourceId: item.id, outcome: "success" },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This item changed since you opened it. Review it and try again.");
    console.error("actOnContent failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/hub");
  revalidatePath(path);
  back(path, "ok", CONTENT_ACTION_DONE[act]);
}

// ---- helpers ------------------------------------------------------------------------------

function loadItem(id: string) {
  return db.contentItem.findUnique({ where: { id }, include: { audiences: { select: { departmentId: true } } } });
}
function toHubItem(i: NonNullable<Awaited<ReturnType<typeof loadItem>>>) {
  return {
    status: i.status, authorId: i.authorId, audienceScope: i.audienceScope,
    audienceDepartmentIds: i.audiences.map((a) => a.departmentId),
  };
}
