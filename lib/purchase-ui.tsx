import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { formatMoney, purchaseStatusLabel } from "./purchases";
import { fmtDate } from "./tasks";
import { EmptyState, Person } from "./ui";

export function PurchaseStatusBadge({ status }: { status: string }) {
  return <span className={`badge lv-${status.toLowerCase()}`}>{purchaseStatusLabel(status)}</span>;
}

type Row = { id: string; title: string; quantity: number; estimatedMinor: number; currency: string; createdAt: Date; status: string; requester: { displayName: string } };

export function PurchaseTable({ rows, empty, showPerson }: { rows: Row[]; empty: string; showPerson?: boolean }) {
  if (rows.length === 0) return <div className="table-wrap"><EmptyState icon={ShoppingCart} title="Nothing here">{empty}</EmptyState></div>;
  return (
    <div className="table-wrap"><div className="table-scroll">
      <table className="responsive">
        <thead><tr>{showPerson && <th>Person</th>}<th>Item</th><th>Qty</th><th>Estimate</th><th>Requested</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              {showPerson && <td className="primary"><Person name={x.requester.displayName} /></td>}
              <td className={showPerson ? undefined : "primary"} data-label="Item"><Link className="row-link" href={`/purchases/${x.id}`}>{x.title}</Link></td>
              <td data-label="Qty" className="num">{x.quantity}</td>
              <td data-label="Estimate" className="num">{formatMoney(x.estimatedMinor, x.currency)}</td>
              <td data-label="Requested" className="num">{fmtDate(x.createdAt)}</td>
              <td data-label="Status"><PurchaseStatusBadge status={x.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div></div>
  );
}
