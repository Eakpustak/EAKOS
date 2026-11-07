import Link from "next/link";
import { Receipt } from "lucide-react";
import { expenseStatusLabel, formatMoney } from "./expenses";
import { fmtDate } from "./tasks";
import { EmptyState, Person } from "./ui";

export function ExpenseStatusBadge({ status }: { status: string }) {
  return <span className={`badge lv-${status.toLowerCase()}`}>{expenseStatusLabel(status)}</span>;
}

type Row = { id: string; amountMinor: number; currency: string; category: string; expenseDate: Date; status: string; submittedBy: { displayName: string } };

export function ExpenseTable({ rows, empty, showPerson }: { rows: Row[]; empty: string; showPerson?: boolean }) {
  if (rows.length === 0) return <div className="table-wrap"><EmptyState icon={Receipt} title="Nothing here">{empty}</EmptyState></div>;
  return (
    <div className="table-wrap"><div className="table-scroll">
      <table className="responsive">
        <thead><tr>{showPerson && <th>Person</th>}<th>Date</th><th>Category</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              {showPerson && <td className="primary"><Person name={x.submittedBy.displayName} /></td>}
              <td className={showPerson ? "num" : "primary num"} data-label="Date"><Link className="row-link" href={`/expenses/${x.id}`}>{fmtDate(x.expenseDate)}</Link></td>
              <td data-label="Category">{x.category}</td>
              <td data-label="Amount" className="num">{formatMoney(x.amountMinor, x.currency)}</td>
              <td data-label="Status"><ExpenseStatusBadge status={x.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div></div>
  );
}
