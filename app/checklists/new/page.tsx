import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader } from "@/lib/ui";
import { CASE_TYPES, TEMPLATES, canManageCases, caseDateLabel, caseTypeLabel } from "@/lib/checklists";
import { createCase } from "../actions";

export const dynamic = "force-dynamic";

type P = { error?: string; subjectId?: string; type?: string; effectiveDate?: string; clientToken?: string };

export default async function NewChecklist({ searchParams }: { searchParams: P }) {
  const user = await requireUser();
  if (!canManageCases(user)) redirect("/");
  const people = await db.user.findMany({ where: { status: "ACTIVE", id: { not: user.id } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, email: true } });
  const v = searchParams;
  return (
    <Shell>
      <PageHeader title="New checklist" crumbs={[{ label: "Checklists", href: "/checklists" }, { label: "New checklist" }]}
        description="Each step gets a default owner: you, or the head of the person's department, Technology or Operations. You can reassign any step afterwards." />
      <Flash error={v.error} />
      <form action={createCase} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={v.clientToken || randomUUID()} />
        <div className="form-grid">
          <Field id="subjectId" label="Person" required>
            <select id="subjectId" name="subjectId" required defaultValue={v.subjectId ?? ""}>
              <option value="" disabled>Choose a person…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.displayName} ({p.email})</option>)}
            </select>
          </Field>
          <Field id="type" label="Type" required>
            <select id="type" name="type" required defaultValue={v.type ?? ""}>
              <option value="" disabled>Choose a type…</option>
              {CASE_TYPES.map((t) => <option key={t} value={t}>{caseTypeLabel(t)}</option>)}
            </select>
          </Field>
          <Field id="effectiveDate" label="Date" required hint={`${caseDateLabel("ONBOARDING")} for onboarding, ${caseDateLabel("OFFBOARDING").toLowerCase()} for offboarding. Steps are due on this date.`}>
            <input id="effectiveDate" name="effectiveDate" type="date" required defaultValue={v.effectiveDate ?? ""} />
          </Field>
        </div>
        <div className="btn-row">
          <button type="submit">Open checklist</button>
          <Link className="btn ghost" href="/checklists">Cancel</Link>
        </div>
      </form>
      <section className="section form-narrow" aria-labelledby="tpl-h">
        <h2 id="tpl-h">Steps that will be created</h2>
        {CASE_TYPES.map((t) => (
          <div key={t} style={{ marginTop: ".75rem" }}>
            <h3 style={{ fontSize: ".9rem" }}>{caseTypeLabel(t)}</h3>
            <ul>{TEMPLATES[t].map((i) => <li key={i.title}>{i.title}</li>)}</ul>
          </div>
        ))}
        <p className="hint">These starting steps are a proposal and still need to be confirmed by the company.</p>
      </section>
    </Shell>
  );
}
