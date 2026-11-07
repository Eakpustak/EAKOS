"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayStr } from "@/lib/tasks";
import { MANAGEMENT_SLUG, chooseApproverDepartment } from "@/lib/leave";
import {
  EXPENSE_NOTIFY, EXPENSE_SUBMITTED_TITLE, EXPENSE_TO_PAY_TITLE, FINANCE_SLUG, canViewExpense, decideExpense, formatMoney, validateExpense,
  type ExpenseAction,
} from "@/lib/expenses";

/** Redirect back with a message. Never call inside try/catch (redirect throws). */
function back(path: string, kind: "error" | "ok", msg: string, keep?: Record<string, string>): never {
  redirect(`${path}?${new URLSearchParams({ [kind]: msg, ...(keep ?? {}) }).toString()}`);
}
const g = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function submitExpense(formData: FormData) {
  const user = await requireUser();
  const raw = { amount: g(formData, "amount"), currency: g(formData, "currency"), category: g(formData, "category"), date: g(formData, "date"), description: g(formData, "description"), evidenceRef: g(formData, "evidenceRef"), clientToken: g(formData, "clientToken") };
  const fail = (m: string): never => back("/expenses/new", "error", m, raw);

  if (raw.clientToken.length < 8 || raw.clientToken.length > 80) fail("Could not submit the form. Reload and try again.");
  const dup = await db.expense.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, submittedById: true } });
  if (dup) {
    if (dup.submittedById !== user.id) fail("Could not submit the form.");
    redirect(`/expenses/${dup.id}`);
  }
  const v = validateExpense(raw, todayStr());
  if (!v.ok) return fail(v.error);

  // Approver and payer must exist now, so an expense is never submitted that nobody can decide or pay.
  const deptIds = user.memberships.map((m) => m.departmentId);
  const mgmt = await db.department.findUnique({ where: { slug: MANAGEMENT_SLUG }, select: { id: true } });
  const headRows = await db.departmentMembership.findMany({
    where: { type: "HEAD", departmentId: { in: [...deptIds, ...(mgmt ? [mgmt.id] : [])] }, user: { status: "ACTIVE" } },
    select: { departmentId: true, userId: true },
  });
  const headsByDept: Record<string, string[]> = {};
  for (const h of headRows) (headsByDept[h.departmentId] ??= []).push(h.userId);
  const approverDepartmentId = chooseApproverDepartment(user.id, deptIds, headsByDept, mgmt?.id ?? null);
  if (!approverDepartmentId) fail("There is nobody who can approve this yet. Ask an administrator to assign a department head.");
  const financeHeads = await db.departmentMembership.findMany({
    where: { type: "HEAD", department: { slug: FINANCE_SLUG }, user: { status: "ACTIVE" }, userId: { not: user.id } }, select: { userId: true },
  });
  if (financeHeads.length === 0) fail("There is nobody in Finance who could record payment yet. Ask an administrator to assign a Finance head.");

  const approvers = (headsByDept[approverDepartmentId!] ?? []).filter((id) => id !== user.id);
  let id: string;
  try {
    const created = await db.$transaction(async (tx) => {
      const x = await tx.expense.create({
        data: {
          submittedById: user.id, amountMinor: v.minor, currency: v.currency, category: v.category, expenseDate: new Date(`${raw.date}T00:00:00.000Z`),
          description: v.description, evidenceRef: v.evidenceRef, approverDepartmentId: approverDepartmentId!, clientToken: raw.clientToken,
        },
      });
      await tx.expenseEvent.create({ data: { expenseId: x.id, actorId: user.id, action: "submit", toStatus: "SUBMITTED" } });
      for (const uid of approvers) await tx.notification.create({ data: { userId: uid, type: "expense.submitted", title: EXPENSE_SUBMITTED_TITLE, expenseId: x.id } });
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: "expense.submit", resourceType: "expense", resourceId: x.id, outcome: "success", metadata: { amountMinor: v.minor, currency: v.currency } } });
      return x;
    });
    id = created.id;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await db.expense.findUnique({ where: { clientToken: raw.clientToken }, select: { id: true, submittedById: true } });
      if (again && again.submittedById === user.id) redirect(`/expenses/${again.id}`);
    }
    console.error("submitExpense failed", e);
    fail("The expense could not be saved. Nothing was sent; please try again.");
  }
  revalidatePath("/expenses");
  redirect(`/expenses/${id!}`);
}

const SUCCESS: Record<ExpenseAction, string> = {
  approve: "Expense approved. Finance has been told it is ready for payment.",
  reject: "Expense rejected. The submitter has been notified.",
  cancel: "Expense cancelled.",
  pay: "Marked as paid. The submitter has been notified.",
};

/** One entry point for approve, reject, cancel and pay. Roles come from stored data; the write is status-guarded. */
export async function actOnExpense(formData: FormData) {
  const user = await requireUser();
  const id = g(formData, "expenseId");
  const action = g(formData, "action");
  const path = `/expenses/${id}`;

  const x = await db.expense.findUnique({ where: { id } });
  // Same reply for missing and forbidden so IDs cannot be probed.
  if (!x || !canViewExpense(user, x)) redirect("/expenses");

  const dec = decideExpense(user, x, action, g(formData, "text"));
  if (!dec.ok) back(path, dec.code === "ALREADY_DONE" ? "ok" : "error", dec.message);
  const ok = dec as Extract<typeof dec, { ok: true }>;
  const act = action as ExpenseAction;
  const notify = EXPENSE_NOTIFY[act];

  try {
    await db.$transaction(async (tx) => {
      const now = new Date();
      const data: Prisma.ExpenseUncheckedUpdateManyInput =
        act === "approve" || act === "reject" ? { status: ok.to, decidedById: user.id, decidedAt: now, decisionNote: ok.note }
        : act === "pay" ? { status: ok.to, paidById: user.id, paidAt: now, paymentRef: ok.note }
        : { status: ok.to };
      // Status-guarded: if someone else got there first, nothing is written.
      const res = await tx.expense.updateMany({ where: { id: x.id, status: x.status }, data });
      if (res.count !== 1) throw new Error("STALE");
      await tx.expenseEvent.create({ data: { expenseId: x.id, actorId: user.id, action: act, fromStatus: x.status, toStatus: ok.to, comment: act === "pay" ? null : ok.note } });
      const targets = notify.to === "submitter" ? [x.submittedById]
        : (await tx.departmentMembership.findMany({ where: { type: "HEAD", departmentId: x.approverDepartmentId, userId: { not: x.submittedById }, user: { status: "ACTIVE" } }, select: { userId: true } })).map((t) => t.userId);
      for (const uid of targets) await tx.notification.create({ data: { userId: uid, type: `expense.${act}`, title: notify.title, expenseId: x.id } });
      if (act === "approve") {
        const fin = await tx.departmentMembership.findMany({ where: { type: "HEAD", department: { slug: FINANCE_SLUG }, userId: { not: x.submittedById }, user: { status: "ACTIVE" } }, select: { userId: true } });
        for (const f of fin) await tx.notification.create({ data: { userId: f.userId, type: "expense.to_pay", title: EXPENSE_TO_PAY_TITLE, expenseId: x.id } });
      }
      await tx.auditEvent.create({ data: { actorUserId: user.id, action: `expense.${act}`, resourceType: "expense", resourceId: x.id, outcome: "success", metadata: { from: x.status, to: ok.to, amount: formatMoney(x.amountMinor, x.currency) } } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "STALE") back(path, "error", "This expense changed since you opened it. Review it and try again.");
    console.error("actOnExpense failed", e);
    back(path, "error", "That could not be saved. Nothing was changed.");
  }
  revalidatePath("/expenses");
  back(path, "ok", SUCCESS[act]);
}
