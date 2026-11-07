import type { Prisma } from "@prisma/client";
import { MAX_MINOR, MAX_NOTE, formatMoney, isCurrency, parseAmount, type ExpenseViewer } from "./expenses";
import { VENDOR_CATEGORIES, isOperationsHead } from "./vendors";

export { formatMoney };

/**
 * Internal purchase requests (PHASES 7 "Purchase requests and approvals", WORKFLOWS 7). Pure: no DB, no session.
 * An ADMINISTRATIVE TRACKING workflow. It is not procurement, accounting or payment: nothing is bought or paid by this app.
 *
 * UNCONFIRMED by stakeholders:
 *  - Approver: a head of one of the requester's departments (never the requester); if there is none, a Management head.
 *    The approving department is fixed at submission, from stored memberships (same rule as leave and expenses).
 *  - Ordering is done by the head of Operations (never for their own request). They must pick an ACTIVE vendor from the vendor
 *    register and give an order reference. The requester confirms receipt.
 *  - The amount is the ESTIMATED TOTAL for the whole quantity, in integer minor units. No spending limits, no budgets, no totals
 *    across currencies, no link to the expense register.
 *  - Visible to: the requester; the approving department's heads; and the Operations head, but only once the request is approved
 *    (a request nobody has approved is not yet Operations' business). Management heads as such, Finance, plain members and the
 *    Administrator role see nothing (RULES 2.3, 2.7).
 *  - Vendor contact details are NOT shown to the requester. Only the vendor's name is (the register itself stays restricted).
 */

export const CATEGORIES = VENDOR_CATEGORIES;
export const MIN_TITLE = 3, MAX_TITLE = 120, MAX_JUSTIFICATION = 1000, MAX_QTY = 10_000, MIN_ORDERREF = 3, MAX_ORDERREF = 200;
export const NEEDED_BY_MAX_DAYS = 365;

export const isCategory = (v: string) => (CATEGORIES as readonly string[]).includes(v);

export const PURCHASE_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Awaiting approval", APPROVED: "Approved, to be ordered", REJECTED: "Rejected", CANCELLED: "Cancelled", ORDERED: "Ordered", RECEIVED: "Received",
};
export function purchaseStatusLabel(s: string): string {
  return Object.prototype.hasOwnProperty.call(PURCHASE_STATUS_LABEL, s) ? PURCHASE_STATUS_LABEL[s] : s;
}

// ---- Input ------------------------------------------------------------------------------------------------

const DAY = 86_400_000;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
/** Optional. Empty is fine; otherwise today up to a year ahead. */
export function validateNeededBy(s: string, todayStr: string): string | null {
  if (!s) return null;
  if (!dateRe.test(s)) return "Choose a valid date.";
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return "The date is not valid.";
  const t = new Date(`${todayStr}T00:00:00.000Z`).getTime();
  if (d.getTime() < t) return "The date needed cannot be in the past.";
  if (d.getTime() > t + NEEDED_BY_MAX_DAYS * DAY) return `The date needed is more than ${NEEDED_BY_MAX_DAYS} days away.`;
  return null;
}

export type PurchaseInput = { title: string; justification: string; category: string; quantity: string; amount: string; currency: string; neededBy: string };
export type PurchaseOk = { ok: true; title: string; justification: string; category: string; quantity: number; estimatedMinor: number; currency: string; neededBy: string | null };

// eslint-disable-next-line no-control-regex
const BAD_CHARS = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

export function validatePurchase(i: PurchaseInput, todayStr: string): PurchaseOk | { ok: false; error: string } {
  const title = i.title.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (BAD_CHARS.test(i.title) || BAD_CHARS.test(i.justification.replace(/[\r\n\t]/g, ""))) return { ok: false, error: "Remove control or direction-override characters." };
  if (title.length < MIN_TITLE) return { ok: false, error: "Say what you want to buy." };
  if (title.length > MAX_TITLE) return { ok: false, error: `The item name is longer than ${MAX_TITLE} characters.` };
  const justification = i.justification.trim();
  if (!justification) return { ok: false, error: "Explain why this is needed." };
  if (justification.length > MAX_JUSTIFICATION) return { ok: false, error: `The reason is longer than ${MAX_JUSTIFICATION} characters.` };
  if (!isCategory(i.category)) return { ok: false, error: "Choose a category." };
  const q = i.quantity.trim();
  if (!/^\d{1,5}$/.test(q) || Number(q) < 1 || Number(q) > MAX_QTY) return { ok: false, error: `Quantity must be a whole number from 1 to ${MAX_QTY}.` };
  const amt = parseAmount(i.amount);
  if (!amt.ok) return amt;
  if (!isCurrency(i.currency)) return { ok: false, error: "Choose a currency." };
  const nb = validateNeededBy(i.neededBy.trim(), todayStr);
  if (nb) return { ok: false, error: nb };
  return { ok: true, title, justification, category: i.category, quantity: Number(q), estimatedMinor: amt.minor, currency: i.currency, neededBy: i.neededBy.trim() || null };
}
export { MAX_MINOR, MAX_NOTE };

// ---- Access -----------------------------------------------------------------------------------------------

export type PurchaseViewer = ExpenseViewer;
export type PurchaseLike = { requesterId: string; approverDepartmentId: string; status: string };

/** Statuses that are Operations' business: someone with authority has approved. */
export const OPERATIONS_STATUSES = ["APPROVED", "ORDERED", "RECEIVED"] as const;
const isOpsStatus = (s: string) => (OPERATIONS_STATUSES as readonly string[]).includes(s);

function isApprover(u: PurchaseViewer, p: PurchaseLike): boolean {
  return p.requesterId !== u.id && u.memberships.some((m) => m.type === "HEAD" && m.departmentId === p.approverDepartmentId);
}
function isOrderer(u: PurchaseViewer, p: PurchaseLike): boolean {
  return p.requesterId !== u.id && isOperationsHead(u);
}
export function canViewPurchase(u: PurchaseViewer, p: PurchaseLike): boolean {
  return p.requesterId === u.id || isApprover(u, p) || (isOrderer(u, p) && isOpsStatus(p.status));
}

export type PurchaseView = "mine" | "review" | "order" | "all";
export function purchaseViews(u: PurchaseViewer): [PurchaseView, string][] {
  const heads = u.memberships.some((m) => m.type === "HEAD");
  const ops = isOperationsHead(u);
  const out: [PurchaseView, string][] = [["mine", "My requests"]];
  if (heads) out.push(["review", "To approve"]);
  if (ops) out.push(["order", "To order"], ["all", "Approved requests"]);
  return out;
}
export function purchaseWhere(u: PurchaseViewer, view: string): Prisma.PurchaseRequestWhereInput {
  const heads = u.memberships.filter((m) => m.type === "HEAD").map((m) => m.departmentId);
  if (view === "review" && heads.length) return { approverDepartmentId: { in: heads }, requesterId: { not: u.id }, status: "SUBMITTED" };
  if (view === "order" && isOperationsHead(u)) return { status: "APPROVED", requesterId: { not: u.id } };
  if (view === "all" && isOperationsHead(u)) return { status: { in: [...OPERATIONS_STATUSES] }, requesterId: { not: u.id } };
  return { requesterId: u.id };
}

// ---- State machine ----------------------------------------------------------------------------------------

export type PurchaseAction = "approve" | "reject" | "cancel" | "order" | "receive";
type To = "APPROVED" | "REJECTED" | "CANCELLED" | "ORDERED" | "RECEIVED";
type Rule = { by: "approver" | "requester" | "operations"; from: readonly string[]; to: To; text: "none" | "optional" | "required" };
const RULES: Record<PurchaseAction, Rule> = {
  approve: { by: "approver", from: ["SUBMITTED"], to: "APPROVED", text: "optional" },
  reject: { by: "approver", from: ["SUBMITTED"], to: "REJECTED", text: "required" },
  cancel: { by: "requester", from: ["SUBMITTED", "APPROVED"], to: "CANCELLED", text: "none" },
  order: { by: "operations", from: ["APPROVED"], to: "ORDERED", text: "required" }, // text = order reference
  receive: { by: "requester", from: ["ORDERED"], to: "RECEIVED", text: "none" },
};
export type PurchaseDecision =
  | { ok: true; to: To; text: string | null }
  | { ok: false; code: "FORBIDDEN" | "INVALID_STATE" | "TEXT_REQUIRED" | "ALREADY_DONE"; message: string };

export function decidePurchase(u: PurchaseViewer, p: PurchaseLike, action: string, text: string | null | undefined): PurchaseDecision {
  const rule = Object.prototype.hasOwnProperty.call(RULES, action) ? RULES[action as PurchaseAction] : undefined;
  if (!rule) return { ok: false, code: "INVALID_STATE", message: "That action is not valid." };
  const allowed = rule.by === "requester" ? p.requesterId === u.id : rule.by === "approver" ? isApprover(u, p) : isOrderer(u, p);
  if (!allowed) {
    const message = rule.by === "requester" ? "Only the person who made the request can do this."
      : rule.by === "approver" ? "Only a head of the approving department can decide this, and never on their own request."
      : "Only the Operations head can record the order, and never for their own request.";
    return { ok: false, code: "FORBIDDEN", message };
  }
  if (p.status === rule.to) return { ok: false, code: "ALREADY_DONE", message: `This request is already ${purchaseStatusLabel(rule.to).toLowerCase()}.` };
  if (!rule.from.includes(p.status)) return { ok: false, code: "INVALID_STATE", message: `This can't be done while the request is "${purchaseStatusLabel(p.status).toLowerCase()}".` };
  const t = (text ?? "").trim();
  if (rule.text === "required" && !t) return { ok: false, code: "TEXT_REQUIRED", message: action === "order" ? "Give the order reference, for example a purchase order or order number." : "Give a reason for rejecting." };
  if (action === "order" && t.length < MIN_ORDERREF) return { ok: false, code: "TEXT_REQUIRED", message: `The order reference must be at least ${MIN_ORDERREF} characters.` };
  const max = action === "order" ? MAX_ORDERREF : MAX_NOTE;
  if (t.length > max) return { ok: false, code: "TEXT_REQUIRED", message: `Text is too long (max ${max}).` };
  return { ok: true, to: rule.to, text: rule.text === "none" ? null : t || null };
}
export function availablePurchaseActions(u: PurchaseViewer, p: PurchaseLike): PurchaseAction[] {
  return (["approve", "reject", "cancel", "order", "receive"] as PurchaseAction[]).filter((a) => decidePurchase(u, p, a, "xxx").ok);
}

/** An order may only name a vendor that exists and is active. Pure so the rule is tested. */
export function vendorUsable(v: { status: string } | null | undefined): boolean {
  return !!v && v.status === "ACTIVE";
}

/** Notification titles are generic: no item, amount, vendor or reason. */
export const PURCHASE_NOTIFY: Record<PurchaseAction, { to: "requester" | "approvers"; title: string }> = {
  approve: { to: "requester", title: "Your purchase request was approved" },
  reject: { to: "requester", title: "Your purchase request was rejected" },
  cancel: { to: "approvers", title: "A purchase request was cancelled" },
  order: { to: "requester", title: "Your purchase was ordered" },
  receive: { to: "approvers", title: "A purchase was marked as received" },
};
export const PURCHASE_SUBMITTED_TITLE = "A purchase request needs your decision";
export const PURCHASE_TO_ORDER_TITLE = "An approved purchase request is ready to order";
