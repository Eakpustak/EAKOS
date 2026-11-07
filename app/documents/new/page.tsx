import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader } from "@/lib/ui";
import { DOC_KINDS, MAX_DOC_NOTE, docKindLabel, isDocHrHead } from "@/lib/documents";
import { uploadDocument } from "../actions";

export const dynamic = "force-dynamic";

type P = { error?: string; subjectId?: string; kind?: string; note?: string; clientToken?: string };

export default async function NewDocument({ searchParams }: { searchParams: P }) {
  const user = await requireUser();
  if (!isDocHrHead(user)) redirect("/");
  const people = await db.user.findMany({ where: { status: "ACTIVE", id: { not: user.id } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true, email: true } });
  const v = searchParams;
  return (
    <Shell>
      <PageHeader title="Add document" crumbs={[{ label: "Employee documents", href: "/documents" }, { label: "Add document" }]}
        description="PDF, PNG or JPEG, up to 5 MB. Stored privately; only you and the employee can open it." />
      <Flash error={v.error} />
      <form action={uploadDocument} encType="multipart/form-data" className="panel form-narrow">
        <input type="hidden" name="clientToken" value={v.clientToken || randomUUID()} />
        <div className="form-grid">
          <Field id="subjectId" label="Person" required>
            <select id="subjectId" name="subjectId" required defaultValue={v.subjectId ?? ""}>
              <option value="" disabled>Choose a person…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.displayName} ({p.email})</option>)}
            </select>
          </Field>
          <Field id="kind" label="Type" required>
            <select id="kind" name="kind" required defaultValue={v.kind ?? ""}>
              <option value="" disabled>Choose a type…</option>
              {DOC_KINDS.map((k) => <option key={k} value={k}>{docKindLabel(k)}</option>)}
            </select>
          </Field>
          <Field id="file" label="File" required hint="You will need to choose the file again if the form is returned with an error.">
            <input id="file" name="file" type="file" required accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg" />
          </Field>
          <Field id="note" label="Note" hint={`Optional, up to ${MAX_DOC_NOTE} characters. Visible to the employee.`}>
            <input id="note" name="note" type="text" maxLength={MAX_DOC_NOTE} defaultValue={v.note ?? ""} />
          </Field>
        </div>
        <div className="btn-row">
          <button type="submit">Add document</button>
          <Link className="btn ghost" href="/documents">Cancel</Link>
        </div>
      </form>
    </Shell>
  );
}
