import type { Prisma } from "@prisma/client";
import { HR_SLUG, isHrHead } from "./leave";

/**
 * Onboarding / offboarding checklist rules (WORKFLOWS 6, PHASES 6). Pure: no DB, no session.
 *
 * UNCONFIRMED by stakeholders (MEMORY section 22): the template items below are placeholders, and
 * "who owns what" defaults are a guess. Templates live in code so they can change without a migration.
 *
 *  - Only the HR head opens, assigns, reopens, completes or cancels a case. Admin role and plain HR
 *    membership grant nothing (RULES 2.3, 2.7).
 *  - An item owner sees the case but ONLY their own items. The person the case is about never owns
 *    an item and cannot see their own case (an offboarding is confidential until HR says otherwise).
 *  - Marking an item done: its owner or the HR head. Reopening: HR head only.
 *  - A case is completed explicitly by the HR head and only when every item is done. Nothing
 *    completes, closes or deactivates an account automatically (RULES 6).
 *  - One OPEN case per person and type.
 */

export const CASE_TYPES = ["ONBOARDING", "OFFBOARDING"] as const;
export type CaseType = (typeof CASE_TYPES)[number];
export const CASE_TYPE_LABEL: Record<string, string> = { ONBOARDING: "Onboarding", OFFBOARDING: "Offboarding" };
export const CASE_DATE_LABEL: Record<string, string> = { ONBOARDING: "Start date", OFFBOARDING: "Last working day" };
export const CASE_STATUS_LABEL: Record<string, string> = { OPEN: "In progress", COMPLETED: "Completed", CANCELLED: "Cancelled" };

function label(map: Record<string, string>, k: string): string {
  return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : k;
}
export const caseTypeLabel = (t: string) => label(CASE_TYPE_LABEL, t);
export const caseDateLabel = (t: string) => label(CASE_DATE_LABEL, t);
export const caseStatusLabel = (s: string) => label(CASE_STATUS_LABEL, s);
export function isCaseType(v: string): v is CaseType {
  return (CASE_TYPES as readonly string[]).includes(v);
}

export const MAX_ITEMS = 30;
export const MAX_TITLE = 200;
export const MAX_NOTE = 1000;
export const TECHNOLOGY_SLUG = "technology";
export const OPERATIONS_SLUG = "operations";

// ---- Templates --------------------------------------------------------------------------------------------

export type OwnerKind = "HR" | "MANAGER" | "TECHNOLOGY" | "OPERATIONS";
export type TemplateItem = { title: string; owner: OwnerKind };

export const TEMPLATES: Record<CaseType, TemplateItem[]> = {
  ONBOARDING: [
    { title: "Collect and verify joining documents", owner: "HR" },
    { title: "Confirm department and reporting head in the Workspace", owner: "HR" },
    { title: "Welcome and role briefing", owner: "MANAGER" },
    { title: "Create email and tool accounts", owner: "TECHNOLOGY" },
    { title: "Issue laptop and equipment", owner: "TECHNOLOGY" },
    { title: "Arrange workspace and access card", owner: "OPERATIONS" },
  ],
  OFFBOARDING: [
    { title: "Record the exit decision and last working day", owner: "HR" },
    { title: "Knowledge-transfer and handover plan", owner: "MANAGER" },
    { title: "Revoke accounts and access", owner: "TECHNOLOGY" },
    { title: "Collect laptop and equipment", owner: "TECHNOLOGY" },
    { title: "Collect access card and keys", owner: "OPERATIONS" },
    { title: "Exit conversation and final paperwork", owner: "HR" },
    { title: "Ask an administrator to deactivate the Workspace account on the last working day", owner: "HR" },
  ],
};

export type OwnerCandidates = {
  /** Heads of the person's own departments. */
  managerHeadIds: string[];
  technologyHeadIds: string[];
  operationsHeadIds: string[];
  /** The HR head who opens the case: the fallback owner, so no item is ever unowned. */
  creatorId: string;
  subjectId: string;
};

/** Default owner of a template item. Never the subject; first candidate in a stable (sorted) order. */
export function resolveOwner(kind: OwnerKind, c: OwnerCandidates): string {
  const pool = kind === "MANAGER" ? c.managerHeadIds : kind === "TECHNOLOGY" ? c.technologyHeadIds : kind === "OPERATIONS" ? c.operationsHeadIds : [];
  const pick = [...pool].filter((id) => id !== c.subjectId).sort()[0];
  return pick ?? c.creatorId;
}

export function buildItems(type: CaseType, c: OwnerCandidates): { title: string; ownerId: string; position: number }[] {
  return TEMPLATES[type].map((t, position) => ({ title: t.title, ownerId: resolveOwner(t.owner, c), position }));
}

// ---- Access -----------------------------------------------------------------------------------------------

export type CaseViewer = { id: string; memberships: { departmentId: string; type: string; department?: { slug: string } | null }[] };

export function canManageCases(u: CaseViewer): boolean {
  return isHrHead(u) && u.memberships.some((m) => m.department?.slug === HR_SLUG);
}
/** An owner may not be the person the case is about. */
export function canOwnItem(ownerId: string, subjectId: string): boolean {
  return ownerId !== subjectId;
}
export function canViewCase(u: CaseViewer, subjectId: string, items: { ownerId: string }[]): boolean {
  if (u.id === subjectId) return false;
  return canManageCases(u) || items.some((i) => i.ownerId === u.id);
}
export function visibleItems<T extends { ownerId: string }>(u: CaseViewer, items: T[]): T[] {
  return canManageCases(u) ? items : items.filter((i) => i.ownerId === u.id);
}
/** Prisma filter equivalent of `canViewCase`. Keep in step with it. */
export function visibleCaseWhere(u: CaseViewer): Prisma.PeopleCaseWhereInput {
  if (canManageCases(u)) return { subjectId: { not: u.id } };
  return { subjectId: { not: u.id }, items: { some: { ownerId: u.id } } };
}

// ---- Input validation -------------------------------------------------------------------------------------

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const re = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string): Date | null {
  if (!re.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || iso(d) !== s ? null : d;
}

/** The case date may be up to 30 days in the past (late paperwork) and one year ahead. */
export function validateCaseInput(type: string, dateStr: string, todayStr: string): string | null {
  if (!isCaseType(type)) return "Choose onboarding or offboarding.";
  const d = validDate(dateStr);
  if (!d) return `Choose a valid ${caseDateLabel(type).toLowerCase()}.`;
  const today = new Date(`${todayStr}T00:00:00.000Z`).getTime();
  if (d.getTime() < today - 30 * DAY) return `${caseDateLabel(type)} can be at most 30 days in the past.`;
  if (d.getTime() > today + 365 * DAY) return `${caseDateLabel(type)} can be at most one year ahead.`;
  return null;
}

export function validateItemInput(title: string, dueStr: string): string | null {
  const t = title.trim();
  if (!t) return "Give the item a title.";
  if (t.length > MAX_TITLE) return `Title is too long (max ${MAX_TITLE}).`;
  if (dueStr && !validDate(dueStr)) return "The due date is not valid.";
  return null;
}

// ---- State changes ----------------------------------------------------------------------------------------

export type ItemAction = "done" | "reopen";
export type ItemDecision =
  | { ok: true; to: "DONE" | "OPEN" }
  | { ok: false; code: "FORBIDDEN" | "INVALID_STATE" | "ALREADY_DONE"; message: string };

export function decideItem(
  u: CaseViewer, c: { status: string }, item: { ownerId: string; status: string }, action: string,
): ItemDecision {
  if (action !== "done" && action !== "reopen") return { ok: false, code: "INVALID_STATE", message: "That action is not valid." };
  const hr = canManageCases(u);
  if (action === "reopen" ? !hr : !(hr || item.ownerId === u.id)) {
    return {
      ok: false, code: "FORBIDDEN",
      message: action === "reopen" ? "Only the HR head can reopen an item." : "Only the item's owner or the HR head can mark it done.",
    };
  }
  if (c.status !== "OPEN") return { ok: false, code: "INVALID_STATE", message: "This checklist is closed, so its items can't be changed." };
  const to = action === "done" ? "DONE" : "OPEN";
  if (item.status === to) return { ok: false, code: "ALREADY_DONE", message: `This item is already ${to === "DONE" ? "done" : "open"}.` };
  return { ok: true, to };
}

export type CaseAction = "complete" | "cancel";
export type CaseDecision =
  | { ok: true; to: "COMPLETED" | "CANCELLED"; note: string | null }
  | { ok: false; code: "FORBIDDEN" | "INVALID_STATE" | "INCOMPLETE" | "NOTE_REQUIRED" | "ALREADY_DONE"; message: string };

export function decideCase(
  u: CaseViewer, c: { status: string }, action: string, openItems: number, note: string | null | undefined,
): CaseDecision {
  if (action !== "complete" && action !== "cancel") return { ok: false, code: "INVALID_STATE", message: "That action is not valid." };
  if (!canManageCases(u)) return { ok: false, code: "FORBIDDEN", message: "Only the HR head can close a checklist." };
  const to = action === "complete" ? "COMPLETED" : "CANCELLED";
  if (c.status === to) return { ok: false, code: "ALREADY_DONE", message: `This checklist is already ${caseStatusLabel(to).toLowerCase()}.` };
  if (c.status !== "OPEN") return { ok: false, code: "INVALID_STATE", message: "This checklist is already closed." };
  const text = (note ?? "").trim();
  if (text.length > MAX_NOTE) return { ok: false, code: "NOTE_REQUIRED", message: `Text is too long (max ${MAX_NOTE}).` };
  if (action === "complete" && openItems > 0) {
    return { ok: false, code: "INCOMPLETE", message: `${openItems} item${openItems === 1 ? " is" : "s are"} still open. Finish them or cancel the checklist.` };
  }
  if (action === "cancel" && !text) return { ok: false, code: "NOTE_REQUIRED", message: "Give a reason for cancelling." };
  return { ok: true, to, note: text || null };
}

// ---- Display helpers --------------------------------------------------------------------------------------

export function caseProgress(items: { status: string }[]): { done: number; total: number; pct: number } {
  const total = items.length;
  const done = items.filter((i) => i.status === "DONE").length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}
export function itemOverdue(i: { status: string; dueAt: Date | null }, todayStr: string): boolean {
  return i.status === "OPEN" && i.dueAt !== null && iso(i.dueAt) < todayStr;
}
export function openKeyFor(subjectId: string, type: string): string {
  return `${subjectId}:${type}`;
}

/** Notification titles are generic: no person's name, no checklist type, no item title. */
export const CASE_NOTIFY = {
  assigned: "A checklist item was assigned to you",
  reopened: "A checklist item assigned to you was reopened",
} as const;
