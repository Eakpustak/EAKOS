import type { Prisma } from "@prisma/client";
import type { requireUser } from "./auth";

export type SessionUser = Awaited<ReturnType<typeof requireUser>>;

export const STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"] as const;
export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export const OPEN_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED"] as const;

export const STATUS_LABEL: Record<string, string> = {
  TODO: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", DONE: "Done", CANCELLED: "Cancelled",
};
export const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent",
};

const APP_TZ = process.env.APP_TZ || "Asia/Kolkata";

/** Today's calendar date (YYYY-MM-DD) in the company timezone. */
export function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(new Date());
}

/** Due dates are date-only: stored as midnight UTC of the chosen calendar date. */
export function parseDueDate(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
}
export function dueStr(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}
export function isOverdue(t: { dueAt: Date | null; status: string }): boolean {
  return !!t.dueAt && (OPEN_STATUSES as readonly string[]).includes(t.status) && dueStr(t.dueAt) < todayStr();
}
export function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}
export function fmtDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: APP_TZ }).format(d);
}

function headDepartmentIds(user: SessionUser): string[] {
  return user.memberships.filter((m) => m.type === "HEAD").map((m) => m.departmentId);
}

/**
 * A task is visible to its creator, its accountable owner (assignee) and the head of the
 * task's department. Admin role and plain department membership do NOT grant access (RULES 2.3, 2.7).
 */
export function visibleTaskWhere(user: SessionUser): Prisma.TaskWhereInput {
  const heads = headDepartmentIds(user);
  return {
    OR: [
      { creatorId: user.id },
      { assigneeId: user.id },
      ...(heads.length ? [{ departmentId: { in: heads } }] : []),
    ],
  };
}

/** Same relationship test as visibleTaskWhere, for an already-loaded task. */
export function canAccessTask(user: SessionUser, t: { creatorId: string; assigneeId: string; departmentId: string | null }): boolean {
  return (
    t.creatorId === user.id ||
    t.assigneeId === user.id ||
    (!!t.departmentId && headDepartmentIds(user).includes(t.departmentId))
  );
}
