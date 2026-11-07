import Link from "next/link";
import { Plus } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ExpenseTable } from "@/lib/expense-ui";
import { Flash } from "@/lib/task-ui";
import { PageHeader } from "@/lib/ui";
import { expenseViews, expenseWhere } from "@/lib/expenses";

export const dynamic = "force-dynamic";

export default async function Expenses({ searchParams }: { searchParams: { view?: string; error?: string; ok?: string } }) {
  const user = await requireUser();
  const views = expenseViews(user);
  const view = views.some(([v]) => v === searchParams.view) ? searchParams.view! : "mine";
  // The scope comes from stored roles; an unauthorised ?view= falls back to the person's own expenses.
  const rows = await db.expense.findMany({
    where: expenseWhere(user, view), orderBy: [{ createdAt: "desc" }], take: 100,
    select: { id: true, amountMinor: true, currency: true, category: true, expenseDate: true, status: true, submittedBy: { select: { displayName: true } } },
  });
  return (
    <Shell>
      <PageHeader
        title="Expenses"
        description="Submit an expense, see who decides it and whether it has been paid. This is an administrative record, not accounting."
        actions={<Link className="btn" href="/expenses/new"><Plus className="ic" aria-hidden="true" />New expense</Link>}
      />
      <Flash error={searchParams.error} ok={searchParams.ok} />
      {views.length > 1 && (
        <nav aria-label="View" className="btn-row" style={{ marginBottom: "1rem" }}>
          {views.map(([v, label]) => <Link key={v} className={view === v ? "btn" : "btn ghost"} href={`/expenses?view=${v}`} aria-current={view === v ? "page" : undefined}>{label}</Link>)}
        </nav>
      )}
      <ExpenseTable
        rows={rows} showPerson={view !== "mine"}
        empty={view === "review" ? "No expenses are waiting for your decision." : view === "pay" ? "No approved expenses are waiting for payment." : view === "all" ? "No expenses yet." : "You have not submitted an expense yet."}
      />
    </Shell>
  );
}
