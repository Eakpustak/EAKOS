import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { FolderKanban, Plus } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ProjectTable } from "@/lib/project-ui";
import { Flash } from "@/lib/task-ui";
import { EmptyState, PageHeader } from "@/lib/ui";
import { OPEN_PROJECT_STATUSES, PROJECT_STATUSES, PROJECT_STATUS_LABEL, visibleProjectWhere } from "@/lib/projects";

export const dynamic = "force-dynamic";

type SP = { status?: string; error?: string; ok?: string };

export default async function Projects({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const status = searchParams.status ?? "open";
  const and: Prisma.ProjectWhereInput[] = [visibleProjectWhere(user)];
  if (status === "open") and.push({ status: { in: OPEN_PROJECT_STATUSES } });
  else if ((PROJECT_STATUSES as readonly string[]).includes(status)) and.push({ status: status as (typeof PROJECT_STATUSES)[number] });

  const rows = await db.project.findMany({
    where: { AND: and },
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 100,
    include: { owner: { select: { displayName: true } }, department: { select: { name: true } }, milestones: { select: { status: true } } },
  });
  const tabs = [["open", "Open"], ...PROJECT_STATUSES.filter((s) => s !== "ACTIVE" && s !== "ON_HOLD").map((s) => [s, PROJECT_STATUS_LABEL[s]])] as [string, string][];

  return (
    <Shell>
      <PageHeader
        title="Projects"
        description="Delivery work with one owner, milestones and linked tasks. You see projects you own, created or were added to; department heads see their department's."
        actions={user.memberships.length > 0 && <Link className="btn" href="/projects/new"><Plus className="ic" aria-hidden="true" />New project</Link>}
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      <nav aria-label="Filter by status" className="btn-row" style={{ marginBottom: "1rem" }}>
        {tabs.map(([v, label]) => (
          <Link key={v} className={status === v ? "btn" : "btn ghost"} href={`/projects?status=${v}`} aria-current={status === v ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
      {rows.length === 0 && status === "open" ? (
        <div className="table-wrap">
          <EmptyState icon={FolderKanban} title="No open projects">Accepted handovers can be turned into a delivery project from the handover page.</EmptyState>
        </div>
      ) : (
        <ProjectTable rows={rows} empty="Nothing matches this filter." />
      )}
    </Shell>
  );
}
