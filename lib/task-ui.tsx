import Link from "next/link";
import { fmtDate, isOverdue, PRIORITY_LABEL, STATUS_LABEL } from "./tasks";

type Row = {
  id: string; title: string; status: string; priority: string; dueAt: Date | null;
  assignee: { displayName: string };
};

export function TaskTable({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Task</th><th>Owner</th><th>Status</th><th>Priority</th><th>Due</th></tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td><Link href={`/tasks/${t.id}`}>{t.title}</Link></td>
              <td>{t.assignee.displayName}</td>
              <td><span className={`tag st-${t.status.toLowerCase()}`}>{STATUS_LABEL[t.status]}</span></td>
              <td><span className={`tag pr-${t.priority.toLowerCase()}`}>{PRIORITY_LABEL[t.priority]}</span></td>
              <td className={isOverdue(t) ? "overdue" : ""}>{fmtDate(t.dueAt)}{isOverdue(t) ? " · overdue" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <p className="err" role="alert">{error}</p>;
  if (ok) return <p className="okmsg" role="status">{ok}</p>;
  return null;
}
