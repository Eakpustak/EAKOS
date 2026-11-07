"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  attemptWindowStart, isLockedOut, parseDisplayName, validatePasswordChange,
} from "@/lib/account";

/** Redirect back with a message. Never call inside try/catch (redirect throws). Never carries a password. */
function back(kind: "error" | "ok", msg: string): never {
  redirect(`/settings?${new URLSearchParams({ [kind]: msg }).toString()}`);
}

/** Change your own display name. Email and department are set by an administrator. */
export async function updateProfile(formData: FormData) {
  const user = await requireUser({ allowPasswordChange: true });
  const parsed = parseDisplayName(String(formData.get("displayName") ?? ""));
  if ("error" in parsed) back("error", parsed.error);
  if (parsed.value === user.displayName) back("ok", "Nothing to change.");

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { displayName: parsed.value } });
      await tx.auditEvent.create({
        data: { actorUserId: user.id, action: "account.profile_update", resourceType: "user", resourceId: user.id, outcome: "success" },
      });
    });
  } catch (e) {
    console.error("updateProfile failed", e);
    back("error", "Your name could not be changed. Nothing was changed; please try again.");
  }
  revalidatePath("/", "layout");
  back("ok", "Your name was updated.");
}

/**
 * Change your own password. Needs the current password (a stolen open session alone is not enough),
 * is throttled after repeated wrong attempts, writes with a guard on the hash that was read (a change
 * made elsewhere in the meantime is reported, not overwritten), ends every existing sign-in including
 * this one, and is audited. Passwords are never put in a URL or an audit row.
 */
export async function changePassword(formData: FormData) {
  const user = await requireUser({ allowPasswordChange: true });
  const input = {
    current: String(formData.get("currentPassword") ?? ""),
    next: String(formData.get("newPassword") ?? ""),
    confirm: String(formData.get("confirmPassword") ?? ""),
  };

  const recentDenied = await db.auditEvent.count({
    where: { actorUserId: user.id, action: "account.password_change", outcome: "denied", createdAt: { gte: attemptWindowStart() } },
  });
  if (isLockedOut(recentDenied)) back("error", "Too many incorrect attempts. Wait 15 minutes and try again.");

  const problem = validatePasswordChange(input, { email: user.email, displayName: user.displayName });
  if (problem) back("error", problem);

  const correct = user.passwordHash ? await bcrypt.compare(input.current, user.passwordHash) : false;
  if (!correct) {
    await db.auditEvent.create({
      data: { actorUserId: user.id, action: "account.password_change", resourceType: "user", resourceId: user.id, outcome: "denied" },
    });
    back("error", "Your current password is not correct.");
  }

  const passwordHash = await bcrypt.hash(input.next, 12);
  let changed = 0;
  try {
    changed = await db.$transaction(async (tx) => {
      const res = await tx.user.updateMany({
        where: { id: user.id, passwordHash: user.passwordHash },
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
      });
      if (res.count === 1) {
        await tx.auditEvent.create({
          data: { actorUserId: user.id, action: "account.password_change", resourceType: "user", resourceId: user.id, outcome: "success" },
        });
      }
      return res.count;
    });
  } catch (e) {
    console.error("changePassword failed", e);
    back("error", "Your password could not be changed. Nothing was changed; please try again.");
  }
  if (changed !== 1) back("error", "Your password was changed somewhere else a moment ago. Reload and try again.");

  // Every sign-in that began before now (including this one) is stale from here on.
  redirect("/login?notice=password-changed");
}
