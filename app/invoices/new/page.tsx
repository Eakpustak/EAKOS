import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CURRENCIES } from "@/lib/expenses";
import { MAX_REFERENCE, canManageRecords } from "@/lib/finance-records";
import { Flash } from "@/lib/task-ui";
import { todayStr } from "@/lib/tasks";
import { Field, PageHeader } from "@/lib/ui";
import { createRecord } from "../actions";

export const dynamic = "force-dynamic";

type P = { error?: string; kind?: string; vendorId?: string; reference?: string; amount?: string; currency?: string; issueDate?: string; dueDate?: string; clientToken?: string };

export default async function NewRecord({ searchParams }: { searchParams: P }) {
  const user = await requireUser();
  if (!canManageRecords(user)) redirect("/");
  const v = searchParams;
  const vendors = await db.vendor.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, take: 300, select: { id: true, name: true } });
  return (
    <Shell>
      <PageHeader title="Add invoice or quotation" crumbs={[{ label: "Invoices & quotes", href: "/invoices" }, { label: "Add record" }]}
        description="Record a document you received from a vendor. A wrong entry is voided and re-entered, not edited." />
      <Flash error={v.error} />
      <form action={createRecord} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={v.clientToken || randomUUID()} />
        <div className="form-grid">
          <Field id="kind" label="Type" required>
            <select id="kind" name="kind" required defaultValue={v.kind ?? ""}>
              <option value="" disabled>Choose…</option><option value="INVOICE">Invoice</option><option value="QUOTATION">Quotation</option>
            </select>
          </Field>
          <Field id="vendorId" label="Vendor" required hint="Active vendors only.">
            <select id="vendorId" name="vendorId" required defaultValue={v.vendorId ?? ""}>
              <option value="" disabled>Choose a vendor…</option>
              {vendors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <div className="full"><Field id="reference" label="Document number" required hint="Exactly as the vendor wrote it. Unique per vendor and type.">
            <input id="reference" name="reference" type="text" maxLength={MAX_REFERENCE} required autoComplete="off" defaultValue={v.reference ?? ""} />
          </Field></div>
          <Field id="amount" label="Total amount" required hint="Digits with up to two decimals, for example 25000.50.">
            <input id="amount" name="amount" type="text" inputMode="decimal" autoComplete="off" required defaultValue={v.amount ?? ""} />
          </Field>
          <Field id="currency" label="Currency" required>
            <select id="currency" name="currency" required defaultValue={v.currency ?? ""}>
              <option value="" disabled>Choose…</option>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field id="issueDate" label="Date on the document" required>
            <input id="issueDate" name="issueDate" type="date" max={todayStr()} required defaultValue={v.issueDate ?? ""} />
          </Field>
          <Field id="dueDate" label="Due date / valid until" hint="Required for invoices. Optional for quotations.">
            <input id="dueDate" name="dueDate" type="date" defaultValue={v.dueDate ?? ""} />
          </Field>
        </div>
        <div className="btn-row"><button type="submit">Add record</button><Link className="btn ghost" href="/invoices">Cancel</Link></div>
      </form>
    </Shell>
  );
}
