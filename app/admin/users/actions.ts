"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { validatePassword } from "@/lib/account";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  const params = new URLSearchParams({ [kind]: msg, ...(keep ?? {}) });
  redirect(`/admin/users?${params.toString()}`);
}

const createSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").transform((s) => s.toLowerCase()),
  displayName: z.string().trim().min(1, "Full name is required").max(120, "Name is too long (max 120)"),
  password: z.string().min(10, "Temporary password must be at least 10 characters").max(200),
  departmentId: z.string().min(1, "Choose a department"),
  isHead: z.boolean(),
});

export async function createUser(formData: FormData) {
  const admin = await requireAdmin();
  const raw = {
    email: String(formData.get("email") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    password: String(formData.get("password") ?? ""),
    departmentId: String(formData.get("departmentId") ?? ""),
    isHead: formData.get("isHead") === "on",
  };
  // Preserve non-secret input on a validation error so the admin isn't retyping everything.
  const keep = { email: raw.email, displayName: raw.displayName, departmentId: raw.departmentId };
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) back("error", parsed.error.issues[0].message, keep);
  const d = parsed.data;
  const weak = validatePassword(d.password, { email: d.email, displayName: d.displayName });
  if (weak) back("error", weak.replace("Password", "Temporary password"), keep);

  if (await db.user.findUnique({ where: { email: d.email } })) {
    back("error", "A person with that email already exists.", keep);
  }

  let created: { id: string; displayName: string };
  try {
    created = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: d.email,
          displayName: d.displayName,
          passwordHash: await bcrypt.hash(d.password, 12),
          mustChangePassword: true,
          memberships: {
            create: { departmentId: d.departmentId, type: d.isHead ? "HEAD" : "MEMBER", isPrimary: true },
          },
        },
      });
      await tx.auditEvent.create({
        data: { actorUserId: admin.id, action: "user.create", resourceType: "user", resourceId: u.id, outcome: "success" },
      });
      return u;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      back("error", "A person with that email already exists.", keep);
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      back("error", "That department no longer exists.", keep);
    }
    console.error("createUser failed", e);
    back("error", "The person could not be added. Nothing was created; please try again.", keep);
  }
  revalidatePath("/admin/users");
  back("ok", `${created.displayName} was added.`);
}

export async function setUserStatus(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = formData.get("status") === "ACTIVE" ? "ACTIVE" : "DEACTIVATED";
  if (!id) back("error", "Choose a person first.");
  if (id === admin.id) back("error", "You cannot deactivate your own account.");

  const existing = await db.user.findUnique({ where: { id }, select: { displayName: true } });
  if (!existing) back("error", "That person no longer exists.");

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status } });
      await tx.auditEvent.create({
        data: { actorUserId: admin.id, action: `user.${status.toLowerCase()}`, resourceType: "user", resourceId: id, outcome: "success" },
      });
    });
  } catch (e) {
    console.error("setUserStatus failed", e);
    back("error", "The status could not be changed. Nothing was changed.");
  }
  revalidatePath("/admin/users");
  back("ok", `${existing.displayName} was ${status === "ACTIVE" ? "reactivated" : "deactivated"}.`);
}

/**
 * Admin sets a new TEMPORARY password for someone else (there is no email, so this is the
 * "forgot password" path). It ends all of that person's sign-ins and forces them to choose their own
 * password at the next sign-in. Audited. An admin changes their own password in /settings instead.
 */
export async function resetUserPassword(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!id) back("error", "Choose a person first.");
  if (id === admin.id) back("error", "Change your own password in Account settings.");

  const target = await db.user.findUnique({ where: { id }, select: { displayName: true, email: true } });
  if (!target) back("error", "That person no longer exists.");
  const weak = validatePassword(password, { email: target.email, displayName: target.displayName });
  if (weak) back("error", weak.replace("Password", "Temporary password"));

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: true },
      });
      await tx.auditEvent.create({
        data: { actorUserId: admin.id, action: "user.password_reset", resourceType: "user", resourceId: id, outcome: "success" },
      });
    });
  } catch (e) {
    console.error("resetUserPassword failed", e);
    back("error", "The password could not be reset. Nothing was changed.");
  }
  revalidatePath("/admin/users");
  back("ok", `A temporary password was set for ${target.displayName}. Share it privately; they must choose a new one when they sign in.`);
}
