import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CURRENCIES } from "@/lib/expenses";
import { CYCLES, DEFAULT_REMINDER, MAX_NAME, MAX_REMINDER, RENEWAL_CATEGORIES, canManageRenewals, cycleLabel } from "@/lib/renewals";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader } from "@/lib/ui";
import { createRenewal } from "../actions";

export const dynamic = "force-dynamic";
type P = { error?: string; name?: string; category?: string; vendorId?: string; amount?: string; currency?: string; cycle?: string; renewalDate?: string; reminderDays?: string; clientToken?: string };

export default async function NewRenewal({ searchParams }: { searchParams: P }) {
  const user = await requireUser();
  if (!canManageRenewals(user)) redirect("/");
  const v = searchParams;
  const vendors = await db.vendor.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, take: 300, select: { id: true, name: true } });
  return (
    <Shell>
      <PageHeader title="Add renewal" crumbs={[{ label: "Renewals", href: "/renewals" }, { label: "Add renewal" }]} description="Do not enter passwords, licence keys or card numbers." />
      <Flash error={v.error} />
      <form action={createRenewal} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={v.clientToken || randomUUID()} />
        <div className="form-grid">
          <div className="full"><Field id="name" label="What renews?" required><input id="name" name="name" type="text" maxLength={MAX_NAME} required defaultValue={v.name ?? ""} /></Field></div>
          <Field id="category" label="Category" required>
            <select id="category" name="category" required defaultValue={v.category ?? ""}><option value="" disabled>Choose…</option>{RENEWAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </Field>
          <Field id="vendorId" label="Vendor" hint="Optional. Active vendors only.">
            <select id="vendorId" name="vendorId" defaultValue={v.vendorId ?? ""}><option value="">None</option>{vendors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          </Field>
          <Field id="amount" label="Cost per cycle" required hint="Digits with up to two decimals."><input id="amount" name="amount" type="text" inputMode="decimal" autoComplete="off" required defaultValue={v.amount ?? ""} /></Field>
          <Field id="currency" label="Currency" required>
            <select id="currency" name="currency" required defaultValue={v.currency ?? ""}><option value="" disabled>Choose…</option>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </Field>
          <Field id="cycle" label="Renews" required>
            <select id="cycle" name="cycle" required defaultValue={v.cycle ?? ""}><option value="" disabled>Choose…</option>{CYCLES.map((c) => <option key={c} value={c}>{cycleLabel(c)}</option>)}</select>
          </Field>
          <Field id="renewalDate" label="Next renewal date" required><input id="renewalDate" name="renewalDate" type="date" required defaultValue={v.renewalDate ?? ""} /></Field>
          <Field id="reminderDays" label="Remind me (days before)" hint={`1 to ${MAX_REMINDER}. Shown as "due soon" from then on.`}>
            <input id="reminderDays" name="reminderDays" type="text" inputMode="numeric" defaultValue={v.reminderDays ?? String(DEFAULT_REMINDER)} />
          </Field>
        </div>
        <div className="btn-row"><button type="submit">Add renewal</button><Link className="btn ghost" href="/renewals">Cancel</Link></div>
      </form>
    </Shell>
  );
}
