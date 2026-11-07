import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Server } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ASSET_TYPES, ENVIRONMENTS, canManageAssets, canViewAssets } from "@/lib/assets";
import { Flash } from "@/lib/task-ui";
import { EmptyState, PageHeader, Person } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function Assets({ searchParams }: { searchParams: { view?: string; type?: string; env?: string; error?: string; ok?: string } }) {
  const user = await requireUser();
  if (!canViewAssets(user)) redirect("/");
  const retired = searchParams.view === "retired";
  const type = (ASSET_TYPES as readonly string[]).includes(searchParams.type ?? "") ? searchParams.type! : null;
  const env = (ENVIRONMENTS as readonly string[]).includes(searchParams.env ?? "") ? searchParams.env! : null;
  const rows = await db.techAsset.findMany({
    where: { status: retired ? "RETIRED" : "ACTIVE", ...(type ? { assetType: type } : {}), ...(env ? { environment: env } : {}) }, orderBy: [{ environment: "asc" }, { name: "asc" }], take: 300,
    select: { id: true, name: true, assetType: true, environment: true, owner: { select: { displayName: true } } },
  });
  return (
    <Shell>
      <PageHeader title="Technical assets" description={canManageAssets(user) ? "What exists and who owns it. Never store passwords, keys or tokens." : "Read-only. The Technology head maintains this inventory."}
        actions={canManageAssets(user) && <Link className="btn" href="/assets/new"><Plus className="ic" aria-hidden="true" />Add asset</Link>} />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      <nav aria-label="View" className="btn-row" style={{ marginBottom: "1rem" }}>
        <Link className={!retired ? "btn" : "btn ghost"} href="/assets" aria-current={!retired ? "page" : undefined}>Active</Link>
        <Link className={retired ? "btn" : "btn ghost"} href="/assets?view=retired" aria-current={retired ? "page" : undefined}>Retired</Link>
      </nav>
      <form method="get" className="btn-row" style={{ marginBottom: "1rem" }}>
        {retired && <input type="hidden" name="view" value="retired" />}
        <label htmlFor="type" className="muted">Type</label>
        <select id="type" name="type" defaultValue={type ?? ""}><option value="">All</option>{ASSET_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <label htmlFor="env" className="muted">Environment</label>
        <select id="env" name="env" defaultValue={env ?? ""}><option value="">All</option>{ENVIRONMENTS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <button type="submit" className="quiet sm">Filter</button>
      </form>
      {rows.length === 0 ? (
        <div className="table-wrap"><EmptyState icon={Server} title="No assets">{retired ? "Retired assets appear here." : "Add the first asset to start the inventory."}</EmptyState></div>
      ) : (
        <div className="table-wrap"><div className="table-scroll">
          <table className="responsive">
            <thead><tr><th>Asset</th><th>Type</th><th>Environment</th><th>Owner</th></tr></thead>
            <tbody>{rows.map((a) => (
              <tr key={a.id}>
                <td className="primary"><Link className="row-link" href={`/assets/${a.id}`}>{a.name}</Link></td>
                <td data-label="Type">{a.assetType}</td><td data-label="Environment">{a.environment}</td>
                <td data-label="Owner">{a.owner ? <Person name={a.owner.displayName} /> : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div></div>
      )}
    </Shell>
  );
}
