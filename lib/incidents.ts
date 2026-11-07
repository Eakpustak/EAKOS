import { findSecret, isTechHead, isTechMember } from "./assets";
import type { ExpenseViewer } from "./expenses";

/**
 * Technology incident records (PHASES 8). Pure. Acceptance: incident history is traceable, and secrets are never stored.
 *
 * UNCONFIRMED by stakeholders:
 *  - Read, report and add notes: any member of Technology. Assign and reopen: the Technology head. Start, mitigate and resolve: the head or the
 *    current assignee. Everyone else, including Management heads and the Administrator role, sees nothing (RULES 2.3, 2.7).
 *  - Flow: OPEN -> INVESTIGATING (needs an assignee) -> MITIGATED (note) -> RESOLVED (note); INVESTIGATING can resolve directly.
 *    RESOLVED -> INVESTIGATING (reopen, head only, reason). Incidents are never deleted; every change is an append-only IncidentEvent.
 *  - Text fields are refused if they contain an obvious secret (same detector as the asset inventory). Do not paste logs or customer data.
 *  - No severity change after reporting yet (add a note), no SLA timers, no notifications (no scheduler); the sidebar shows your open incidents.
 */

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABEL: Record<Severity, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };
export const isSeverity = (v: string): v is Severity => (SEVERITIES as readonly string[]).includes(v);
export const severityLabel = (s: string) => (Object.prototype.hasOwnProperty.call(SEVERITY_LABEL, s) ? SEVERITY_LABEL[s as Severity] : s);

export const INCIDENT_STATUS_LABEL: Record<string, string> = { OPEN: "Open", INVESTIGATING: "Investigating", MITIGATED: "Mitigated", RESOLVED: "Resolved" };
export const incidentStatusLabel = (s: string) => (Object.prototype.hasOwnProperty.call(INCIDENT_STATUS_LABEL, s) ? INCIDENT_STATUS_LABEL[s] : s);

export const MIN_TITLE = 3, MAX_TITLE = 120, MAX_DESC = 2000, MAX_TEXT = 1000;
export const canViewIncidents = isTechMember;
export const canReportIncident = isTechMember;
export const canAssignIncident = (u: ExpenseViewer, i: { status: string }) => isTechHead(u) && i.status !== "RESOLVED";

// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/;
const noSecret = (t: string) => { const h = findSecret(t); return h ? `That looks like ${h}. Secrets are never stored here; say where it is kept, not what it is.` : null; };

export type IncidentInput = { title: string; description: string; severity: string; assetId: string };
export type IncidentOk = { ok: true; title: string; description: string; severity: Severity; assetId: string | null };
export function validateIncident(i: IncidentInput): IncidentOk | { ok: false; error: string } {
  if (BAD.test(i.title) || BAD.test(i.description.replace(/[\r\n\t]/g, ""))) return { ok: false, error: "Remove control or direction-override characters." };
  const title = i.title.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (title.length < MIN_TITLE) return { ok: false, error: "Give the incident a short title." };
  if (title.length > MAX_TITLE) return { ok: false, error: `The title is longer than ${MAX_TITLE} characters.` };
  const description = i.description.trim();
  if (!description) return { ok: false, error: "Describe what is happening and what is affected." };
  if (description.length > MAX_DESC) return { ok: false, error: `The description is longer than ${MAX_DESC} characters.` };
  if (!isSeverity(i.severity)) return { ok: false, error: "Choose a severity." };
  const secret = noSecret(title) ?? noSecret(description);
  if (secret) return { ok: false, error: secret };
  return { ok: true, title, description, severity: i.severity, assetId: i.assetId.trim() || null };
}

export type IncidentAction = "start" | "mitigate" | "resolve" | "reopen" | "note";
type Rule = { from: readonly string[] | "any"; to: string | null; by: "handler" | "head" | "member"; text: "required" | "optional"; needsAssignee?: boolean };
const RULES: Record<IncidentAction, Rule> = {
  start: { from: ["OPEN"], to: "INVESTIGATING", by: "handler", text: "optional", needsAssignee: true },
  mitigate: { from: ["INVESTIGATING"], to: "MITIGATED", by: "handler", text: "required" },
  resolve: { from: ["INVESTIGATING", "MITIGATED"], to: "RESOLVED", by: "handler", text: "required" },
  reopen: { from: ["RESOLVED"], to: "INVESTIGATING", by: "head", text: "required", needsAssignee: true },
  note: { from: "any", to: null, by: "member", text: "required" },
};
export type IncidentLike = { status: string; assigneeId: string | null };
export type IncidentDecision =
  | { ok: true; to: string; text: string | null }
  | { ok: false; code: "INVALID_STATE" | "FORBIDDEN" | "BAD_INPUT"; message: string };

const isHandler = (u: ExpenseViewer, i: IncidentLike) => isTechHead(u) || (isTechMember(u) && i.assigneeId === u.id);

export function availableIncidentActions(u: ExpenseViewer, i: IncidentLike): IncidentAction[] {
  if (!isTechMember(u)) return [];
  return (Object.keys(RULES) as IncidentAction[]).filter((a) => {
    const r = RULES[a];
    if (r.from !== "any" && !r.from.includes(i.status)) return false;
    if (r.by === "head" && !isTechHead(u)) return false;
    if (r.by === "handler" && !isHandler(u, i)) return false;
    return true;
  });
}

export function decideIncident(u: ExpenseViewer, i: IncidentLike, action: string, rawText: string): IncidentDecision {
  const rule = Object.prototype.hasOwnProperty.call(RULES, action) ? RULES[action as IncidentAction] : undefined;
  if (!rule) return { ok: false, code: "INVALID_STATE", message: "That action is not valid." };
  if (!isTechMember(u)) return { ok: false, code: "FORBIDDEN", message: "Only the Technology team can change incidents." };
  if (rule.by === "head" && !isTechHead(u)) return { ok: false, code: "FORBIDDEN", message: "Only the Technology head can do that." };
  if (rule.by === "handler" && !isHandler(u, i)) return { ok: false, code: "FORBIDDEN", message: "Only the Technology head or the person assigned can do that." };
  if (rule.from !== "any" && !rule.from.includes(i.status)) return { ok: false, code: "INVALID_STATE", message: `This incident is ${incidentStatusLabel(i.status).toLowerCase()}, so that is not possible now.` };
  if (rule.needsAssignee && !i.assigneeId) return { ok: false, code: "INVALID_STATE", message: "Assign someone first." };
  const text = rawText.trim();
  if (BAD.test(text.replace(/[\r\n\t]/g, ""))) return { ok: false, code: "BAD_INPUT", message: "Remove control or direction-override characters." };
  if (rule.text === "required" && !text) return { ok: false, code: "BAD_INPUT", message: "Write a note. It stays in the history." };
  if (text.length > MAX_TEXT) return { ok: false, code: "BAD_INPUT", message: `The note is longer than ${MAX_TEXT} characters.` };
  const secret = text ? noSecret(text) : null;
  if (secret) return { ok: false, code: "BAD_INPUT", message: secret };
  return { ok: true, to: rule.to ?? i.status, text: text || null };
}
