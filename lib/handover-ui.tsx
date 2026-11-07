import Link from "next/link";
import { Handshake } from "lucide-react";
import { HANDOVER_STATUS_LABEL, ageLabel, isAckOverdue } from "./handovers";
import { fmtDate } from "./tasks";
import { EmptyState, Person } from "./ui";

export function HandoverStatusBadge({ status }: { status: string }) {
  return <span className={`badge ho-${status.toLowerCase()}`}>{HANDOVER_STATUS_LABEL[status] ?? status}</span>;
}

type Row = {
  id: string; title: string; status: string; dueAt: Date | null; sentAt: Date;
  fromDepartment: { name: string }; toDepartment: { name: string };
  sender: { displayName: string }; receiver: { displayName: string };
};

function todayUtcStr() {
  return new Date().toISOString().slice(0, 10);
}

export function HandoverTable({ rows, empty, children }: { rows: Row[]; empty: string; children?: React.ReactNode }) {
  if (rows.length === 0) {
    return (
      <div className="table-wrap">
        <EmptyState icon={Handshake} title="Nothing here">{empty}</EmptyState>
      </div>
    );
  }
  const now = new Date();
  return (
    <div className="table-wrap">
      <div className="table-scroll">
        <table className="responsive">
          <thead><tr><th>Handover</th><th>From</th><th>To</th><th>Status</th><th>Due</th></tr></thead>
          <tbody>
            {rows.map((h) => {
              const ackLate = isAckOverdue(h, now);
              const late = h.status === "ACCEPTED" && !!h.dueAt && h.dueAt.toISOString().slice(0, 10) < todayUtcStr();
              return (
                <tr key={h.id}>
                  <td className="primary"><Link className="row-link" href={`/handovers/${h.id}`}>{h.title}</Link></td>
                  <td data-label="From"><Person name={h.sender.displayName} sub={h.fromDepartment.name} /></td>
                  <td data-label="To"><Person name={h.receiver.displayName} sub={h.toDepartment.name} /></td>
                  <td data-label="Status">
                    <span className="status-cell">
                      <HandoverStatusBadge status={h.status} />
                      {h.status === "PENDING" && (
                        <span className={`sub-line${ackLate ? " overdue" : ""}`}>
                          {ackLate ? "Not acknowledged · " : "Waiting · "}{ageLabel(h.sentAt, now)}
                        </span>
                      )}
                    </span>
                  </td>
                  <td data-label="Due" className={`num${late ? " overdue" : ""}`}>{fmtDate(h.dueAt)}{late ? " · overdue" : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {children}
    </div>
  );
}
