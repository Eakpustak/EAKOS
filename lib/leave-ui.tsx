import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { leaveDays, leaveStatusLabel } from "./leave";
import { fmtDate } from "./tasks";
import { EmptyState, Person } from "./ui";

export function LeaveStatusBadge({ status }: { status: string }) {
  return <span className={`badge lv-${status.toLowerCase()}`}>{leaveStatusLabel(status)}</span>;
}

type Row = { id: string; leaveType: string; startDate: Date; endDate: Date; status: string; requester: { displayName: string } };

export function LeaveTable({ rows, empty, showPerson }: { rows: Row[]; empty: string; showPerson?: boolean }) {
  if (rows.length === 0) return <div className="table-wrap"><EmptyState icon={CalendarDays} title="Nothing here">{empty}</EmptyState></div>;
  return (
    <div className="table-wrap">
      <div className="table-scroll">
        <table className="responsive">
          <thead><tr>{showPerson && <th>Person</th>}<th>Dates</th><th>Type</th><th>Days</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                {showPerson && <td className="primary"><Person name={l.requester.displayName} /></td>}
                <td className={showPerson ? "num" : "primary num"} data-label="Dates">
                  <Link className="row-link" href={`/leave/${l.id}`}>{fmtDate(l.startDate)} – {fmtDate(l.endDate)}</Link>
                </td>
                <td data-label="Type">{l.leaveType}</td>
                <td data-label="Days" className="num">{leaveDays(l.startDate, l.endDate)}</td>
                <td data-label="Status"><LeaveStatusBadge status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
