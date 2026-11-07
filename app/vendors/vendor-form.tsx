import { Field } from "@/lib/ui";
import { MAX_CONTACT, MAX_EMAIL, MAX_NAME, MAX_NOTES, MAX_PHONE, VENDOR_CATEGORIES } from "@/lib/vendors";

type V = { name?: string; category?: string; contactName?: string | null; email?: string | null; phone?: string | null; notes?: string | null };

export function VendorFields({ v }: { v: V }) {
  return (
    <div className="form-grid">
      <Field id="name" label="Vendor name" required><input id="name" name="name" type="text" maxLength={MAX_NAME} required defaultValue={v.name ?? ""} /></Field>
      <Field id="category" label="Category" required>
        <select id="category" name="category" required defaultValue={v.category ?? ""}>
          <option value="" disabled>Choose a category…</option>
          {VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field id="contactName" label="Contact person"><input id="contactName" name="contactName" type="text" maxLength={MAX_CONTACT} defaultValue={v.contactName ?? ""} /></Field>
      <Field id="email" label="Email"><input id="email" name="email" type="email" maxLength={MAX_EMAIL} defaultValue={v.email ?? ""} /></Field>
      <Field id="phone" label="Phone" hint="Digits, spaces, brackets, hyphens; optional leading +."><input id="phone" name="phone" type="tel" maxLength={MAX_PHONE} defaultValue={v.phone ?? ""} /></Field>
      <span />
      <div className="full"><Field id="notes" label="Notes" hint="No bank details, tax numbers or passwords.">
        <textarea id="notes" name="notes" rows={4} maxLength={MAX_NOTES} defaultValue={v.notes ?? ""} />
      </Field></div>
    </div>
  );
}
