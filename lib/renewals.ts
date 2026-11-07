import { MAX_MINOR, formatMoney, isCurrency, parseAmount } from "./expenses";
import { VENDOR_CATEGORIES, canManageVendors, canViewVendors, isVendorCategory } from "./vendors";

export { formatMoney, MAX_MINOR };

/**
 * Renewal register: subscriptions, domains, hosting (PHASES 7 "Subscription/domain/hosting renewal reminders"). Pure.
 * Administrative tracking only. NEVER store logins, licence keys or card numbers here (the form says so; nothing enforces it).
 *
 * UNCONFIRMED by stakeholders:
 *  - Manage: head of Operations. Read: heads of Operations and Finance & Administration (the vendor register's readers). Everyone else, incl. admins: nothing.
 *  - There is NO scheduler yet, so a reminder is not pushed: a renewal is "due soon" when today >= renewalDate - reminderDays, "overdue" when
 *    renewalDate < today. Readers see a count in the sidebar and flags in the list.
 *  - Mark renewed advances the date by one cycle (month-end clamped) from the CURRENT renewal date, not from today, so a late renewal does not drift.
 *  - Cancel is final. Edit is not built yet (cancel and re-add). Categories are the vendor categories.
 */

export const CYCLES = ["MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type Cycle = (typeof CYCLES)[number];
export const CYCLE_LABEL: Record<Cycle, string> = { MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly" };
export const cycleLabel = (c: string) => (Object.prototype.hasOwnProperty.call(CYCLE_LABEL, c) ? CYCLE_LABEL[c as Cycle] : c);
export const isCycle = (v: string): v is Cycle => (CYCLES as readonly string[]).includes(v);
export const RENEWAL_CATEGORIES = VENDOR_CATEGORIES;
export const MIN_NAME = 2, MAX_NAME = 120, DEFAULT_REMINDER = 30, MIN_REMINDER = 1, MAX_REMINDER = 180;

export const canViewRenewals = canViewVendors;
export const canManageRenewals = canManageVendors;

const DAY = 86_400_000;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const asUtc = (s: string) => new Date(`${s}T00:00:00.000Z`);
function validDate(s: string): boolean {
  if (!dateRe.test(s)) return false;
  const d = asUtc(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Add one cycle to an ISO date. Day-of-month is clamped to the target month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addCycle(iso: string, cycle: string): string {
  const months = cycle === "MONTHLY" ? 1 : cycle === "QUARTERLY" ? 3 : cycle === "YEARLY" ? 12 : 0;
  if (!months || !validDate(iso)) throw new Error("bad cycle or date");
  const [y, m, d] = iso.split("-").map(Number);
  const total = (m - 1) + months;
  const ty = y + Math.floor(total / 12), tm = total % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ty, tm, Math.min(d, last))).toISOString().slice(0, 10);
}

export type RenewalState = "overdue" | "due-soon" | "scheduled" | "cancelled";
export function renewalState(r: { status: string; renewalDate: string; reminderDays: number }, todayISO: string): RenewalState {
  if (r.status === "CANCELLED") return "cancelled";
  if (r.renewalDate < todayISO) return "overdue";
  const days = Math.round((asUtc(r.renewalDate).getTime() - asUtc(todayISO).getTime()) / DAY);
  return days <= r.reminderDays ? "due-soon" : "scheduled";
}
export const daysUntil = (iso: string, todayISO: string) => Math.round((asUtc(iso).getTime() - asUtc(todayISO).getTime()) / DAY);
/** Count shown in the sidebar: active renewals that are overdue or inside their reminder window. */
export function attentionCount(rows: { status: string; renewalDate: string; reminderDays: number }[], todayISO: string): number {
  return rows.filter((r) => { const s = renewalState(r, todayISO); return s === "overdue" || s === "due-soon"; }).length;
}

// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/;
export type RenewalInput = { name: string; category: string; vendorId: string; amount: string; currency: string; cycle: string; renewalDate: string; reminderDays: string };
export type RenewalOk = { ok: true; name: string; category: string; vendorId: string | null; amountMinor: number; currency: string; cycle: Cycle; renewalDate: string; reminderDays: number };

export function validateRenewal(i: RenewalInput, todayISO: string): RenewalOk | { ok: false; error: string } {
  if (BAD.test(i.name)) return { ok: false, error: "Remove control or direction-override characters." };
  const name = i.name.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (name.length < MIN_NAME) return { ok: false, error: "Enter what is being renewed, for example a domain or a software subscription." };
  if (name.length > MAX_NAME) return { ok: false, error: `The name is longer than ${MAX_NAME} characters.` };
  if (!isVendorCategory(i.category)) return { ok: false, error: "Choose a category." };
  const amt = parseAmount(i.amount);
  if (!amt.ok) return amt;
  if (!isCurrency(i.currency)) return { ok: false, error: "Choose a currency." };
  if (!isCycle(i.cycle)) return { ok: false, error: "Choose how often it renews." };
  const rd = i.renewalDate.trim();
  if (!validDate(rd)) return { ok: false, error: "Choose the next renewal date." };
  const t = asUtc(todayISO).getTime();
  if (asUtc(rd).getTime() < t - 365 * DAY) return { ok: false, error: "That renewal date is more than a year in the past." };
  if (asUtc(rd).getTime() > t + 5 * 365 * DAY) return { ok: false, error: "That renewal date is more than five years away." };
  const rem = i.reminderDays.trim() || String(DEFAULT_REMINDER);
  if (!/^\d{1,3}$/.test(rem) || Number(rem) < MIN_REMINDER || Number(rem) > MAX_REMINDER) return { ok: false, error: `Reminder days must be a whole number from ${MIN_REMINDER} to ${MAX_REMINDER}.` };
  return { ok: true, name, category: i.category, vendorId: i.vendorId.trim() || null, amountMinor: amt.minor, currency: i.currency, cycle: i.cycle, renewalDate: rd, reminderDays: Number(rem) };
}
