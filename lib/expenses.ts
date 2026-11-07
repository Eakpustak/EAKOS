import type { Prisma } from "@prisma/client";

/**
 * Expense submission, approval and payment status (WORKFLOWS 8, PHASES 7). Pure: no DB, no session.
 * An ADMINISTRATIVE TRACKING workflow only. It is not accounting, tax, GST or payroll, and it moves no money.
 *
 * UNCONFIRMED by stakeholders:
 *  - Approver: a head of one of the submitter's departments (never the submitter); if there is none, a Management head.
 *    The approving department is fixed at submission, from stored memberships.
 *  - Payment status is set by the head of Finance & Administration, never for their own expense. Marking paid records that
 *    someone paid it; nothing here pays anything.
 *  - Visible to: the submitter, the approving department's heads, and the Finance head. The Administrator role and Management
 *    heads (as such) see nothing (RULES 2.3, 2.7; WORKFLOWS 10).
 *  - Evidence is a typed receipt reference (receipt number, invoice number, where the paper copy is). File attachments are NOT
 *    built in this slice.
 *  - Currencies are placeholders (all with two decimals). No conversion, no totals across currencies.
 */

export const FINANCE_SLUG = "finance-and-administration";
export const CURRENCIES = ["INR", "USD", "EUR", "GBP"] as const;
export const CATEGORIES = ["Travel", "Meals", "Software", "Equipment", "Office", "Other"] as const;
export const MAX_MINOR = 100_000_000; // 1,000,000.00
export const MAX_DESC = 500;
export const MAX_EVIDENCE = 300;
export const MIN_EVIDENCE = 3;
export const MAX_NOTE = 1000;
export const MAX_PAYREF = 200;
export const BACKDATE_DAYS = 90;

export const isCurrency = (v: string) => (CURRENCIES as readonly string[]).includes(v);
export const isCategory = (v: string) => (CATEGORIES as readonly string[]).includes(v);

export const EXPENSE_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Awaiting approval", APPROVED: "Approved, to be paid", REJECTED: "Rejected", CANCELLED: "Cancelled", PAID: "Paid",
};
export function expenseStatusLabel(s: string): string {
  return Object.prototype.hasOwnProperty.call(EXPENSE_STATUS_LABEL, s) ? EXPENSE_STATUS_LABEL[s] : s;
}

// ---- Money: integer minor units, never floats -------------------------------------------------------------

/** "1234.5" -> 123450. Accepts digits with an optional point and at most two decimals. No signs, commas, exponents or spaces. */
export function parseAmount(input: string): { ok: true; minor: number } | { ok: false; error: string } {
  const s = input.trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return { ok: false, error: "Enter the amount as a number with at most two decimals, for example 1250.50." };
  const [whole, frac = ""] = s.split(".");
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (minor <= 0) return { ok: false, error: "The amount must be more than zero." };
  if (minor > MAX_MINOR) return { ok: false, error: "The amount is above the 1,000,000.00 limit. Ask Finance to handle it directly." };
  return { ok: true, minor };
}
/** Integer arithmetic only. Grouping is applied to the whole part; the fraction is always two digits. */
export function formatMoney(minor: number, currency: string): string {
  const whole = Math.floor(minor / 100);
  const frac = String(minor % 100).padStart(2, "0");
  return `${currency} ${new Intl.NumberFormat("en-IN").format(whole)}.${frac}`;
}

// ---- Input ------------------------------------------------------------------------------------------------

const DAY = 86_400_000;
const re = /^\d{4}-\d{2}-\d{2}$/;
export function validateExpenseDate(s: string, todayStr: string): string | null {
  if (!re.test(s)) return "Choose the date of the expense.";
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return "The date is not valid.";
  const t = new Date(`${todayStr}T00:00:00.000Z`).getTime();
  if (d.getTime() > t) return "The expense date cannot be in the future.";
  if (d.getTime() < t - BACKDATE_DAYS * DAY) return `The expense is older than ${BACKDATE_DAYS} days. Ask Finance to handle it directly.`;
  return null;
}

export type ExpenseInput = { amount: string; currency: string; category: string; date: string; description: string; evidenceRef: string };
export type ExpenseOk = { ok: true; minor: number; currency: string; category: string; description: string; evidenceRef: string };
export function validateExpense(i: ExpenseInput, todayStr: string): ExpenseOk | { ok: false; error: string } {
  const amt = parseAmount(i.amount);
  if (!amt.ok) return amt;
  if (!isCurrency(i.currency)) return { ok: false, error: "Choose a currency." };
  if (!isCategory(i.category)) return { ok: false, error: "Choose a category." };
  const dateError = validateExpenseDate(i.date, todayStr);
  if (dateError) return { ok: false, error: dateError };
  const description = i.description.trim();
  if (!description) return { ok: false, error: "Say what the expense was for." };
  if (description.length > MAX_DESC) return { ok: false, error: `The description is longer than ${MAX_DESC} characters.` };
  const evidenceRef = i.evidenceRef.trim();
  if (evidenceRef.length < MIN_EVIDENCE) return { ok: false, error: "Give a receipt reference, for example a receipt number or where the paper receipt is kept." };
  if (evidenceRef.length > MAX_EVIDENCE) return { ok: false, error: `The receipt reference is longer than ${MAX_EVIDENCE} characters.` };
  return { ok: true, minor: amt.minor, currency: i.currency, category: i.category, description, evidenceRef };
}

// ---- Access -----------------------------------------------------------------------------------------------

export type ExpenseViewer = { id: string; memberships: { departmentId: string; type: string; department?: { slug: string } | null }[] };
export type ExpenseLike = { submittedById: string; approverDepartmentId: string; status: string };

export function isFinanceHead(u: ExpenseViewer): boolean {
  return u.memberships.some((m) => m.type === "HEAD" && m.department?.slug === FINANCE_SLUG);
}
function isApprover(u: ExpenseViewer, e: ExpenseLike): boolean {
  return e.submittedById !== u.id && u.memberships.some((m) => m.type === "HEAD" && m.departmentId === e.approverDepartmentId);
}
export function canViewExpense(u: ExpenseViewer, e: ExpenseLike): boolean {
  return e.submittedById === u.id || isApprover(u, e) || isFinanceHead(u);
}
export type ExpenseView = "mine" | "review" | "pay" | "all";
export function expenseViews(u: ExpenseViewer): [ExpenseView, string][] {
  const heads = u.memberships.some((m) => m.type === "HEAD");
  const fin = isFinanceHead(u);
  return [["mine", "My expenses"], ...(heads ? [["review", "To approve"] as [ExpenseView, string]] : []), ...(fin ? [["pay", "To pay"] as [ExpenseView, string], ["all", "Everyone"] as [ExpenseView, string]] : [])];
}
export function expenseWhere(u: ExpenseViewer, view: string): Prisma.ExpenseWhereInput {
  const heads = u.memberships.filter((m) => m.type === "HEAD").map((m) => m.departmentId);
  if (view === "review" && heads.length) return { approverDepartmentId: { in: heads }, submittedById: { not: u.id }, status: "SUBMITTED" };
  if (view === "pay" && isFinanceHead(u)) return { status: "APPROVED", submittedById: { not: u.id } };
  if (view === "all" && isFinanceHead(u)) return {};
  return { submittedById: u.id };
}

// ---- State machine ----------------------------------------------------------------------------------------

export type ExpenseAction = "approve" | "reject" | "cancel" | "pay";
type Rule = { by: "approver" | "submitter" | "finance"; from: string; to: "APPROVED" | "REJECTED" | "CANCELLED" | "PAID"; needsNote: boolean };
const RULES: Record<ExpenseAction, Rule> = {
  approve: { by: "approver", from: "SUBMITTED", to: "APPROVED", needsNote: false },
  reject: { by: "approver", from: "SUBMITTED", to: "REJECTED", needsNote: true },
  cancel: { by: "submitter", from: "SUBMITTED", to: "CANCELLED", needsNote: false },
  pay: { by: "finance", from: "APPROVED", to: "PAID", needsNote: false },
};
export type ExpenseDecision =
  | { ok: true; to: Rule["to"]; note: string | null }
  | { ok: false; code: "FORBIDDEN" | "INVALID_STATE" | "NOTE_REQUIRED" | "ALREADY_DONE"; message: string };

export function decideExpense(u: ExpenseViewer, e: ExpenseLike, action: string, note: string | null | undefined): ExpenseDecision {
  const rule = Object.prototype.hasOwnProperty.call(RULES, action) ? RULES[action as ExpenseAction] : undefined;
  if (!rule) return { ok: false, code: "INVALID_STATE", message: "That action is not valid." };
  const allowed = rule.by === "submitter" ? e.submittedById === u.id : rule.by === "approver" ? isApprover(u, e) : isFinanceHead(u) && e.submittedById !== u.id;
  if (!allowed) {
    const message = rule.by === "submitter" ? "Only the person who submitted the expense can cancel it."
      : rule.by === "approver" ? "Only a head of the approving department can decide this, and never on their own expense."
      : "Only the Finance head can record payment, and never for their own expense.";
    return { ok: false, code: "FORBIDDEN", message };
  }
  if (e.status === rule.to) return { ok: false, code: "ALREADY_DONE", message: `This expense is already ${expenseStatusLabel(rule.to).toLowerCase()}.` };
  if (e.status !== rule.from) return { ok: false, code: "INVALID_STATE", message: `This can't be done while the expense is "${expenseStatusLabel(e.status).toLowerCase()}".` };
  const text = (note ?? "").trim();
  if (rule.needsNote && !text) return { ok: false, code: "NOTE_REQUIRED", message: "Give a reason for rejecting." };
  const max = action === "pay" ? MAX_PAYREF : MAX_NOTE;
  if (text.length > max) return { ok: false, code: "NOTE_REQUIRED", message: `Text is too long (max ${max}).` };
  return { ok: true, to: rule.to, note: text || null };
}
export function availableExpenseActions(u: ExpenseViewer, e: ExpenseLike): ExpenseAction[] {
  return (["approve", "reject", "cancel", "pay"] as ExpenseAction[]).filter((a) => decideExpense(u, e, a, "x").ok);
}

/** Notification titles are generic: no amount, category or description. */
export const EXPENSE_NOTIFY: Record<ExpenseAction, { to: "submitter" | "approvers" | "finance"; title: string }> = {
  approve: { to: "submitter", title: "Your expense was approved" },
  reject: { to: "submitter", title: "Your expense was rejected" },
  cancel: { to: "approvers", title: "An expense was cancelled" },
  pay: { to: "submitter", title: "Your expense was marked as paid" },
};
export const EXPENSE_SUBMITTED_TITLE = "An expense needs your decision";
export const EXPENSE_TO_PAY_TITLE = "An approved expense is ready for payment";
