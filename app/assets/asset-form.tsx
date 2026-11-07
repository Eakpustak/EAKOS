import { Field } from "@/lib/ui";
import { ASSET_TYPES, ENVIRONMENTS, MAX_NAME, MAX_NOTES } from "@/lib/assets";

type V = { name?: string; assetType?: string; environment?: string; url?: string | null; ownerId?: string | null; notes?: string | null };

export function AssetFields({ v, owners }: { v: V; owners: { id: string; displayName: string }[] }) {
  return (
    <div className="form-grid">
      <div className="full"><Field id="name" label="Name" required><input id="name" name="name" type="text" maxLength={MAX_NAME} required defaultValue={v.name ?? ""} /></Field></div>
      <Field id="assetType" label="Type" required>
        <select id="assetType" name="assetType" required defaultValue={v.assetType ?? ""}><option value="" disabled>Choose…</option>{ASSET_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </Field>
      <Field id="environment" label="Environment" required>
        <select id="environment" name="environment" required defaultValue={v.environment ?? ""}><option value="" disabled>Choose…</option>{ENVIRONMENTS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </Field>
      <Field id="url" label="Link" hint="Optional http(s) address, for example the GitHub repository. No usernames or passwords."><input id="url" name="url" type="url" defaultValue={v.url ?? ""} /></Field>
      <Field id="ownerId" label="Owner" hint="Optional. Active Technology members.">
        <select id="ownerId" name="ownerId" defaultValue={v.ownerId ?? ""}><option value="">No owner</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.displayName}</option>)}</select>
      </Field>
      <div className="full"><Field id="notes" label="Notes" hint="Never enter passwords, keys or tokens. Say where a secret is kept, not what it is.">
        <textarea id="notes" name="notes" rows={4} maxLength={MAX_NOTES} defaultValue={v.notes ?? ""} />
      </Field></div>
    </div>
  );
}
