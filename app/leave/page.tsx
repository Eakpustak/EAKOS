import Link from "next/link";
import { Plus } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LeaveTable } from "@/lib/leave-ui";
import { Flash } from "@/lib/task-ui";
import { PageHeader } from "@/lib/ui";
import { isHrHead } from "@/lib/leave";

export const dynamic = "force-dynamic";

export default async function Leave({ searchParams }: { searchParams: { view?: string; error?: string; ok?: string } }) {
  const user = await requireUser();
  const heads = user.memberships.filter((m) => m.type === "HEAD").map((m) => m.departmentId);
  const hr = isHrHead(user);
  const views = [["mine", "My requests"], ...(heads.length ? [["review", "To decide"]] : []), ...(hr ? [["all", "Everyone (read-only)"]] : [])] as [string, string][];
  const view = views.some(([v]) => v === searchParams.view) ? searchParams.view! : "mine";

  const where =
    view === "review" ? { approverDepartmentId: { in: heads }, requesterId: { not: user.id }, status: "PENDING" as const }
    : view === "all" ? {}
    : { requesterId: user.id };
  const rows = await db.leaveRequest.findMany({
    where, orderBy: [{ status: "asc" }, { startDate: "desc" }], take: 100,
    select: { id: true, leaveType: true, startDate: true, endDate: true, status: true, requester: { select: { displayName: true } } },
  });

  return (
    <Shell>
      <PageHeader
        title="Leave"
        description="Ask for leave and see the decision here. Reasons are visible only to you, the approving department head and the HR head."
        actions={<Link className="btn" href="/leave/new"><Plus className="ic" aria-hidden="true" />Request leave</Link>}
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {views.length > 1 && (
        <nav aria-label="View" className="btn-row" style={{ marginBottom: "1rem" }}>
          {views.map(([v, label]) => <Link key={v} className={view === v ? "btn" : "btn ghost"} href={`/leave?view=${v}`} aria-current={view === v ? "page" : undefined}>{label}</Link>)}
        </nav>
      )}
      <LeaveTable
        rows={rows} showPerson={view !== "mine"}
        empty={view === "review" ? "No requests are waiting for your decision." : view === "all" ? "No leave requests yet." : "You have not asked for leave yet."}
      />
    </Shell>
  );
}
