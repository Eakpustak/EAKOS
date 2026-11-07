import type { Prisma } from "@prisma/client";
import { MAX_NOTE, type ExpenseViewer } from "./expenses";

/**
 * Internal service requests (PHASES 7 "Internal service requests"). Pure: no DB, no session.
 * A small help desk: ask Technology or Operations for something and see who is handling it.
 *
 * UNCONFIRMED by stakeholders:
 *  - The CATEGORY decides the handling department (placeholders below; the slug is looked up at submission).
 *  - Handlers: the head of the handling department (never on their own request) and the person the head assigns.
 *    The assignee must be an active member of that department and never the requester.
 *  - Visible to: the requester, the handling department's heads, and the current assignee. Plain department membership,
 *    other heads, Management heads as such and the Administrator role see nothing (RULES 2.3, 2.7).
 *  - No SLA timers or automatic escalation (no scheduler). Resolving needs a note; only the requester closes it, or reopens it.
 */

export const SERVICE_CATEGORIES = [
  { label: "IT support", slug: "technology" },
  { label: "Access or accounts", slug: "technology" },
  { label: "Facilities", slug: "operations" },
  { label: "Office supplies", slug: "operations" },
  { label: "Other", slug: "operations" },
] as const;
export const PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export const PRIORITY_LABEL: Record<string, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High" };
export const MIN_TITLE = 3, MAX_TITLE = 120, MAX_DESCRIPTION = 2000;

export function categoryDepartmentSlug(label: string): string | null {
  return SERVICE_CATEGORIES.find((c) => c.label === label)?.slug ?? null;
}
export function priorityLabel(p: string): string {
  return Object.prototype.hasOwnProperty.call(PRIORITY_LABEL, p) ? PRIORITY_LABEL[p] : p;
}
export const SERVICE_STATUS_LABEL: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved, please confirm", CLOSED: "Closed", DECLINED: "Declined", CANCELLED: "Cancelled",
};
export function serviceStatusLabel(s: string): string {
  return Object.prototype.hasOwnProperty.call(SERVICE_STATUS_LABEL, s) ? SERVICE_STATUS_LABEL[s] : s;
}

// eslint-disable-next-line no-control-regex
const BAD_CHARS = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
export type ServiceInput = { title: string; description: string; category: string; priority: string };
export type ServiceOk = { ok: true; title: string; description: string; category: string; priority: "LOW" | "NORMAL" | "HIGH"; departmentSlug: string };
export function validateService(i: ServiceInput): ServiceOk | { ok: false; error: string } {
  const title = i.title.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (BAD_CHARS.test(i.title) || BAD_CHARS.test(i.description.replace(/[\r\n\t]/g, ""))) return { ok: false, error: "Remove control or direction-override characters." };
  if (title.length < MIN_TITLE) return { ok: false, error: "Give the request a short title." };
  if (title.length > MAX_TITLE) return { ok: false, error: `The title is longer than ${MAX_TITLE} characters.` };
  const description = i.description.trim();
  if (!description) return { ok: false, error: "Describe what you need." };
  if (description.length > MAX_DESCRIPTION) return { ok: false, error: `The description is longer than ${MAX_DESCRIPTION} characters.` };
  const slug = categoryDepartmentSlug(i.category);
  if (!slug) return { ok: false, error: "Choose a category." };
  if (!(PRIORITIES as readonly string[]).includes(i.priority)) return { ok: false, error: "Choose a priority." };
  return { ok: true, title, description, category: i.category, priority: i.priority as ServiceOk["priority"], departmentSlug: slug };
}

// ---- Access -----------------------------------------------------------------------------------------------

export type ServiceViewer = ExpenseViewer;
export type ServiceLike = { requesterId: string; departmentId: string; assigneeId: string | null; status: string };

export function isHandlingHead(u: ServiceViewer, r: ServiceLike): boolean {
  return r.requesterId !== u.id && u.memberships.some((m) => m.type === "HEAD" && m.departmentId === r.departmentId);
}
function isAssignee(u: ServiceViewer, r: ServiceLike): boolean {
  return r.requesterId !== u.id && r.assigneeId === u.id;
}
export const isHandler = (u: ServiceViewer, r: ServiceLike) => isHandlingHead(u, r) || isAssignee(u, r);
export const canViewService = (u: ServiceViewer, r: ServiceLike) => r.requesterId === u.id || isHandler(u, r);

export type ServiceView = "mine" | "queue" | "assigned";
const OPEN_STATUSES = ["OPEN", "IN_PROGRESS"] as const;
export function serviceViews(u: ServiceViewer): [ServiceView, string][] {
  const heads = u.memberships.some((m) => m.type === "HEAD");
  const out: [ServiceView, string][] = [["mine", "My requests"], ["assigned", "Assigned to me"]];
  if (heads) out.push(["queue", "Department queue"]);
  return out;
}
export function serviceWhere(u: ServiceViewer, view: string): Prisma.ServiceRequestWhereInput {
  const heads = u.memberships.filter((m) => m.type === "HEAD").map((m) => m.departmentId);
  if (view === "queue" && heads.length) return { departmentId: { in: heads }, requesterId: { not: u.id }, status: { in: [...OPEN_STATUSES] } };
  if (view === "assigned") return { assigneeId: u.id, requesterId: { not: u.id }, status: { in: [...OPEN_STATUSES] } };
  return { requesterId: u.id };
}

// ---- Assignment -------------------------------------------------------------------------------------------

export function canAssign(u: ServiceViewer, r: ServiceLike): boolean {
  return isHandlingHead(u, r) && (r.status === "OPEN" || r.status === "IN_PROGRESS");
}
/** The candidate must be an ACTIVE member of the handling department and never the requester. Facts come from the database. */
export function assigneeEligible(c: { id: string; active: boolean; departmentIds: string[] } | null | undefined, r: ServiceLike): boolean {
  return !!c && c.active && c.id !== r.requesterId && c.departmentIds.includes(r.departmentId);
}

// ---- State machine ----------------------------------------------------------------------------------------

export type ServiceAction = "start" | "resolve" | "reopen" | "close" | "decline" | "cancel";
type To = "IN_PROGRESS" | "RESOLVED" | "OPEN" | "CLOSED" | "DECLINED" | "CANCELLED";
type Rule = { by: "handler" | "head" | "requester"; from: readonly string[]; to: To; note: boolean };
const RULES: Record<ServiceAction, Rule> = {
  start: { by: "handler", from: ["OPEN"], to: "IN_PROGRESS", note: false },
  resolve: { by: "handler", from: ["IN_PROGRESS"], to: "RESOLVED", note: true },
  reopen: { by: "requester", from: ["RESOLVED"], to: "OPEN", note: true },
  close: { by: "requester", from: ["RESOLVED"], to: "CLOSED", note: false },
  decline: { by: "head", from: ["OPEN"], to: "DECLINED", note: true },
  cancel: { by: "requester", from: ["OPEN"], to: "CANCELLED", note: false },
};
export type ServiceDecision =
  | { ok: true; to: To; note: string | null }
  | { ok: false; code: "FORBIDDEN" | "INVALID_STATE" | "NOTE_REQUIRED" | "ALREADY_DONE" | "NEEDS_ASSIGNEE"; message: string };

export function decideService(u: ServiceViewer, r: ServiceLike, action: string, note: string | null | undefined): ServiceDecision {
  const rule = Object.prototype.hasOwnProperty.call(RULES, action) ? RULES[action as ServiceAction] : undefined;
  if (!rule) return { ok: false, code: "INVALID_STATE", message: "That action is not valid." };
  const allowed = rule.by === "requester" ? r.requesterId === u.id : rule.by === "head" ? isHandlingHead(u, r) : isHandler(u, r);
  if (!allowed) {
    const message = rule.by === "requester" ? "Only the person who made the request can do this."
      : rule.by === "head" ? "Only a head of the handling department can do this, and never on their own request."
      : "Only the assignee or a head of the handling department can do this, and never on their own request.";
    return { ok: false, code: "FORBIDDEN", message };
  }
  if (r.status === rule.to) return { ok: false, code: "ALREADY_DONE", message: `This request is already ${serviceStatusLabel(rule.to).toLowerCase()}.` };
  if (!rule.from.includes(r.status)) return { ok: false, code: "INVALID_STATE", message: `This can't be done while the request is "${serviceStatusLabel(r.status).toLowerCase()}".` };
  if (action === "start" && !r.assigneeId) return { ok: false, code: "NEEDS_ASSIGNEE", message: "Assign someone before starting work." };
  const text = (note ?? "").trim();
  if (rule.note && !text) return { ok: false, code: "NOTE_REQUIRED", message: action === "resolve" ? "Say what was done." : action === "reopen" ? "Say what is still wrong." : "Give a reason for declining." };
  if (text.length > MAX_NOTE) return { ok: false, code: "NOTE_REQUIRED", message: `Text is too long (max ${MAX_NOTE}).` };
  return { ok: true, to: rule.to, note: rule.note ? text : null };
}
export function availableServiceActions(u: ServiceViewer, r: ServiceLike): ServiceAction[] {
  return (["start", "resolve", "reopen", "close", "decline", "cancel"] as ServiceAction[]).filter((a) => decideService(u, r, a, "xxx").ok);
}

/** Who is told. "handlers" = the assignee if there is one, otherwise the handling department's heads. Titles are generic. */
export const SERVICE_NOTIFY: Record<ServiceAction | "assign", { to: "requester" | "handlers" | "assignee"; title: string }> = {
  start: { to: "requester", title: "Work has started on your request" },
  resolve: { to: "requester", title: "Your request was marked as resolved" },
  reopen: { to: "handlers", title: "A service request was reopened" },
  close: { to: "handlers", title: "A service request was closed" },
  decline: { to: "requester", title: "Your request was declined" },
  cancel: { to: "handlers", title: "A service request was cancelled" },
  assign: { to: "assignee", title: "A service request was assigned to you" },
};
export const SERVICE_SUBMITTED_TITLE = "A new service request needs handling";
