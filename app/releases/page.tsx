import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ReleaseTable } from "@/lib/release-ui";
import { canCreateRelease, canViewReleases } from "@/lib/releases";
import { Flash } from "@/lib/task-ui";
import { PageHeader } from "@/lib/ui";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
const VIEWS = [["planned", "Planned"], ["deployed", "Deployed"], ["problems", "Failed or rolled back"], ["all", "All"]] as const;
const PAGE = 25;

export default async function Releases({ searchParams }: { searchParams: { view?: string; page?: string; error?: string; ok?: string } }) {
  const user = await requireUser();
  if (!canViewReleases(user)) redirect("/");
  const view = VIEWS.some(([v]) => v === searchParams.view) ? searchParams.view! : "planned";
  const page = Math.max(1, Math.min(1000, Number(searchParams.page) || 1));
  const where: Prisma.ReleaseWhereInput = view === "planned" ? { status: "PLANNED" } : view === "deployed" ? { status: "DEPLOYED" } : view === "problems" ? { status: { in: ["FAILED", "ROLLED_BACK"] } } : {};
  const [rows, total] = await Promise.all([
    db.release.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE,
      select: { id: true, version: true, environment: true, status: true, createdAt: true, deployedAt: true, asset: { select: { name: true } } } }),
    db.release.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <Shell>
      <PageHeader title="Releases" description="Deployment and release records. GitHub stays the source of truth for code; never paste secrets here."
        actions={canCreateRelease(user) && <Link className="btn" href="/releases/new"><Plus className="ic" aria-hidden="true" />Plan release</Link>} />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      <nav aria-label="View" className="btn-row" style={{ marginBottom: "1rem" }}>
        {VIEWS.map(([v, l]) => <Link key={v} className={view === v ? "btn" : "btn ghost"} href={`/releases?view=${v}`} aria-current={view === v ? "page" : undefined}>{l}</Link>)}
      </nav>
      <ReleaseTable rows={rows} empty={view === "planned" ? "No releases are planned." : "Nothing here yet."} />
      {pages > 1 && <p className="hint" style={{ marginTop: "1rem" }}>Page {page} of {pages} · {page > 1 && <Link href={`/releases?view=${view}&page=${page - 1}`}>Previous</Link>}{page > 1 && page < pages && " · "}{page < pages && <Link href={`/releases?view=${view}&page=${page + 1}`}>Next</Link>}</p>}
    </Shell>
  );
}
