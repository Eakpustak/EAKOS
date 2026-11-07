import Link from "next/link";
import { Rocket } from "lucide-react";
import { releaseStatusLabel } from "./releases";
import { fmtDateTime } from "./tasks";
import { EmptyState } from "./ui";

export function ReleaseStatusBadge({ status }: { status: string }) {
  const cls = status === "DEPLOYED" ? "lv-resolved" : status === "FAILED" ? "lv-rejected" : status === "ROLLED_BACK" ? "lv-ordered" : status === "CANCELLED" ? "lv-cancelled" : "lv-open";
  return <span className={`badge ${cls}`}>{releaseStatusLabel(status)}</span>;
}
type Row = { id: string; version: string; environment: string; status: string; createdAt: Date; deployedAt: Date | null; asset: { name: string } };
export function ReleaseTable({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <div className="table-wrap"><EmptyState icon={Rocket} title="No releases">{empty}</EmptyState></div>;
  return (
    <div className="table-wrap"><div className="table-scroll">
      <table className="responsive">
        <thead><tr><th>Release</th><th>Asset</th><th>Environment</th><th>Status</th><th>Recorded</th><th>Deployed</th></tr></thead>
        <tbody>{rows.map((x) => (
          <tr key={x.id}>
            <td className="primary"><Link className="row-link" href={`/releases/${x.id}`}>{x.version}</Link></td>
            <td data-label="Asset">{x.asset.name}</td>
            <td data-label="Environment">{x.environment}</td>
            <td data-label="Status"><ReleaseStatusBadge status={x.status} /></td>
            <td data-label="Recorded" className="num">{fmtDateTime(x.createdAt)}</td>
            <td data-label="Deployed" className="num">{x.deployedAt ? fmtDateTime(x.deployedAt) : "—"}</td>
          </tr>
        ))}</tbody>
      </table>
    </div></div>
  );
}
