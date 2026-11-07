import Link from "next/link";
import { Siren } from "lucide-react";
import { incidentStatusLabel, severityLabel } from "./incidents";
import { fmtDateTime } from "./tasks";
import { EmptyState, Person } from "./ui";

export function SeverityBadge({ severity }: { severity: string }) {
  const cls = severity === "CRITICAL" || severity === "HIGH" ? "lv-rejected" : severity === "MEDIUM" ? "lv-open" : "lv-closed";
  return <span className={`badge ${cls}`}>{severityLabel(severity)}</span>;
}
export function IncidentStatusBadge({ status }: { status: string }) {
  const cls = status === "RESOLVED" ? "lv-resolved" : status === "MITIGATED" ? "lv-ordered" : status === "INVESTIGATING" ? "lv-in_progress" : "lv-open";
  return <span className={`badge ${cls}`}>{incidentStatusLabel(status)}</span>;
}
type Row = { id: string; title: string; severity: string; status: string; createdAt: Date; assignee: { displayName: string } | null; asset: { name: string } | null };
export function IncidentTable({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <div className="table-wrap"><EmptyState icon={Siren} title="No incidents">{empty}</EmptyState></div>;
  return (
    <div className="table-wrap"><div className="table-scroll">
      <table className="responsive">
        <thead><tr><th>Incident</th><th>Severity</th><th>Status</th><th>Asset</th><th>Assigned</th><th>Reported</th></tr></thead>
        <tbody>{rows.map((x) => (
          <tr key={x.id}>
            <td className="primary"><Link className="row-link" href={`/incidents/${x.id}`}>{x.title}</Link></td>
            <td data-label="Severity"><SeverityBadge severity={x.severity} /></td>
            <td data-label="Status"><IncidentStatusBadge status={x.status} /></td>
            <td data-label="Asset">{x.asset?.name ?? "—"}</td>
            <td data-label="Assigned">{x.assignee ? <Person name={x.assignee.displayName} /> : "Unassigned"}</td>
            <td data-label="Reported" className="num">{fmtDateTime(x.createdAt)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div></div>
  );
}
