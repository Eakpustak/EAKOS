import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ConfirmSubmit } from "@/lib/confirm";
import { assetStatusLabel, canManageAssets, canViewAssets } from "@/lib/assets";
import { safeHttpUrl } from "@/lib/hub";
import { TECHNOLOGY_SLUG } from "@/lib/checklists";
import { Flash } from "@/lib/task-ui";
import { fmtDateTime } from "@/lib/tasks";
import { PageHeader, Person } from "@/lib/ui";
import { setAssetStatus, updateAsset } from "../actions";
import { AssetFields } from "../asset-form";

export const dynamic = "force-dynamic";

export default async function AssetDetail({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | undefined> }) {
  const user = await requireUser();
  if (!canViewAssets(user)) redirect("/");
  const a = await db.techAsset.findUnique({ where: { id: params.id }, include: { owner: { select: { displayName: true } }, createdBy: { select: { displayName: true } } } });
  if (!a) redirect("/assets");
  const manage = canManageAssets(user);
  const owners = manage ? await db.user.findMany({ where: { status: "ACTIVE", memberships: { some: { department: { slug: TECHNOLOGY_SLUG } } } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } }) : [];
  // After a failed save, the submitted name/type/env/owner come back in the query string; notes and link are re-read from storage.
  const shown = searchParams.name !== undefined ? { ...a, name: searchParams.name, assetType: searchParams.assetType, environment: searchParams.environment, ownerId: searchParams.ownerId } : a;
  const link = a.url ? safeHttpUrl(a.url) : null;
  return (
    <Shell>
      <PageHeader title={a.name} crumbs={[{ label: "Technical assets", href: "/assets" }, { label: "Asset" }]} description={`${a.assetType} · ${a.environment} · ${assetStatusLabel(a.status)}`} />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {manage ? (
        <>
          <form action={updateAsset} className="panel form-narrow">
            <input type="hidden" name="id" value={a.id} /><input type="hidden" name="version" value={String(a.updatedAt.getTime())} />
            <AssetFields v={shown} owners={owners} />
            <div className="btn-row"><button type="submit">Save changes</button><Link className="btn ghost" href="/assets">Back</Link></div>
          </form>
          <form action={setAssetStatus} className="panel form-narrow" style={{ marginTop: "1rem" }}>
            <input type="hidden" name="id" value={a.id} /><input type="hidden" name="to" value={a.status === "ACTIVE" ? "RETIRED" : "ACTIVE"} />
            <h2>{a.status === "ACTIVE" ? "Retire" : "Reactivate"}</h2>
            <p className="muted">{a.status === "ACTIVE" ? "Moves it to the Retired list. Nothing is deleted." : "Puts it back on the active list."}</p>
            <div className="btn-row">{a.status === "ACTIVE"
              ? <ConfirmSubmit danger label="Retire asset" title="Retire this asset?" message="It moves to the Retired list and can be reactivated later." confirmLabel="Retire" />
              : <button type="submit">Reactivate asset</button>}</div>
          </form>
        </>
      ) : (
        <section className="card"><div className="card-body"><dl className="props">
          <div><dt>Owner</dt><dd>{a.owner?.displayName ?? "—"}</dd></div>
          <div><dt>Link</dt><dd>{link ? <a href={link} rel="noopener noreferrer nofollow" target="_blank">{link}</a> : "—"}</dd></div>
          <div><dt>Notes</dt><dd>{a.notes ?? "—"}</dd></div>
        </dl></div></section>
      )}
      <p className="hint" style={{ marginTop: "1rem" }}>Added by <Person name={a.createdBy.displayName} /> on <span className="num">{fmtDateTime(a.createdAt)}</span>. Last changed <span className="num">{fmtDateTime(a.updatedAt)}</span>.</p>
    </Shell>
  );
}
