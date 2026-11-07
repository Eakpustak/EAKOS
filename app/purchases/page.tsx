import Link from "next/link";
import { Plus } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PurchaseTable } from "@/lib/purchase-ui";
import { Flash } from "@/lib/task-ui";
import { PageHeader } from "@/lib/ui";
import { purchaseViews, purchaseWhere } from "@/lib/purchases";

export const dynamic = "force-dynamic";

export default async function Purchases({ searchParams }: { searchParams: { view?: string; error?: string; ok?: string } }) {
  const user = await requireUser();
  const views = purchaseViews(user);
  const view = views.some(([v]) => v === searchParams.view) ? searchParams.view! : "mine";
  // The scope comes from stored roles; an unauthorised ?view= falls back to the person's own requests.
  const rows = await db.purchaseRequest.findMany({
    where: purchaseWhere(user, view), orderBy: [{ createdAt: "desc" }], take: 100,
    select: { id: true, title: true, quantity: true, estimatedMinor: true, currency: true, createdAt: true, status: true, requester: { select: { displayName: true } } },
  });
  return (
    <Shell>
      <PageHeader
        title="Purchases"
        description="Ask to buy something, see who decides it and whether it has been ordered. This is an administrative record; nothing is bought or paid here."
        actions={<Link className="btn" href="/purchases/new"><Plus className="ic" aria-hidden="true" />New request</Link>}
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {views.length > 1 && (
        <nav aria-label="View" className="btn-row" style={{ marginBottom: "1rem" }}>
          {views.map(([v, label]) => <Link key={v} className={view === v ? "btn" : "btn ghost"} href={`/purchases?view=${v}`} aria-current={view === v ? "page" : undefined}>{label}</Link>)}
        </nav>
      )}
      <PurchaseTable
        rows={rows} showPerson={view !== "mine"}
        empty={view === "review" ? "No purchase requests are waiting for your decision." : view === "order" ? "No approved requests are waiting to be ordered." : view === "all" ? "No approved requests yet." : "You have not made a purchase request yet."}
      />
    </Shell>
  );
}
