import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { fmtDate, isOverdue } from "./tasks";
import { Alert, EmptyState, Person, PriorityBadge, StatusBadge } from "./ui";

type Row = {
  id: string; title: string; status: string; priority: string; dueAt: Date | null;
  assignee: { displayName: string };
};

export function TaskTable({ rows, empty, children }: { rows: Row[]; empty: string; children?: React.ReactNode }) {
  if (rows.length === 0) {
    return (
      <div className="table-wrap">
        <EmptyState icon={ClipboardList} title="Nothing here">{empty}</EmptyState>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <div className="table-scroll">
        <table className="responsive">
          <thead><tr><th>Task</th><th>Owner</th><th>Status</th><th>Priority</th><th>Due</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="primary"><Link className="row-link" href={`/tasks/${t.id}`}>{t.title}</Link></td>
                <td data-label="Owner"><Person name={t.assignee.displayName} /></td>
                <td data-label="Status"><StatusBadge status={t.status} /></td>
                <td data-label="Priority"><PriorityBadge priority={t.priority} /></td>
                <td data-label="Due" className={`num${isOverdue(t) ? " overdue" : ""}`}>{fmtDate(t.dueAt)}{isOverdue(t) ? " · overdue" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {children}
    </div>
  );
}

export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <Alert kind="err">{error}</Alert>;
  if (ok) return <Alert kind="ok">{ok}</Alert>;
  return null;
}
