import Link from "next/link";
import { Briefcase } from "lucide-react";
import { FOLLOW_UP_LABEL, followUpState, stageLabel } from "./leads";
import { fmtDate, todayStr } from "./tasks";
import { EmptyState, Person } from "./ui";

export function StageBadge({ stage }: { stage: string }) {
  return <span className={`badge ld-${stage.toLowerCase()}`}>{stageLabel(stage)}</span>;
}

export function FollowUp({ lead }: { lead: { stage: string; nextFollowUpAt: Date | null } }) {
  const st = followUpState(lead, todayStr());
  if (st === "closed") return <span className="muted">—</span>;
  if (st === "none") return <span className="fu-none">{FOLLOW_UP_LABEL.none}</span>;
  return (
    <span className={st === "overdue" ? "fu-overdue" : undefined}>
      {fmtDate(lead.nextFollowUpAt)}{st === "overdue" ? " · overdue" : st === "today" ? " · today" : ""}
    </span>
  );
}

type Row = {
  id: string; organizationName: string; contactName: string; stage: string; nextFollowUpAt: Date | null;
  lastActivityAt: Date; owner: { displayName: string };
};

export function LeadTable({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) {
    return <div className="table-wrap"><EmptyState icon={Briefcase} title="No leads here">{empty}</EmptyState></div>;
  }
  return (
    <div className="table-wrap">
      <div className="table-scroll">
        <table className="responsive">
          <thead><tr><th>Lead</th><th>Stage</th><th>Owner</th><th>Next follow-up</th><th>Last activity</th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="primary">
                  <Link className="row-link" href={`/leads/${l.id}`}>{l.organizationName}</Link>
                  <span className="sub-line">{l.contactName}</span>
                </td>
                <td data-label="Stage"><StageBadge stage={l.stage} /></td>
                <td data-label="Owner"><Person name={l.owner.displayName} /></td>
                <td data-label="Next follow-up"><FollowUp lead={l} /></td>
                <td data-label="Last activity" className="num">{fmtDate(l.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
