import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ConfirmSubmit } from "@/lib/confirm";
import { fmtDate } from "@/lib/tasks";
import { Flash } from "@/lib/task-ui";
import { EmptyState, PageHeader, Person } from "@/lib/ui";
import { canManageDocuments, docKindLabel, fmtSize, isDocHrHead } from "@/lib/documents";
import { deleteDocument } from "./actions";

export const dynamic = "force-dynamic";

export default async function Documents({ searchParams }: { searchParams: { error?: string; ok?: string; person?: string } }) {
  const user = await requireUser();
  const hr = isDocHrHead(user);
  // The HR head sees everyone's; anyone else sees only documents about themselves. Enforced in the query, not the page.
  const person = hr && searchParams.person ? searchParams.person : null;
  const docs = await db.employeeDocument.findMany({
    where: hr ? (person ? { subjectId: person } : {}) : { subjectId: user.id },
    orderBy: { createdAt: "desc" }, take: 200,
    select: { id: true, kind: true, fileName: true, sizeBytes: true, note: true, createdAt: true, subjectId: true, subject: { select: { displayName: true } } },
  });
  const people = hr ? await db.user.findMany({ where: { status: "ACTIVE" }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }) : [];

  return (
    <Shell>
      <PageHeader
        title={hr ? "Employee documents" : "Your documents"}
        description={hr ? "Restricted. Only you and the employee concerned can open a document; every download is recorded." : "Documents HR holds about you. Only you and the HR head can open them."}
        actions={hr && <Link className="btn" href="/documents/new"><Plus className="ic" aria-hidden="true" />Add document</Link>}
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {hr && (
        <form method="get" className="btn-row" style={{ marginBottom: "1rem" }}>
          <label htmlFor="person" className="muted">Person</label>
          <select id="person" name="person" defaultValue={person ?? ""}>
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </select>
          <button type="submit" className="quiet sm">Filter</button>
        </form>
      )}
      {docs.length === 0 ? (
        <div className="table-wrap"><EmptyState icon={FileText} title="No documents">{hr ? "Add a document to start the register." : "HR has not added any documents about you."}</EmptyState></div>
      ) : (
        <div className="table-wrap"><div className="table-scroll">
          <table className="responsive">
            <thead><tr><th>Document</th>{hr && <th>Person</th>}<th>Type</th><th>Size</th><th>Added</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="primary"><a href={`/api/documents/${d.id}`} download>{d.fileName}</a>{d.note && <div className="muted">{d.note}</div>}</td>
                  {hr && <td data-label="Person"><Person name={d.subject.displayName} /></td>}
                  <td data-label="Type">{docKindLabel(d.kind)}</td>
                  <td data-label="Size" className="num">{fmtSize(d.sizeBytes)}</td>
                  <td data-label="Added" className="num">{fmtDate(d.createdAt)}</td>
                  <td>
                    {canManageDocuments(user, d.subjectId) && (
                      <form action={deleteDocument}>
                        <input type="hidden" name="id" value={d.id} />
                        <ConfirmSubmit danger label="Remove" title="Remove this document?" message="The file is deleted and cannot be recovered. The removal is recorded without the file name." confirmLabel="Remove document" />
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
    </Shell>
  );
}
