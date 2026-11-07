import { MAX_NOTE, MAX_PAYREF, formatMoney, isCurrency, isFinanceHead, parseAmount, type ExpenseViewer } from "./expenses";
import { canViewVendors, vendorNameKey } from "./vendors";

export { formatMoney };

/**
 * Vendor quotation and invoice register (PHASES 7 "Invoice/quotation and payment-status register"). Pure: no DB, no session.
 * An ADMINISTRATIVE TRACKING register. It is not accounting, GST filing or a payment system: marking an invoice paid only records
 * that Finance paid it elsewhere.
 *
 * UNCONFIRMED by stakeholders:
 *  - Manage (add, mark paid, accept, decline, void): the head of Finance & Administration only.
 *    Read: that head and the head of Operations (who already read the vendor register). Plain members, Management heads as such and
 *    the Administrator role see nothing (RULES 2.3, 2.7).
 *  - Invoice: OPEN -> PAID (payment reference required) or VOID (reason required). Quotation: OPEN -> ACCEPTED, DECLINED (reason) or VOID (reason).
 *    Every other state is final. A wrong entry is voided and re-entered, never edited, so the history stays honest.
 *  - A record can only be added for an ACTIVE vendor. The same vendor cannot have two records of the same kind with the same reference.
 *  - "Overdue" (open invoice past its due date) and "Expired" (open quotation past its valid-until date) are computed when read, not stored.
 *  - Amount is integer minor units plus currency. No tax split, no totals across currencies, no link to purchase requests yet.
 */

export const RECORD_KINDS = ["INVOICE", "QUOTATION"] as const;
export type RecordKindName = (typeof RECORD_KINDS)[number];
export const MAX_REFERENCE = 80;
export const MIN_PAYREF = 3;
export const BACKDATE_DAYS = 730;
export const MAX_TERM_DAYS = 730;
export { MAX_NOTE, MAX_PAYREF };

export const isRecordKind = (v: string): v is RecordKindName => (RECORD_KINDS as readonly string[]).includes(v);
export const KIND_LABEL: Record<RecordKindName, string> = { INVOICE: "Invoice", QUOTATION: "Quotation" };
export const kindLabel = (k: string) => (Object.prototype.hasOwnProperty.call(KIND_LABEL, k) ? KIND_LABEL[k as RecordKindName] : k);

export const RECORD_STATUS_LABEL: Record<string, string> = { OPEN: "Open", PAID: "Paid", ACCEPTED: "Accepted", DECLINED: "Declined", VOID: "Void" };
export function recordStatusLabel(s: string): string {
  return Object.prototype.hasOwnProperty.call(RECORD_STATUS_LABEL, s) ? RECORD_STATUS_LABEL[s] : s;
}

// ---- Access -----------------------------------------------------------------------------------------------

export const canManageRecords = (u: ExpenseViewer) => isFinanceHead(u);
export const canViewRecords = (u: ExpenseViewer) => isFinanceHead(u) || canViewVendors(u);

// ---- Dates and derived state ------------------------------------------------------------------------------

const DAY = 86_400_000;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const asUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);
function validDate(s: string): boolean {
  if (!dateRe.test(s)) return false;
  const d = asUtc(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** "overdue" / "expired" / null, from ISO calendar dates (YYYY-MM-DD). Only OPEN records can be late. */
export function lateState(kind: string, status: string, dueISO: string | null, todayISO: string): "overdue" | "expired" | null {
  if (status !== "OPEN" || !dueISO || dueISO >= todayISO) return null;
  return kind === "INVOICE" ? "overdue" : kind === "QUOTATION" ? "expired" : null;
}
export function lateDays(dueISO: string, todayISO: string): number {
  return Math.max(0, Math.round((asUtc(todayISO).getTime() - asUtc(dueISO).getTime()) / DAY));
}

/** Uniqueness key for a vendor's document number: NFKC, lower-case, whitespace collapsed. */
export const referenceKey = (ref: string) => vendorNameKey(ref);

// ---- Input ------------------------------------------------------------------------------------------------

// eslint-disable-next-line no-control-regex
const BAD_CHARS = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/;

export type RecordInput = { kind: string; vendorId: string; reference: string; amount: string; currency: string; issueDate: string; dueDate: string };
export type RecordOk = {
  ok: true; kind: RecordKindName; vendorId: string; reference: string; referenceKey: string; amountMinor: number; currency: string; issueDate: string; dueDate: string | null;
};

export function validateRecord(i: RecordInput, todayISO: string): RecordOk | { ok: false; error: string } {
  if (!isRecordKind(i.kind)) return { ok: false, error: "Choose whether this is an invoice or a quotation." };
  if (!i.vendorId.trim()) return { ok: false, error: "Choose a vendor." };
  if (BAD_CHARS.test(i.reference)) return { ok: false, error: "Remove control or direction-override characters." };
  const reference = i.reference.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!reference) return { ok: false, error: `Enter the ${i.kind === "INVOICE" ? "invoice" : "quotation"} number exactly as the vendor wrote it.` };
  if (reference.length > MAX_REFERENCE) return { ok: false, error: `The number is longer than ${MAX_REFERENCE} characters.` };
  const amt = parseAmount(i.amount);
  if (!amt.ok) return amt;
  if (!isCurrency(i.currency)) return { ok: false, error: "Choose a currency." };

  const issue = i.issueDate.trim();
  if (!validDate(issue)) return { ok: false, error: "Choose the date on the document." };
  const t = asUtc(todayISO).getTime();
  if (asUtc(issue).getTime() > t) return { ok: false, error: "The document date cannot be in the future." };
  if (asUtc(issue).getTime() < t - BACKDATE_DAYS * DAY) return { ok: false, error: `The document is older than ${BACKDATE_DAYS} days.` };

  const due = i.dueDate.trim();
  if (!due && i.kind === "INVOICE") return { ok: false, error: "Enter the date the invoice is due." };
  if (due) {
    if (!validDate(due)) return { ok: false, error: "The date is not valid." };
    if (asUtc(due).getTime() < asUtc(issue).getTime()) return { ok: false, error: `${i.kind === "INVOICE" ? "The due date" : "The valid-until date"} cannot be before the document date.` };
    if (asUtc(due).getTime() > asUtc(issue).getTime() + MAX_TERM_DAYS * DAY) return { ok: false, error: `That date is more than ${MAX_TERM_DAYS} days after the document date.` };
  }
  return { ok: true, kind: i.kind, vendorId: i.vendorId.trim(), reference, referenceKey: referenceKey(reference), amountMinor: amt.minor, currency: i.currency, issueDate: issue, dueDate: due || null };
}

// ---- State machine ----------------------------------------------------------------------------------------

export type RecordAction = "pay" | "accept" | "decline" | "void";
export type RecordLike = { kind: string; status: string };

type Rule = { kinds: readonly RecordKindName[]; from: string; to: string; needs: "payref" | "reason" | "none" };
const RULES: Record<RecordAction, Rule> = {
  pay: { kinds: ["INVOICE"], from: "OPEN", to: "PAID", needs: "payref" },
  accept: { kinds: ["QUOTATION"], from: "OPEN", to: "ACCEPTED", needs: "none" },
  decline: { kinds: ["QUOTATION"], from: "OPEN", to: "DECLINED", needs: "reason" },
  void: { kinds: ["INVOICE", "QUOTATION"], from: "OPEN", to: "VOID", needs: "reason" },
};

export type RecordDecision =
  | { ok: true; to: string; text: string | null }
  | { ok: false; code: "INVALID_STATE" | "FORBIDDEN" | "BAD_INPUT" | "ALREADY_DONE"; message: string };

export function availableRecordActions(u: ExpenseViewer, r: RecordLike): RecordAction[] {
  if (!canManageRecords(u) || r.status !== "OPEN") return [];
  return (Object.keys(RULES) as RecordAction[]).filter((a) => (RULES[a].kinds as readonly string[]).includes(r.kind));
}

export function decideRecord(u: ExpenseViewer, r: RecordLike, action: string, rawText: string): RecordDecision {
  const rule = Object.prototype.hasOwnProperty.call(RULES, action) ? RULES[action as RecordAction] : undefined;
  if (!rule || !(rule.kinds as readonly string[]).includes(r.kind)) return { ok: false, code: "INVALID_STATE", message: "That action is not valid for this record." };
  if (!canManageRecords(u)) return { ok: false, code: "FORBIDDEN", message: "Only the Finance head can change this register." };
  if (r.status === rule.to) return { ok: false, code: "ALREADY_DONE", message: `This record is already ${recordStatusLabel(rule.to).toLowerCase()}.` };
  if (r.status !== rule.from) return { ok: false, code: "INVALID_STATE", message: `This record is ${recordStatusLabel(r.status).toLowerCase()} and can no longer be changed.` };

  const text = rawText.trim();
  if (BAD_CHARS.test(text.replace(/[\r\n\t]/g, ""))) return { ok: false, code: "BAD_INPUT", message: "Remove control or direction-override characters." };
  if (rule.needs === "payref") {
    if (text.length < MIN_PAYREF) return { ok: false, code: "BAD_INPUT", message: `Enter the payment reference (at least ${MIN_PAYREF} characters), for example a bank transfer or cheque number.` };
    if (text.length > MAX_PAYREF) return { ok: false, code: "BAD_INPUT", message: `The reference is longer than ${MAX_PAYREF} characters.` };
  } else if (rule.needs === "reason") {
    if (!text) return { ok: false, code: "BAD_INPUT", message: "Give a reason. It stays in the history." };
    if (text.length > MAX_NOTE) return { ok: false, code: "BAD_INPUT", message: `The reason is longer than ${MAX_NOTE} characters.` };
  }
  return { ok: true, to: rule.to, text: text || null };
}

/** A vendor is usable for a NEW record only while ACTIVE. */
export const vendorUsable = (v: { status: string } | null | undefined): boolean => !!v && v.status === "ACTIVE";
