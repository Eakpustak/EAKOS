// Idempotent: seeds departments, and creates the first admin only if no users exist.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const departments = [
  "Management", "Technology", "Human Resources",
  "Sales & Marketing", "Operations", "Finance & Administration",
];
const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

for (const name of departments) {
  await db.department.upsert({ where: { slug: slug(name) }, update: {}, create: { name, slug: slug(name) } });
}

if ((await db.user.count()) === 0) {
  const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 10) {
    console.warn("[bootstrap] No users yet and ADMIN_EMAIL / ADMIN_PASSWORD (min 10 chars) not set; skipping admin creation.");
  } else {
    const mgmt = await db.department.findUnique({ where: { slug: "management" } });
    await db.user.create({
      data: {
        email, displayName: process.env.ADMIN_NAME || "Administrator",
        passwordHash: await bcrypt.hash(password, 12), systemRole: "ADMIN",
        memberships: { create: { departmentId: mgmt.id, type: "HEAD", isPrimary: true } },
      },
    });
    console.log(`[bootstrap] Created admin ${email}`);
  }
}
await db.$disconnect();
