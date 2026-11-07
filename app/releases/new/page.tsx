import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_SUMMARY, MAX_VERSION, canCreateRelease } from "@/lib/releases";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader } from "@/lib/ui";
import { createRelease } from "../actions";

export const dynamic = "force-dynamic";
type P = { error?: string; version?: string; assetId?: string; commitRef?: string; clientToken?: string };

export default async function NewRelease({ searchParams }: { searchParams: P }) {
  const user = await requireUser();
  if (!canCreateRelease(user)) redirect("/");
  const v = searchParams;
  const assets = await db.techAsset.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, take: 300, select: { id: true, name: true, environment: true } });
  return (
    <Shell>
      <PageHeader title="Plan release" crumbs={[{ label: "Releases", href: "/releases" }, { label: "Plan" }]} description="This records a release; it does not deploy anything. Do not paste passwords, keys or tokens." />
      <Flash error={v.error} />
      <form action={createRelease} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={v.clientToken || randomUUID()} />
        <div className="form-grid">
          <Field id="version" label="Version or name" required hint="For example v1.4.2 or 2026-11-25 hotfix."><input id="version" name="version" type="text" maxLength={MAX_VERSION} required defaultValue={v.version ?? ""} /></Field>
          <Field id="assetId" label="Asset" required hint="The environment comes from the asset.">
            <select id="assetId" name="assetId" required defaultValue={v.assetId ?? ""}><option value="" disabled>Choose…</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.environment})</option>)}</select>
          </Field>
          <Field id="commitRef" label="Commit id" hint="Optional. 7 to 40 hex characters from GitHub."><input id="commitRef" name="commitRef" type="text" maxLength={40} autoComplete="off" spellCheck={false} defaultValue={v.commitRef ?? ""} /></Field>
          <Field id="changeUrl" label="Link to the change" hint="Optional. A GitHub pull request, release or issue."><input id="changeUrl" name="changeUrl" type="url" maxLength={500} /></Field>
          <div className="full"><Field id="summary" label="What changes?" required><textarea id="summary" name="summary" rows={4} maxLength={MAX_SUMMARY} required /></Field></div>
        </div>
        <div className="btn-row"><button type="submit">Plan release</button><Link className="btn ghost" href="/releases">Cancel</Link></div>
      </form>
    </Shell>
  );
}
