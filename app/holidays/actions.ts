"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageHolidays, validateHoliday } from "@/lib/holidays";

function back(kind: "error" | "ok", msg: string, year?: string): never {
  const p = new URLSearchParams({ [kind]: msg, ...(year ? { year } : {}) });
  redirect(`/holidays?${p.toString()}`);
}

export async function addHoliday(formData: FormData) {
  const user = await requireUser();
  if (!canManageHolidays(user)) back("error", "Only the HR head can change the holiday calendar.");
  const name = String(formData.get("name") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const err = validateHoliday(name, date);
  if (err) back("error", err, date.slice(0, 4));
  try {
    await db.$transaction(async (tx) => {
      const h = await tx.holiday.create({ data: { name, date: new Date(`${date}T00:00:00.000Z`), createdById: user.id } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "holiday.add", resourceType: "holiday", resourceId: h.id, outcome: "success", metadata: { date } } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") back("error", "There is already a holiday on that date.", date.slice(0, 4));
    console.error("addHoliday failed", e);
    back("error", "The holiday could not be saved. Nothing was changed.", date.slice(0, 4));
  }
  revalidatePath("/holidays");
  revalidatePath("/leave/new");
  back("ok", `${name} added.`, date.slice(0, 4));
}

export async function removeHoliday(formData: FormData) {
  const user = await requireUser();
  if (!canManageHolidays(user)) back("error", "Only the HR head can change the holiday calendar.");
  const id = String(formData.get("id") ?? "");
  const h = await db.holiday.findUnique({ where: { id } });
  if (!h) back("ok", "That holiday was already removed.");
  try {
    await db.$transaction(async (tx) => {
      const res = await tx.holiday.deleteMany({ where: { id } });
      if (res.count === 1) {
        await tx.auditEvent.create({ data: { actorUserId: user.id, action: "holiday.remove", resourceType: "holiday", resourceId: id, outcome: "success", metadata: { date: h!.date.toISOString().slice(0, 10), name: h!.name } } });
      }
    });
  } catch (e) {
    console.error("removeHoliday failed", e);
    back("error", "That could not be removed. Nothing was changed.");
  }
  revalidatePath("/holidays");
  revalidatePath("/leave/new");
  back("ok", "Holiday removed.", h!.date.toISOString().slice(0, 4));
}
