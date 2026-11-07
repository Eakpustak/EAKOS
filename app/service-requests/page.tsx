import Link from "next/link";
import { Plus } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ServiceTable } from "@/lib/service-ui";
import { Flash } from "@/lib/task-ui";
import { PageHeader } from "@/lib/ui";
import { serviceViews, serviceWhere } from "@/lib/service-requests";

export const dynamic = "force-dynamic";

export default async function ServiceRequests({ searchParams }: { searchParams: { view?: string; error?: string; ok?: string } }) {
  const user = await requireUser();
  const views = serviceViews(user);
  const view = views.some(([v]) => v === searchParams.view) ? searchParams.view! : "mine";
  // The scope comes from stored roles; an unauthorised ?view= falls back to the person's own requests.
  const rows = await db.serviceRequest.findMany({
    where: serviceWhere(user, view), orderBy: [{ createdAt: "desc" }], take: 100,
    select: { id: true, title: true, category: true, priority: true, createdAt: true, status: true, requester: { select: { displayName: true } } },
  });
  return (
    <Shell>
      <PageHeader
        title="Service requests"
        description="Ask Technology or Operations for help and see who is handling it."
        actions={<Link className="btn" href="/service-requests/new"><Plus className="ic" aria-hidden="true" />New request</Link>}
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      <nav aria-label="View" className="btn-row" style={{ marginBottom: "1rem" }}>
        {views.map(([v, label]) => <Link key={v} className={view === v ? "btn" : "btn ghost"} href={`/service-requests?view=${v}`} aria-current={view === v ? "page" : undefined}>{label}</Link>)}
      </nav>
      <ServiceTable
        rows={rows} showPerson={view !== "mine"}
        empty={view === "queue" ? "No open requests for your team." : view === "assigned" ? "Nothing is assigned to you." : "You have not made a service request yet."}
      />
    </Shell>
  );
}
