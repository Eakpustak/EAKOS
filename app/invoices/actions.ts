"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayStr } from "@/lib/tasks";
import { canManageRecords, decideRecord, validateRecord, vendorUsable, type RecordAction } from "@/lib/finance-records";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams({ [kind]: msg, ...(keep ?? {}) }).toString()}`);
}
const g = (f: FormData, k: string) => String(f.get(k) ?? "");
const DUPLICATE = "This vendor already has a record of that type with that number.";
const isUnique = (e: unknown, field: string) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && JSON.stringify(e.meta ?? {}).includes(field);

async function requireManager() {
  const user = await requireUser();
  if (!canManageRecords(user)) {
    await db.auditEvent.create({ data: { actorUserId: user.id, action: "record.write", resourceType: "finance-record", outcome: "denied" } });
    redirect("/");
  }
  return user;
}

export async function createRecord(formData: FormData) {
  const user = await requireManager();
  const raw = {
    kind: g(formData, "kind"), vendorId: g(formData, "vendorId"), reference: g(formData, "reference"), amount: g(formData, "amount"),
    currency: g(formData, "currency"), issueDate: g(formData, "issueDate"), dueDate: g(formData, "dueDate"), clientToken: g(formData, "clientToken"),
  };
  const fail = (m: string): never => back("/invoices/new", "error", m, raw);
  if (raw.clientToken.length < 8 || raw.clientToken.length > 80) fail("Could not submit the form. Reload and try again.");
  const dup = await db.financeRecord.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, createdById: true } });
  if (dup) {
    if (dup.createdById !== user.id) fail("Could not submit the form.");
    redirect(`/invoices/${dup.id}`);
  }
  const v = validateRecord(raw, todayStr());
  if (!v.ok) return fail(v.error);

  // The vendor is looked up server-side; the form only carries an id.
  const vendor = await db.vendor.findUnique({ where: { id: v.vendorId }, select: { id: true, status: true } });
  if (!vendorUsable(vendor)) fail("Choose an active vendor from the register.");
  if (await db.financeRecord.findUnique({ where: { vendorId_kind_referenceKey: { vendorId: v.vendorId, kind: v.kind, referenceKey: v.referenceKey } }, select: { id: true } })) fail(DUPLICATE);

  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const x = await tx.financeRecord.create({
        data: {
          kind: v.kind, vendorId: v.vendorId, reference: v.reference, referenceKey: v.referenceKey, amountMinor: v.amountMinor, currency: v.currency,
          issueDate: new Date(`${v.issueDate}T00:00:00.000Z`), dueDate: v.dueDate ? new Date(`${v.dueDate}T00:00:00.000Z`) : null,
          createdById: user.id, clientToken: raw.clientToken,
        },
      });
      await tx.financeRecordEvent.create({ data: { recordId: x.id, actorId: user.id, action: "create", toStatus: "OPEN" } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "record.create", resourceType: "finance-record", resourceId: x.id, outcome: "success", metadata: { kind: v.kind, amountMinor: v.amountMinor, currency: v.currency } } });
      return x.id;
    });
  } catch (e) {
    if (isUnique(e, "referenceKey")) fail(DUPLICATE);
    if (isUnique(e, "clientToken")) {
      const again = await db.financeRecord.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, createdById: true } });
      if (again && again.createdById === user.id) redirect(`/invoices/${again.id}`);
    }
    console.error("createRecord failed", e);
    fail("The record could not be saved. Nothing was added; please try again.");
  }
  revalidatePath("/invoices");
  redirect(`/invoices/${id!}`);
}

const SUCCESS: Record<RecordAction, string> = {
  pay: "Marked as paid.", accept: "Quotation accepted.", decline: "Quotation declined.", void: "Record voided. It stays in the register.",
};
const AUDIT: Record<RecordAction, string> = { pay: "record.pay", accept: "record.accept", decline: "record.decline", void: "record.void" };

/** One entry point for pay, accept, decline and void. The write is guarded on the status that was read. */
export async function actOnRecord(formData: FormData) {
  const user = await requireManager();
  const id = g(formData, "recordId");
  const action = g(formData, "action");
  const path = `/invoices/${id}`;

  const r = await db.financeRecord.findUnique({ where: { id }, select: { id: true, kind: true, status: true } });
  if (!r) back("/invoices", "error", "That record is not available.");
  const rec = r!;
  const dec = decideRecord(user, rec, action, g(formData, "text"));
  if (!dec.ok) back(path, dec.code === "ALREADY_DONE" ? "ok" : "error", dec.message);
  const ok = dec as Extract<typeof dec, { ok: true }>;

  const now = new Date();
  const data: Prisma.FinanceRecordUncheckedUpdateManyInput = { status: ok.to as "PAID" | "ACCEPTED" | "DECLINED" | "VOID", settledAt: now, settledById: user.id };
  if (action === "pay") { data.paidAt = now; data.paymentRef = ok.text; } else if (ok.text) data.note = ok.text;

  try {
    await db.$transaction(async (tx) => {
      const res = await tx.financeRecord.updateMany({ where: { id: rec.id, status: rec.status }, data });
      if (res.count !== 1) throw new Error("STALE");
      await tx.financeRecordEvent.create({ data: { recordId: rec.id, actorId: user.id, action, fromStatus: rec.status, toStatus: ok.to, comment: action === "pay" ? null : ok.text } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: AUDIT[action as RecordAction], resourceType: "finance-record", resourceId: rec.id, outcome: "success" } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This record changed since you opened it. Review it and try again.");
    console.error("actOnRecord failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/invoices");
  back(path, "ok", SUCCESS[action as RecordAction]);
}
