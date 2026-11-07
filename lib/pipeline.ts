import { LEAD_STAGES, OPEN_STAGES, SALES_SLUG, STAGE_LABEL } from "./leads";
import { MANAGEMENT_SLUG } from "./hub";

/**
 * Management pipeline summary (PHASES 5 "Permission-aware management summaries").
 *
 * RULES 1.9 / 2.7: a management overview is NOT unrestricted record access. So this summary is made
 * only of COUNTS. It never carries an organisation, contact, owner, title or reason, and the page
 * never links to a lead for anyone who could not already open it.
 *
 * Who may see it: a Sales head or the Management head. ADMIN and plain membership grant nothing.
 * Pure: no DB, no session.
 */

export type PipelineViewer = { memberships: { type: string; department?: { slug: string } | null }[] };

export function canViewPipelineSummary(u: PipelineViewer): boolean {
  return u.memberships.some(
    (m) => m.type === "HEAD" && (m.department?.slug === SALES_SLUG || m.department?.slug === MANAGEMENT_SLUG),
  );
}

export type StageRow = { stage: string; label: string; count: number; open: boolean };

/** One row per known stage in pipeline order, zero-filled; counts for unknown stages are ignored. */
export function stageBreakdown(groups: { stage: string; count: number }[]): StageRow[] {
  const byStage = new Map<string, number>();
  for (const g of groups) byStage.set(g.stage, (byStage.get(g.stage) ?? 0) + g.count);
  return LEAD_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABEL[stage] ?? stage,
    count: byStage.get(stage) ?? 0,
    open: OPEN_STAGES.includes(stage),
  }));
}

export function openLeadTotal(rows: StageRow[]): number {
  return rows.filter((r) => r.open).reduce((n, r) => n + r.count, 0);
}

/** Share of closed leads that were won, as a whole percent. null when nothing closed (no fake 0%). */
export function winRatePercent(won: number, lost: number): number | null {
  const closed = won + lost;
  if (closed <= 0) return null;
  return Math.round((won / closed) * 100);
}

/** Whole-number share of `part` in `whole`; 0 when `whole` is 0. */
export function sharePercent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export const CLOSED_WINDOW_DAYS = 30;
export function closedWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - CLOSED_WINDOW_DAYS * 86_400_000);
}

export function countFor(groups: { key: string; count: number }[], key: string): number {
  return groups.filter((g) => g.key === key).reduce((n, g) => n + g.count, 0);
}
