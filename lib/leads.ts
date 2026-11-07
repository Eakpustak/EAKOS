import type { Prisma } from "@prisma/client";

/**
 * Sales CRM rules (PRD "Sales CRM", WORKFLOWS 3, PHASES 5). Pure: no DB, no session, so the access
 * and pipeline rules can be unit-tested directly.
 *
 * Decisions (also in MEMORY.md section 16):
 *  - Leads belong to the "Sales & Marketing" department (slug `sales-and-marketing`).
 *  - Any Sales member may create a lead and become its owner. Owner is always one named person.
 *  - A lead is visible to its owner, its creator and the Sales head(s). Plain Sales membership and the
 *    Administrator role grant nothing (RULES 1.3, 2.7), so one intern cannot browse everyone's leads.
 *  - Only the owner or a Sales head can change a lead (stage, log, follow-up, reassign). A creator who
 *    is no longer the owner keeps read access to the history but cannot change it.
 */

export const SALES_SLUG = "sales-and-marketing";

export const LEAD_STAGES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
export const OPEN_STAGES: LeadStage[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL"];
export const STAGE_LABEL: Record<string, string> = {
  NEW: "New", CONTACTED: "Contacted", QUALIFIED: "Qualified", PROPOSAL: "Proposal sent", WON: "Won", LOST: "Lost",
};

/** Types a person may log by hand. STAGE and OWNER are written by the system. */
export const MANUAL_INTERACTIONS = ["CALL", "EMAIL", "MEETING", "NOTE"] as const;
export type ManualInteraction = (typeof MANUAL_INTERACTIONS)[number];
export const INTERACTION_LABEL: Record<string, string> = {
  CALL: "Call", EMAIL: "Email", MEETING: "Meeting", NOTE: "Note", STAGE: "Stage change", OWNER: "Owner change",
};

export const LEAD_SOURCES = ["Website", "Referral", "Cold outreach", "Event", "Social media", "Other"] as const;

export const MAX_SUMMARY = 2000;
export const MAX_REASON = 1000;

export type LeadViewer = {
  id: string;
  memberships: { departmentId: string; type: string; department?: { slug: string } | null }[];
};
export type LeadLike = { ownerId: string; createdById: string; stage: string };

// ---- Roles & access --------------------------------------------------------------------------

export function isSalesMember(u: LeadViewer): boolean {
  return u.memberships.some((m) => m.department?.slug === SALES_SLUG);
}
export function isSalesHead(u: LeadViewer): boolean {
  return u.memberships.some((m) => m.type === "HEAD" && m.department?.slug === SALES_SLUG);
}
export function canCreateLead(u: LeadViewer): boolean {
  return isSalesMember(u);
}

export function canAccessLead(u: LeadViewer, l: LeadLike): boolean {
  if (!isSalesMember(u)) return false; // someone moved out of Sales loses access immediately
  return l.ownerId === u.id || l.createdById === u.id || isSalesHead(u);
}

/** Change anything on the lead. */
export function canManageLead(u: LeadViewer, l: LeadLike): boolean {
  return isSalesMember(u) && (l.ownerId === u.id || isSalesHead(u));
}

/** Prisma filter equivalent of `canAccessLead`. Keep in step with it. */
export function visibleLeadWhere(u: LeadViewer): Prisma.LeadWhereInput {
  if (!isSalesMember(u)) return { id: { in: [] } };
  if (isSalesHead(u)) return {};
  return { OR: [{ ownerId: u.id }, { createdById: u.id }] };
}

// ---- Pipeline ----------------------------------------------------------------------------------

const NEXT: Record<LeadStage, LeadStage[]> = {
  NEW: ["CONTACTED", "LOST"],
  CONTACTED: ["QUALIFIED", "LOST"],
  QUALIFIED: ["PROPOSAL", "LOST"],
  PROPOSAL: ["WON", "QUALIFIED", "LOST"],
  WON: [],
  LOST: ["NEW"], // reopen: Sales head only
};

/** Own-property label lookup so keys like "constructor" never resolve to a prototype member. */
export function stageLabel(stage: string): string {
  return Object.prototype.hasOwnProperty.call(STAGE_LABEL, stage) ? STAGE_LABEL[stage] : stage;
}

export function isOpenStage(stage: string): boolean {
  return (OPEN_STAGES as string[]).includes(stage);
}

/** Stages this viewer could move the lead to right now (drives the form). */
export function allowedNextStages(u: LeadViewer, l: LeadLike): LeadStage[] {
  if (!canManageLead(u, l) || !Object.prototype.hasOwnProperty.call(NEXT, l.stage)) return [];
  return NEXT[l.stage as LeadStage].filter((to) => !(l.stage === "LOST" && to === "NEW" && !isSalesHead(u)));
}

export type StageDecision =
  | { ok: true; to: LeadStage; reason: string | null; closes: boolean; reopens: boolean }
  | { ok: false; code: "FORBIDDEN" | "INVALID_STAGE" | "INVALID_TRANSITION" | "ALREADY_DONE" | "REASON_REQUIRED"; message: string };

export function decideStage(u: LeadViewer, l: LeadLike, to: string, reason?: string | null): StageDecision {
  if (!(LEAD_STAGES as readonly string[]).includes(to)) return { ok: false, code: "INVALID_STAGE", message: "Choose a valid stage." };
  if (!canManageLead(u, l)) return { ok: false, code: "FORBIDDEN", message: "Only the lead's owner or the Sales head can change its stage." };
  if (l.stage === to) return { ok: false, code: "ALREADY_DONE", message: `This lead is already ${stageLabel(to).toLowerCase()}.` };
  const from = Object.prototype.hasOwnProperty.call(NEXT, l.stage) ? NEXT[l.stage as LeadStage] : [];
  if (!(from as string[]).includes(to)) {
    return { ok: false, code: "INVALID_TRANSITION", message: `A lead that is ${stageLabel(l.stage).toLowerCase()} can't move to ${stageLabel(to).toLowerCase()}.` };
  }
  if (l.stage === "LOST" && !isSalesHead(u)) {
    return { ok: false, code: "FORBIDDEN", message: "Only the Sales head can reopen a lost lead." };
  }
  const text = (reason ?? "").trim();
  if (to === "LOST" && !text) return { ok: false, code: "REASON_REQUIRED", message: "Say why the lead was lost." };
  if (text.length > MAX_REASON) return { ok: false, code: "REASON_REQUIRED", message: `Reason is too long (max ${MAX_REASON}).` };
  return { ok: true, to: to as LeadStage, reason: to === "LOST" ? text : text || null, closes: to === "WON" || to === "LOST", reopens: l.stage === "LOST" };
}

// ---- Follow-ups ----------------------------------------------------------------------------------

export type FollowUpState = "closed" | "none" | "overdue" | "today" | "upcoming";

/** Date strings are YYYY-MM-DD in the company timezone; `todayStr` is passed in so this stays pure. */
export function followUpState(l: { stage: string; nextFollowUpAt: Date | null }, todayStr: string): FollowUpState {
  if (!isOpenStage(l.stage)) return "closed";
  if (!l.nextFollowUpAt) return "none";
  const d = l.nextFollowUpAt.toISOString().slice(0, 10);
  return d < todayStr ? "overdue" : d === todayStr ? "today" : "upcoming";
}

export const FOLLOW_UP_LABEL: Record<FollowUpState, string> = {
  closed: "", none: "No follow-up planned", overdue: "Follow-up overdue", today: "Follow-up due today", upcoming: "Follow-up scheduled",
};

// ---- Input validation -----------------------------------------------------------------------------

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
export function validEmail(v: string): boolean {
  return v.length <= 254 && EMAIL.test(v);
}
/** Digits with optional + ( ) - . and spaces; 6-15 digits. */
export function validPhone(v: string): boolean {
  if (!/^\+?[\d\s().-]+$/.test(v) || v.length > 25) return false;
  const digits = v.replace(/\D/g, "").length;
  return digits >= 6 && digits <= 15;
}

export function isSource(v: string): boolean {
  return (LEAD_SOURCES as readonly string[]).includes(v);
}

/** Interaction time must not be in the future (a small clock skew is tolerated). */
export function validOccurredAt(d: Date, now: Date = new Date()): boolean {
  return !Number.isNaN(d.getTime()) && d.getTime() <= now.getTime() + 5 * 60_000;
}
