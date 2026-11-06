"use server";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

const createSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  displayName: z.string().min(1).max(120),
  password: z.string().min(10, "Temporary password must be at least 10 characters").max(200),
  departmentId: z.string().min(1),
  isHead: z.boolean(),
});

export async function createUser(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    password: formData.get("password"),
    departmentId: formData.get("departmentId"),
    isHead: formData.get("isHead") === "on",
  });
  if (!parsed.success) return;
  const d = parsed.data;
  if (await db.user.findUnique({ where: { email: d.email } })) return;
  const user = await db.user.create({
    data: {
      email: d.email,
      displayName: d.displayName,
      passwordHash: await bcrypt.hash(d.password, 12),
      memberships: {
        create: { departmentId: d.departmentId, type: d.isHead ? "HEAD" : "MEMBER", isPrimary: true },
      },
    },
  });
  await db.auditEvent.create({
    data: { actorUserId: admin.id, action: "user.create", resourceType: "user", resourceId: user.id, outcome: "success" },
  });
  revalidatePath("/admin/users");
}

export async function setUserStatus(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id"));
  const status = formData.get("status") === "ACTIVE" ? "ACTIVE" : "DEACTIVATED";
  if (id === admin.id) return; // cannot lock yourself out
  await db.user.update({ where: { id }, data: { status } });
  await db.auditEvent.create({
    data: { actorUserId: admin.id, action: `user.${status.toLowerCase()}`, resourceType: "user", resourceId: id, outcome: "success" },
  });
  revalidatePath("/admin/users");
}
