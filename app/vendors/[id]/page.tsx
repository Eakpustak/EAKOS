import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ConfirmSubmit } from "@/lib/confirm";
import { Flash } from "@/lib/task-ui";
import { fmtDateTime } from "@/lib/tasks";
import { PageHeader, Person } from "@/lib/ui";
import { canManageVendors, canViewVendors, vendorStatusLabel } from "@/lib/vendors";
import { setVendorStatus, updateVendor } from "../actions";
import { VendorFields } from "../vendor-form";

export const dynamic = "force-dynamic";

export default async function VendorDetail({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | undefined> }) {
  const user = await requireUser();
  if (!canViewVendors(user)) redirect("/");
  const v = await db.vendor.findUnique({ where: { id: params.id }, include: { createdBy: { select: { displayName: true } } } });
  if (!v) redirect("/vendors");
  const manage = canManageVendors(user);
  // After a failed save the submitted values come back in the query string; otherwise show what is stored.
  const shown = searchParams.name !== undefined ? { name: searchParams.name, category: searchParams.category, contactName: searchParams.contactName, email: searchParams.email, phone: searchParams.phone, notes: searchParams.notes } : v;
  return (
    <Shell>
      <PageHeader title={v.name} crumbs={[{ label: "Vendors", href: "/vendors" }, { label: "Vendor" }]} description={`${v.category} · ${vendorStatusLabel(v.status)}`} />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {manage ? (
        <>
          <form action={updateVendor} className="panel form-narrow">
            <input type="hidden" name="id" value={v.id} />
            <input type="hidden" name="version" value={String(v.updatedAt.getTime())} />
            <VendorFields v={shown} />
            <div className="btn-row"><button type="submit">Save changes</button><Link className="btn ghost" href="/vendors">Back</Link></div>
          </form>
          <form action={setVendorStatus} className="panel form-narrow" style={{ marginTop: "1rem" }}>
            <input type="hidden" name="id" value={v.id} />
            <input type="hidden" name="to" value={v.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
            <h2>{v.status === "ACTIVE" ? "Deactivate" : "Reactivate"}</h2>
            <p className="muted">{v.status === "ACTIVE" ? "Hides the vendor from the active list. Nothing is deleted." : "Puts the vendor back on the active list."}</p>
            <div className="btn-row">
              {v.status === "ACTIVE"
                ? <ConfirmSubmit danger label="Deactivate vendor" title="Deactivate this vendor?" message="It moves to the Inactive list and can be reactivated later." confirmLabel="Deactivate" />
                : <button type="submit">Reactivate vendor</button>}
            </div>
          </form>
        </>
      ) : (
        <section className="card">
          <div className="card-body">
            <dl className="props">
              <div><dt>Contact</dt><dd>{v.contactName ?? "—"}</dd></div>
              <div><dt>Email</dt><dd>{v.email ?? "—"}</dd></div>
              <div><dt>Phone</dt><dd>{v.phone ?? "—"}</dd></div>
              <div><dt>Notes</dt><dd>{v.notes ?? "—"}</dd></div>
            </dl>
          </div>
        </section>
      )}
      <p className="hint" style={{ marginTop: "1rem" }}>Added by <Person name={v.createdBy.displayName} /> on <span className="num">{fmtDateTime(v.createdAt)}</span>. Last changed <span className="num">{fmtDateTime(v.updatedAt)}</span>.</p>
    </Shell>
  );
}
