import { randomUUID } from "node:crypto";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Flash } from "@/lib/task-ui";
import { EmptyState, Field, PageHeader } from "@/lib/ui";
import { LEAD_SOURCES, SALES_SLUG, canCreateLead } from "@/lib/leads";
import { createLead } from "../actions";

export const dynamic = "force-dynamic";

type P = {
  error?: string; organizationName?: string; contactName?: string; contactEmail?: string; contactPhone?: string;
  source?: string; ownerId?: string; nextFollowUpAt?: string; clientToken?: string;
};

export default async function NewLead({ searchParams }: { searchParams: P }) {
  const user = await requireUser();
  const crumbs = [{ label: "Leads", href: "/leads" }, { label: "New lead" }];
  if (!canCreateLead(user)) {
    return (
      <Shell>
        <PageHeader title="New lead" crumbs={crumbs} />
        <div className="table-wrap"><EmptyState icon={Briefcase} title="Only Sales & Marketing can create leads">Ask the Sales head if you need access.</EmptyState></div>
      </Shell>
    );
  }
  const v = searchParams;
  const owners = await db.user.findMany({
    where: { status: "ACTIVE", memberships: { some: { department: { slug: SALES_SLUG } } } },
    orderBy: { displayName: "asc" }, select: { id: true, displayName: true },
  });
  return (
    <Shell>
      <PageHeader title="New lead" crumbs={crumbs} description="One named owner is accountable for every lead. Add a first follow-up date so it is never left without a next step." />
      <Flash error={v.error} />
      <form action={createLead} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={v.clientToken || randomUUID()} />
        <div className="form-grid">
          <div className="full"><Field id="organizationName" label="Organisation" required>
            <input id="organizationName" name="organizationName" defaultValue={v.organizationName ?? ""} maxLength={200} required placeholder="e.g. Greenfield Public School" />
          </Field></div>
          <Field id="contactName" label="Contact person" required>
            <input id="contactName" name="contactName" defaultValue={v.contactName ?? ""} maxLength={120} required />
          </Field>
          <Field id="source" label="Source" required>
            <select id="source" name="source" defaultValue={v.source ?? ""} required>
              <option value="" disabled>Choose…</option>
              {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field id="contactEmail" label="Email" hint="Email or phone is required.">
            <input id="contactEmail" name="contactEmail" type="email" defaultValue={v.contactEmail ?? ""} maxLength={254} />
          </Field>
          <Field id="contactPhone" label="Phone">
            <input id="contactPhone" name="contactPhone" type="tel" defaultValue={v.contactPhone ?? ""} maxLength={25} />
          </Field>
          <Field id="ownerId" label="Owner" required hint="Accountable for follow-up. Must be in Sales & Marketing.">
            <select id="ownerId" name="ownerId" defaultValue={v.ownerId || user.id} required>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.displayName}{o.id === user.id ? " (you)" : ""}</option>)}
            </select>
          </Field>
          <Field id="nextFollowUpAt" label="First follow-up">
            <input id="nextFollowUpAt" name="nextFollowUpAt" type="date" defaultValue={v.nextFollowUpAt ?? ""} />
          </Field>
        </div>
        <div className="btn-row">
          <button type="submit">Create lead</button>
          <Link className="btn ghost" href="/leads">Cancel</Link>
        </div>
        <p className="hint" style={{ marginTop: "1rem" }}><span className="req" aria-hidden="true">*</span> Required</p>
      </form>
    </Shell>
  );
}
