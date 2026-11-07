import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { projectStatusLabel, milestoneProgress } from "./projects";
import { fmtDate } from "./tasks";
import { EmptyState, Person } from "./ui";

export function ProjectStatusBadge({ status }: { status: string }) {
  return <span className={`badge pj-${status.toLowerCase()}`}>{projectStatusLabel(status)}</span>;
}

export function Progress({ done, total, pct }: { done: number; total: number; pct: number }) {
  if (total === 0) return <span className="muted">No milestones</span>;
  return (
    <span className="progress-wrap">
      <span className="progress" role="img" aria-label={`${done} of ${total} milestones done`}><span style={{ width: `${pct}%` }} /></span>
      <span className="num">{done}/{total}</span>
    </span>
  );
}

type Row = {
  id: string; name: string; status: string; dueAt: Date | null;
  owner: { displayName: string }; department: { name: string }; milestones: { status: string }[];
};

export function ProjectTable({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) {
    return <div className="table-wrap"><EmptyState icon={FolderKanban} title="No projects here">{empty}</EmptyState></div>;
  }
  return (
    <div className="table-wrap">
      <div className="table-scroll">
        <table className="responsive">
          <thead><tr><th>Project</th><th>Status</th><th>Owner</th><th>Progress</th><th>Due</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="primary">
                  <Link className="row-link" href={`/projects/${p.id}`}>{p.name}</Link>
                  <span className="sub-line">{p.department.name}</span>
                </td>
                <td data-label="Status"><ProjectStatusBadge status={p.status} /></td>
                <td data-label="Owner"><Person name={p.owner.displayName} /></td>
                <td data-label="Progress"><Progress {...milestoneProgress(p.milestones)} /></td>
                <td data-label="Due" className="num">{fmtDate(p.dueAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
