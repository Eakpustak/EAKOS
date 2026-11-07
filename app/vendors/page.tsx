import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Store } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Flash } from "@/lib/task-ui";
import { EmptyState, PageHeader } from "@/lib/ui";
import { VENDOR_CATEGORIES, canManageVendors, canViewVendors, vendorStatusLabel } from "@/lib/vendors";

export const dynamic = "force-dynamic";

export default async function Vendors({ searchParams }: { searchParams: { view?: string; category?: string; error?: string; ok?: string } }) {
  const user = await requireUser();
  if (!canViewVendors(user)) redirect("/");
  const inactive = searchParams.view === "inactive";
  const category = (VENDOR_CATEGORIES as readonly string[]).includes(searchParams.category ?? "") ? searchParams.category! : null;
  const rows = await db.vendor.findMany({
    where: { status: inactive ? "INACTIVE" : "ACTIVE", ...(category ? { category } : {}) }, orderBy: { name: "asc" }, take: 200,
    select: { id: true, name: true, category: true, contactName: true, status: true },
  });
  return (
    <Shell>
      <PageHeader
        title="Vendors"
        description={canManageVendors(user) ? "Companies the business buys from. Visible to Operations and Finance heads only." : "Read-only. Operations maintains this register."}
        actions={canManageVendors(user) && <Link className="btn" href="/vendors/new"><Plus className="ic" aria-hidden="true" />Add vendor</Link>}
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      <nav aria-label="View" className="btn-row" style={{ marginBottom: "1rem" }}>
        <Link className={!inactive ? "btn" : "btn ghost"} href="/vendors" aria-current={!inactive ? "page" : undefined}>Active</Link>
        <Link className={inactive ? "btn" : "btn ghost"} href="/vendors?view=inactive" aria-current={inactive ? "page" : undefined}>Inactive</Link>
      </nav>
      <form method="get" className="btn-row" style={{ marginBottom: "1rem" }}>
        {inactive && <input type="hidden" name="view" value="inactive" />}
        <label htmlFor="category" className="muted">Category</label>
        <select id="category" name="category" defaultValue={category ?? ""}>
          <option value="">All</option>
          {VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button type="submit" className="quiet sm">Filter</button>
      </form>
      {rows.length === 0 ? (
        <div className="table-wrap"><EmptyState icon={Store} title="No vendors">{inactive ? "Deactivated vendors appear here." : "Add the first vendor to start the register."}</EmptyState></div>
      ) : (
        <div className="table-wrap"><div className="table-scroll">
          <table className="responsive">
            <thead><tr><th>Vendor</th><th>Category</th><th>Contact</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td className="primary"><Link className="row-link" href={`/vendors/${v.id}`}>{v.name}</Link></td>
                  <td data-label="Category">{v.category}</td>
                  <td data-label="Contact">{v.contactName ?? "—"}</td>
                  <td data-label="Status">{vendorStatusLabel(v.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
    </Shell>
  );
}
