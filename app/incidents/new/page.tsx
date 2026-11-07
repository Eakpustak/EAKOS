import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_DESC, MAX_TITLE, SEVERITIES, canReportIncident, severityLabel } from "@/lib/incidents";
import { Flash } from "@/lib/task-ui";
import { Field, PageHeader } from "@/lib/ui";
import { reportIncident } from "../actions";

export const dynamic = "force-dynamic";
type P = { error?: string; title?: string; severity?: string; assetId?: string; clientToken?: string };

export default async function NewIncident({ searchParams }: { searchParams: P }) {
  const user = await requireUser();
  if (!canReportIncident(user)) redirect("/");
  const v = searchParams;
  const assets = await db.techAsset.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, take: 300, select: { id: true, name: true } });
  return (
    <Shell>
      <PageHeader title="Report incident" crumbs={[{ label: "Incidents", href: "/incidents" }, { label: "Report" }]} description="The Technology head assigns it. Do not paste passwords, keys, tokens or customer data." />
      <Flash error={v.error} />
      <form action={reportIncident} className="panel form-narrow">
        <input type="hidden" name="clientToken" value={v.clientToken || randomUUID()} />
        <div className="form-grid">
          <div className="full"><Field id="title" label="Title" required><input id="title" name="title" type="text" maxLength={MAX_TITLE} required defaultValue={v.title ?? ""} /></Field></div>
          <Field id="severity" label="Severity" required>
            <select id="severity" name="severity" required defaultValue={v.severity ?? ""}><option value="" disabled>Choose…</option>{SEVERITIES.map((s) => <option key={s} value={s}>{severityLabel(s)}</option>)}</select>
          </Field>
          <Field id="assetId" label="Affected asset" hint="Optional.">
            <select id="assetId" name="assetId" defaultValue={v.assetId ?? ""}><option value="">None / unknown</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
          <div className="full"><Field id="description" label="What is happening?" required hint="What is affected, since when, and what you have seen.">
            <textarea id="description" name="description" rows={5} maxLength={MAX_DESC} required />
          </Field></div>
        </div>
        <div className="btn-row"><button type="submit">Report incident</button><Link className="btn ghost" href="/incidents">Cancel</Link></div>
      </form>
    </Shell>
  );
}
