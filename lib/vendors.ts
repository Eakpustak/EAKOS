import { isFinanceHead, type ExpenseViewer } from "./expenses";

/**
 * Vendor register (PHASES 7, WORKFLOWS 7: "vendor and asset records are visible only to authorized roles"). Pure.
 *
 * UNCONFIRMED by stakeholders:
 *  - Read: the head of Operations and the head of Finance & Administration. Manage (add, edit, deactivate): the head of Operations only.
 *    Plain members of those departments, Management heads as such and the Administrator role get nothing (RULES 2.3, 2.7).
 *  - A vendor is never deleted, only deactivated, so past records keep their reference.
 *  - Names are unique ignoring case, spacing and accents-of-compatibility (NFKC). Categories are placeholders.
 *  - Contact details are personal data: audit events record which fields changed, never their values.
 *  - Not a procurement system: no ratings, contracts, bank details, tax numbers or documents.
 */

export const OPERATIONS_SLUG = "operations";
export const VENDOR_CATEGORIES = ["Software", "Hosting and domains", "Hardware", "Services", "Facilities", "Other"] as const;
export const MAX_NAME = 120, MIN_NAME = 2, MAX_CONTACT = 120, MAX_EMAIL = 200, MAX_PHONE = 30, MAX_NOTES = 1000;

export type VendorViewer = ExpenseViewer;
export function isOperationsHead(u: VendorViewer): boolean {
  return u.memberships.some((m) => m.type === "HEAD" && m.department?.slug === OPERATIONS_SLUG);
}
export const canManageVendors = (u: VendorViewer) => isOperationsHead(u);
export const canViewVendors = (u: VendorViewer) => isOperationsHead(u) || isFinanceHead(u);

export const isVendorCategory = (v: string) => (VENDOR_CATEGORIES as readonly string[]).includes(v);

/** Uniqueness key: NFKC, lower-cased, whitespace collapsed. */
export function vendorNameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export type VendorInput = { name: string; category: string; contactName: string; email: string; phone: string; notes: string };
export type VendorOk = { ok: true; name: string; nameKey: string; category: string; contactName: string | null; email: string | null; phone: string | null; notes: string | null };

// Deliberately plain: one @, no spaces, a dot in the domain. Real validation is sending mail, which this app does not do.
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9 ()-]{5,}$/;

export function validateVendor(i: VendorInput): VendorOk | { ok: false; error: string } {
  const name = i.name.normalize("NFKC").replace(/\s+/g, " ").trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f‪-‮⁦-⁩]/.test(i.name + i.contactName + i.notes.replace(/[\r\n\t]/g, ""))) return { ok: false, error: "Remove control or direction-override characters." };
  if (name.length < MIN_NAME) return { ok: false, error: "Enter the vendor's name." };
  if (name.length > MAX_NAME) return { ok: false, error: `The name is longer than ${MAX_NAME} characters.` };
  if (!isVendorCategory(i.category)) return { ok: false, error: "Choose a category." };
  const contactName = i.contactName.trim();
  if (contactName.length > MAX_CONTACT) return { ok: false, error: `The contact name is longer than ${MAX_CONTACT} characters.` };
  const email = i.email.trim();
  if (email && (email.length > MAX_EMAIL || !EMAIL_RE.test(email))) return { ok: false, error: "The email address does not look right." };
  const phone = i.phone.trim();
  if (phone && (phone.length > MAX_PHONE || !PHONE_RE.test(phone))) return { ok: false, error: "The phone number does not look right. Use digits, spaces, brackets, hyphens and an optional leading +." };
  const notes = i.notes.trim();
  if (notes.length > MAX_NOTES) return { ok: false, error: `The notes are longer than ${MAX_NOTES} characters.` };
  return { ok: true, name, nameKey: vendorNameKey(name), category: i.category, contactName: contactName || null, email: email || null, phone: phone || null, notes: notes || null };
}

/** Field names that differ, for the audit trail. Values are never logged. */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((k) => (before[k] ?? null) !== (after[k] ?? null));
}

export const VENDOR_STATUS_LABEL = { ACTIVE: "Active", INACTIVE: "Inactive" } as const;
export function vendorStatusLabel(s: string): string {
  return Object.prototype.hasOwnProperty.call(VENDOR_STATUS_LABEL, s) ? VENDOR_STATUS_LABEL[s as keyof typeof VENDOR_STATUS_LABEL] : s;
}
