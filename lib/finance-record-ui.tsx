import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { formatMoney, kindLabel, lateDays, lateState, recordStatusLabel } from "./finance-records";
import { fmtDate } from "./tasks";
import { EmptyState } from "./ui";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function RecordStatusBadge({ kind, status, dueDate, today }: { kind: string; status: string; dueDate: Date | null; today: string }) {
  const late = lateState(kind, status, dueDate ? iso(dueDate) : null, today);
  if (late) return <span className="badge lv-rejected">{late === "overdue" ? "Overdue" : "Expired"}{dueDate ? ` · ${lateDays(iso(dueDate), today)}d` : ""}</span>;
  return <span className={`badge lv-${status.toLowerCase()}`}>{recordStatusLabel(status)}</span>;
}

type Row = { id: string; kind: string; reference: string; amountMinor: number; currency: string; issueDate: Date; dueDate: Date | null; status: string; vendor: { name: string } };

export function RecordTable({ rows, today, empty }: { rows: Row[]; today: string; empty: string }) {
  if (rows.length === 0) return <div className="table-wrap"><EmptyState icon={FileSpreadsheet} title="Nothing here">{empty}</EmptyState></div>;
  return (
    <div className="table-wrap"><div className="table-scroll">
      <table className="responsive">
        <thead><tr><th>Number</th><th>Vendor</th><th>Type</th><th>Amount</th><th>Dated</th><th>Due / valid until</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              <td className="primary"><Link className="row-link" href={`/invoices/${x.id}`}>{x.reference}</Link></td>
              <td data-label="Vendor">{x.vendor.name}</td>
              <td data-label="Type">{kindLabel(x.kind)}</td>
              <td data-label="Amount" className="num">{formatMoney(x.amountMinor, x.currency)}</td>
              <td data-label="Dated" className="num">{fmtDate(x.issueDate)}</td>
              <td data-label="Due / valid until" className="num">{fmtDate(x.dueDate)}</td>
              <td data-label="Status"><RecordStatusBadge kind={x.kind} status={x.status} dueDate={x.dueDate} today={today} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div></div>
  );
}
