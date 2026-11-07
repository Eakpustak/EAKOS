import type { Prisma } from "@prisma/client";

/**
 * Project and milestone rules (WORKFLOWS 3 steps 8-11, PHASES 5). Pure: no DB, no session.
 *
 * Decisions (also MEMORY 18):
 *  - A project has ONE delivery owner and belongs to ONE department (the delivering one).
 *  - Visible to: owner, listed members, creator, and the head(s) of the project's department.
 *    Plain department membership and the Administrator role grant nothing (RULES 2.3, 2.7).
 *  - Managed (milestones, members, status, tasks) by: owner and the department head(s).
 *  - A project from a handover may only be created by the handover's RECEIVER, once it is ACCEPTED,
 *    and only once per handover. The sender (Sales) keeps customer ownership and sees the outcome on the lead.
 */

export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const OPEN_PROJECT_STATUSES: ProjectStatus[] = ["ACTIVE", "ON_HOLD"];
export const PROJECT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", CANCELLED: "Cancelled",
};
export function projectStatusLabel(s: string): string {
  return Object.prototype.hasOwnProperty.call(PROJECT_STATUS_LABEL, s) ? PROJECT_STATUS_LABEL[s] : s;
}
export const MAX_NAME = 200;
export const MAX_DESCRIPTION = 5000;

export type ProjectViewer = { id: string; memberships: { departmentId: string; type: string }[] };
export type ProjectLike = {
  ownerId: string; createdById: string; departmentId: string; status: string;
  members?: { userId: string }[];
};

function heads(u: ProjectViewer): string[] {
  return u.memberships.filter((m) => m.type === "HEAD").map((m) => m.departmentId);
}

export function canAccessProject(u: ProjectViewer, p: ProjectLike): boolean {
  return (
    p.ownerId === u.id || p.createdById === u.id ||
    !!p.members?.some((m) => m.userId === u.id) ||
    heads(u).includes(p.departmentId)
  );
}

export function canManageProject(u: ProjectViewer, p: ProjectLike): boolean {
  return p.ownerId === u.id || heads(u).includes(p.departmentId);
}

/** Prisma filter equivalent of `canAccessProject`. Keep in step with it. */
export function visibleProjectWhere(u: ProjectViewer): Prisma.ProjectWhereInput {
  const h = heads(u);
  return {
    OR: [
      { ownerId: u.id }, { createdById: u.id }, { members: { some: { userId: u.id } } },
      ...(h.length ? [{ departmentId: { in: h } }] : []),
    ],
  };
}

// ---- Creating from a handover ----------------------------------------------------------------------

export type CreateFromHandover =
  | { ok: true }
  | { ok: false; message: string };

export function canCreateFromHandover(
  u: { id: string },
  h: { receiverId: string; status: string },
  existingProject: boolean,
): CreateFromHandover {
  if (h.receiverId !== u.id) return { ok: false, message: "Only the person who received the handover can start its project." };
  if (h.status !== "ACCEPTED") return { ok: false, message: "Accept the handover before creating its project." };
  if (existingProject) return { ok: false, message: "This handover already has a project." };
  return { ok: true };
}

// ---- Status ------------------------------------------------------------------------------------------

const NEXT: Record<ProjectStatus, ProjectStatus[]> = {
  ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function nextProjectStatuses(from: string): ProjectStatus[] {
  return Object.prototype.hasOwnProperty.call(NEXT, from) ? NEXT[from as ProjectStatus] : [];
}

export type StatusDecision =
  | { ok: true; to: ProjectStatus; completes: boolean }
  | { ok: false; code: "FORBIDDEN" | "INVALID" | "ALREADY_DONE" | "OPEN_MILESTONES"; message: string };

/** Completing needs every milestone done: otherwise "completed" would hide unfinished delivery. */
export function decideProjectStatus(u: ProjectViewer, p: ProjectLike, to: string, openMilestones: number): StatusDecision {
  if (!(PROJECT_STATUSES as readonly string[]).includes(to)) return { ok: false, code: "INVALID", message: "Choose a valid status." };
  if (!canManageProject(u, p)) return { ok: false, code: "FORBIDDEN", message: "Only the project owner or the department head can change the status." };
  if (p.status === to) return { ok: false, code: "ALREADY_DONE", message: `This project is already ${projectStatusLabel(to).toLowerCase()}.` };
  if (!nextProjectStatuses(p.status).includes(to as ProjectStatus)) {
    return { ok: false, code: "INVALID", message: `A ${projectStatusLabel(p.status).toLowerCase()} project can't become ${projectStatusLabel(to).toLowerCase()}.` };
  }
  if (to === "COMPLETED" && openMilestones > 0) {
    return { ok: false, code: "OPEN_MILESTONES", message: `Finish or remove the ${openMilestones} open milestone${openMilestones === 1 ? "" : "s"} before completing the project.` };
  }
  return { ok: true, to: to as ProjectStatus, completes: to === "COMPLETED" };
}

/** Milestones, members and tasks can only change while the project is open. */
export function isProjectOpen(status: string): boolean {
  return (OPEN_PROJECT_STATUSES as string[]).includes(status);
}

// ---- Progress ----------------------------------------------------------------------------------------

export function milestoneProgress(ms: { status: string }[]): { done: number; total: number; pct: number } {
  const total = ms.length;
  const done = ms.filter((m) => m.status === "DONE").length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function milestoneOverdue(m: { status: string; dueAt: Date | null }, todayStr: string): boolean {
  return m.status === "OPEN" && !!m.dueAt && m.dueAt.toISOString().slice(0, 10) < todayStr;
}

/** Note shown on the Sales lead timeline when delivery starts (the lead owner keeps customer ownership). */
export function projectStartedNote(projectName: string, ownerName: string): string {
  return `Delivery project "${projectName}" started. Delivery owner: ${ownerName}.`.slice(0, 2000);
}
