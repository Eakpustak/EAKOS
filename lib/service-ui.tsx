import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { priorityLabel, serviceStatusLabel } from "./service-requests";
import { fmtDate } from "./tasks";
import { EmptyState, Person } from "./ui";

export function ServiceStatusBadge({ status }: { status: string }) {
  return <span className={`badge lv-${status.toLowerCase()}`}>{serviceStatusLabel(status)}</span>;
}

type Row = { id: string; title: string; category: string; priority: string; createdAt: Date; status: string; requester: { displayName: string } };

export function ServiceTable({ rows, empty, showPerson }: { rows: Row[]; empty: string; showPerson?: boolean }) {
  if (rows.length === 0) return <div className="table-wrap"><EmptyState icon={LifeBuoy} title="Nothing here">{empty}</EmptyState></div>;
  return (
    <div className="table-wrap"><div className="table-scroll">
      <table className="responsive">
        <thead><tr>{showPerson && <th>Person</th>}<th>Request</th><th>Category</th><th>Priority</th><th>Opened</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              {showPerson && <td className="primary"><Person name={x.requester.displayName} /></td>}
              <td className={showPerson ? undefined : "primary"} data-label="Request"><Link className="row-link" href={`/service-requests/${x.id}`}>{x.title}</Link></td>
              <td data-label="Category">{x.category}</td>
              <td data-label="Priority">{priorityLabel(x.priority)}</td>
              <td data-label="Opened" className="num">{fmtDate(x.createdAt)}</td>
              <td data-label="Status"><ServiceStatusBadge status={x.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div></div>
  );
}
