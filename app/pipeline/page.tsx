import Link from "next/link";
import { redirect } from "next/navigation";
import { AlarmClock, CalendarX, Target, Trophy } from "lucide-react";
import { Shell } from "@/lib/shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/lib/ui";
import { todayStr } from "@/lib/tasks";
import { OPEN_STAGES, isSalesHead } from "@/lib/leads";
import { HANDOVER_STATUSES, HANDOVER_STATUS_LABEL, ackCutoff, ackWindowHours } from "@/lib/handovers";
import { PROJECT_STATUSES, projectStatusLabel } from "@/lib/projects";
import {
  canViewPipelineSummary, closedWindowStart, CLOSED_WINDOW_DAYS, countFor, openLeadTotal, sharePercent,
  stageBreakdown, winRatePercent,
} from "@/lib/pipeline";

export const dynamic = "force-dynamic";

/**
 * Management summary of the sales pipeline: COUNTS ONLY (RULES 1.9, 2.7). The queries below are
 * company-wide aggregates, which is safe only because nothing identifying is selected and the
 * page is limited to the Sales head and the Management head. Do not add names, organisations,
 * owners or notes here without a new decision.
 */
export default async function PipelineSummary() {
  const user = await requireUser();
  if (!canViewPipelineSummary(user)) redirect("/");

  const today = todayStr();
  const t = new Date(`${today}T00:00:00.000Z`);
  const [byStage, overdue, none, closedGroups, handoverGroups, unacknowledged, projectGroups] = await Promise.all([
    db.lead.groupBy({ by: ["stage"], _count: { _all: true } }),
    db.lead.count({ where: { stage: { in: OPEN_STAGES }, nextFollowUpAt: { lt: t } } }),
    db.lead.count({ where: { stage: { in: OPEN_STAGES }, nextFollowUpAt: null } }),
    db.lead.groupBy({ by: ["stage"], where: { stage: { in: ["WON", "LOST"] }, closedAt: { gte: closedWindowStart() } }, _count: { _all: true } }),
    db.handover.groupBy({ by: ["status"], where: { leadId: { not: null } }, _count: { _all: true } }),
    db.handover.count({ where: { leadId: { not: null }, status: "PENDING", sentAt: { lt: ackCutoff() } } }),
    db.project.groupBy({ by: ["status"], where: { handover: { is: { leadId: { not: null } } } }, _count: { _all: true } }),
  ]);

  const rows = stageBreakdown(byStage.map((g) => ({ stage: g.stage, count: g._count._all })));
  const open = openLeadTotal(rows);
  const closed = closedGroups.map((g) => ({ key: g.stage as string, count: g._count._all }));
  const won = countFor(closed, "WON");
  const lost = countFor(closed, "LOST");
  const rate = winRatePercent(won, lost);
  const handovers = handoverGroups.map((g) => ({ key: g.status as string, count: g._count._all }));
  const projects = projectGroups.map((g) => ({ key: g.status as string, count: g._count._all }));
  const handoverTotal = handovers.reduce((n, g) => n + g.count, 0);
  const projectTotal = projects.reduce((n, g) => n + g.count, 0);

  return (
    <Shell>
      <PageHeader
        title="Pipeline summary"
        description="Counts only. Organisations, contacts, owners and notes stay with each lead's owner and the Sales head."
      />
      <div className="stats" style={{ marginBottom: "1.5rem" }}>
        <div className="stat">
          <span className="stat-top">Open leads<Target className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{open}</span><span className="stat-note">New through Proposal</span>
        </div>
        <div className={`stat${overdue > 0 ? " bad" : ""}`}>
          <span className="stat-top">Follow-ups overdue<AlarmClock className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{overdue}</span><span className="stat-note">Open leads past their follow-up date</span>
        </div>
        <div className={`stat${none > 0 ? " warn" : ""}`}>
          <span className="stat-top">No follow-up planned<CalendarX className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{none}</span><span className="stat-note">Open leads with no date set</span>
        </div>
        <div className="stat">
          <span className="stat-top">Won / lost<Trophy className="ic" aria-hidden="true" /></span>
          <span className="stat-num">{won} / {lost}</span>
          <span className="stat-note">{rate === null ? `Nothing closed in the last ${CLOSED_WINDOW_DAYS} days` : `${rate}% won, last ${CLOSED_WINDOW_DAYS} days`}</span>
        </div>
      </div>

      {isSalesHead(user) && <p className="hint" style={{ marginBottom: "1.5rem" }}>You are the Sales head, so you can open the individual leads from the <Link href="/leads">Leads list</Link>.</p>}

      <section className="section" aria-labelledby="stage-h">
        <div className="section-head"><h2 id="stage-h">Leads by stage</h2></div>
        <div className="table-wrap"><div className="table-scroll">
          <table className="responsive">
            <thead><tr><th>Stage</th><th>Leads</th><th>Share of open pipeline</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.stage}>
                  <td className="primary">{r.label}</td>
                  <td data-label="Leads" className="num">{r.count}</td>
                  <td data-label="Share of open pipeline" className="num">{r.open ? `${sharePercent(r.count, open)}%` : "Closed"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      </section>

      <section className="section" aria-labelledby="handover-h">
        <div className="section-head"><h2 id="handover-h">Delivery handovers from leads <span className="muted num">({handoverTotal})</span></h2></div>
        <p className="hint" style={{ marginBottom: ".75rem" }}>
          {unacknowledged} awaiting acknowledgement for more than {ackWindowHours()} hours.
        </p>
        <div className="table-wrap"><div className="table-scroll">
          <table className="responsive">
            <thead><tr><th>Status</th><th>Handovers</th></tr></thead>
            <tbody>
              {HANDOVER_STATUSES.map((s) => (
                <tr key={s}><td className="primary">{HANDOVER_STATUS_LABEL[s]}</td><td data-label="Handovers" className="num">{countFor(handovers, s)}</td></tr>
              ))}
            </tbody>
          </table>
        </div></div>
      </section>

      <section className="section" aria-labelledby="project-h">
        <div className="section-head"><h2 id="project-h">Delivery projects started from those handovers <span className="muted num">({projectTotal})</span></h2></div>
        <div className="table-wrap"><div className="table-scroll">
          <table className="responsive">
            <thead><tr><th>Status</th><th>Projects</th></tr></thead>
            <tbody>
              {PROJECT_STATUSES.map((s) => (
                <tr key={s}><td className="primary">{projectStatusLabel(s)}</td><td data-label="Projects" className="num">{countFor(projects, s)}</td></tr>
              ))}
            </tbody>
          </table>
        </div></div>
      </section>
    </Shell>
  );
}
