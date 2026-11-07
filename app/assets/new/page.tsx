import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageAssets } from "@/lib/assets";
import { TECHNOLOGY_SLUG } from "@/lib/checklists";
import { Flash } from "@/lib/task-ui";
import { PageHeader } from "@/lib/ui";
import { createAsset } from "../actions";
import { AssetFields } from "../asset-form";

export const dynamic = "force-dynamic";
type P = { error?: string; name?: string; assetType?: string; environment?: string; ownerId?: string; clientToken?: string };

export default async function NewAsset({ searchParams }: { searchParams: P }) {
  const user = await requireUser();
  if (!canManageAssets(user)) redirect("/");
  const owners = await db.user.findMany({ where: { status: "ACTIVE", memberships: { some: { department: { slug: TECHNOLOGY_SLUG } } } }, orderBy: { displayName: "asc" }, select: { id: true, displayName: true } });
  return (
    <Shell>
      <PageHeader title="Add asset" crumbs={[{ label: "Technical assets", href: "/assets" }, { label: "Add asset" }]} description="Names are unique. An asset is retired, never deleted." />
      <Flash error={searchParams.error} />
      <form action={createAsset} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={searchParams.clientToken || randomUUID()} />
        <AssetFields v={searchParams} owners={owners} />
        <div className="btn-row"><button type="submit">Add asset</button><Link className="btn ghost" href="/assets">Cancel</Link></div>
      </form>
    </Shell>
  );
}
