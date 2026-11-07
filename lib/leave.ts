import type { Prisma } from "@prisma/client";

/**
 * Leave request rules (WORKFLOWS 6, PHASES 6). Pure: no DB, no session.
 *
 * UNCONFIRMED by stakeholders (WORKFLOWS says leave types, balances and the approval chain must be confirmed):
 *  - Leave TYPES below are placeholders; they are plain strings so they can change without a migration.
 *  - NO leave balances. Days are counted as calendar days, inclusive. Nothing is deducted or enforced.
 *  - Approval chain: the head of one of the requester's departments (never the requester). If the requester has
 *    no other head to ask (they are a head, or their department has none), the Management head decides.
 *    The approver department is fixed when the request is submitted.
 *  - Visible to the requester, heads of the approver department, and the HR head (read-only oversight).
 *    Plain membership and the Administrator role grant nothing (RULES 2.3, 2.7).
 */

export const LEAVE_TYPES = ["Casual", "Sick", "Earned", "Unpaid", "Other"] as const;
export function isLeaveType(v: string): boolean {
  return (LEAVE_TYPES as readonly string[]).includes(v);
}
export const MAX_REASON = 1000;
/** Longest single request, in calendar days. */
export const MAX_DAYS = 60;
/** How far back a request may start (e.g. a sick day reported afterwards). */
export const MAX_BACKDATE_DAYS = 14;

export const MANAGEMENT_SLUG = "management";
export const HR_SLUG = "human-resources";

export const LEAVE_STATUS_LABEL: Record<string, string> = {
  PENDING: "Awaiting decision", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled",
};
export function leaveStatusLabel(s: string): string {
  return Object.prototype.hasOwnProperty.call(LEAVE_STATUS_LABEL, s) ? LEAVE_STATUS_LABEL[s] : s;
}

// ---- Dates ---------------------------------------------------------------------------------------------

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Inclusive calendar days. */
export function leaveDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY) + 1;
}

export function validateLeaveDates(startStr: string, endStr: string, todayStr: string): string | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(startStr) || !re.test(endStr)) return "Choose a start and an end date.";
  const s = new Date(`${startStr}T00:00:00.000Z`);
  const e = new Date(`${endStr}T00:00:00.000Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || iso(s) !== startStr || iso(e) !== endStr) return "A date is not valid.";
  if (e < s) return "The end date cannot be before the start date.";
  const today = new Date(`${todayStr}T00:00:00.000Z`);
  if (s.getTime() < today.getTime() - MAX_BACKDATE_DAYS * DAY) return `Leave can start at most ${MAX_BACKDATE_DAYS} days in the past.`;
  if (leaveDays(s, e) > MAX_DAYS) return `A single request can cover at most ${MAX_DAYS} days.`;
  return null;
}

/** Inclusive-range overlap. */
export function overlaps(a: { startDate: Date; endDate: Date }, b: { startDate: Date; endDate: Date }): boolean {
  return a.startDate.getTime() <= b.endDate.getTime() && b.startDate.getTime() <= a.endDate.getTime();
}

// ---- Approver ---------------------------------------------------------------------------------------------

/**
 * Pick the department whose heads will decide. `headsByDept` maps department id -> ids of its HEAD members.
 * Prefers one of the requester's own departments that has a head other than the requester; otherwise the
 * Management department (unless the requester is its only head). Null = nobody can approve, so submit is refused
 * rather than leaving a request nobody can ever decide.
 */
export function chooseApproverDepartment(
  requesterId: string,
  requesterDepartmentIds: string[],
  headsByDept: Record<string, string[]>,
  managementDepartmentId: string | null,
): string | null {
  const others = (dep: string) => (Object.prototype.hasOwnProperty.call(headsByDept, dep) ? headsByDept[dep] : []).filter((id) => id !== requesterId);
  for (const dep of requesterDepartmentIds) if (others(dep).length > 0) return dep;
  if (managementDepartmentId && others(managementDepartmentId).length > 0) return managementDepartmentId;
  return null;
}

// ---- Access -----------------------------------------------------------------------------------------------

export type LeaveViewer = { id: string; memberships: { departmentId: string; type: string; department?: { slug: string } | null }[] };
export type LeaveLike = { requesterId: string; approverDepartmentId: string; status: string; startDate?: Date };

export function isHrHead(u: LeaveViewer): boolean {
  return u.memberships.some((m) => m.type === "HEAD" && m.department?.slug === HR_SLUG);
}
function isApprover(u: LeaveViewer, l: LeaveLike): boolean {
  return l.requesterId !== u.id && u.memberships.some((m) => m.type === "HEAD" && m.departmentId === l.approverDepartmentId);
}

export function canViewLeave(u: LeaveViewer, l: LeaveLike): boolean {
  return l.requesterId === u.id || isApprover(u, l) || isHrHead(u);
}

export function visibleLeaveWhere(u: LeaveViewer): Prisma.LeaveRequestWhereInput {
  const heads = u.memberships.filter((m) => m.type === "HEAD").map((m) => m.departmentId);
  return {
    OR: [
      { requesterId: u.id },
      ...(heads.length ? [{ approverDepartmentId: { in: heads }, requesterId: { not: u.id } }] : []),
      ...(isHrHead(u) ? [{}] : []),
    ],
  };
}

// ---- State machine ----------------------------------------------------------------------------------------

export type LeaveAction = "approve" | "reject" | "cancel";
type Rule = { by: "approver" | "requester"; from: string[]; to: string; needsNote: boolean };
const RULES: Record<LeaveAction, Rule> = {
  approve: { by: "approver", from: ["PENDING"], to: "APPROVED", needsNote: false },
  reject:  { by: "approver", from: ["PENDING"], to: "REJECTED", needsNote: true },
  // The requester may withdraw while pending, or after approval only if the leave has not started.
  cancel:  { by: "requester", from: ["PENDING", "APPROVED"], to: "CANCELLED", needsNote: false },
};

export type LeaveDecision =
  | { ok: true; to: "APPROVED" | "REJECTED" | "CANCELLED"; note: string | null }
  | { ok: false; code: "FORBIDDEN" | "INVALID_STATE" | "NOTE_REQUIRED" | "ALREADY_DONE" | "STARTED"; message: string };

export function decideLeave(u: LeaveViewer, l: LeaveLike, action: string, note: string | null | undefined, todayStr: string): LeaveDecision {
  const rule = Object.prototype.hasOwnProperty.call(RULES, action) ? RULES[action as LeaveAction] : undefined;
  if (!rule) return { ok: false, code: "INVALID_STATE", message: "That action is not valid." };
  const allowed = rule.by === "requester" ? l.requesterId === u.id : isApprover(u, l);
  if (!allowed) {
    return {
      ok: false, code: "FORBIDDEN",
      message: rule.by === "requester" ? "Only the person who asked for the leave can cancel it." : "Only a head of the approving department can decide this, and never on their own request.",
    };
  }
  if (l.status === rule.to) return { ok: false, code: "ALREADY_DONE", message: `This request is already ${leaveStatusLabel(rule.to).toLowerCase()}.` };
  if (!rule.from.includes(l.status)) {
    return { ok: false, code: "INVALID_STATE", message: `This can't be done while the request is "${leaveStatusLabel(l.status).toLowerCase()}".` };
  }
  if (action === "cancel" && l.status === "APPROVED" && l.startDate && iso(l.startDate) <= todayStr) {
    return { ok: false, code: "STARTED", message: "Approved leave that has already started can't be cancelled here. Ask your approver." };
  }
  const text = (note ?? "").trim();
  if (rule.needsNote && !text) return { ok: false, code: "NOTE_REQUIRED", message: "Give a reason for rejecting." };
  if (text.length > MAX_REASON) return { ok: false, code: "NOTE_REQUIRED", message: `Text is too long (max ${MAX_REASON}).` };
  return { ok: true, to: rule.to as "APPROVED" | "REJECTED" | "CANCELLED", note: text || null };
}

export function availableLeaveActions(u: LeaveViewer, l: LeaveLike, todayStr: string): LeaveAction[] {
  return (["approve", "reject", "cancel"] as LeaveAction[]).filter((a) => decideLeave(u, l, a, "x", todayStr).ok);
}

/** Notification titles are generic: they never carry the reason or leave type (these can be sensitive). */
export const LEAVE_NOTIFY: Record<LeaveAction, { to: "requester" | "approvers"; title: string }> = {
  approve: { to: "requester", title: "Your leave request was approved" },
  reject: { to: "requester", title: "Your leave request was rejected" },
  cancel: { to: "approvers", title: "A leave request was cancelled" },
};
