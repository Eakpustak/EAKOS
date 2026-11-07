import type { Prisma } from "@prisma/client";

/**
 * Handover business rules. Everything here is pure (no DB, no session) so the rules in
 * RULES.md 1.6-1.8 / WORKFLOWS.md 2 can be unit-tested directly. Server actions call
 * `decide()` and then persist with a status-guarded write.
 */

export const HANDOVER_STATUSES = [
  "PENDING", "CLARIFICATION_REQUESTED", "ACCEPTED", "REJECTED", "COMPLETED", "CANCELLED",
] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];

export const ACTIVE_HANDOVER_STATUSES: HandoverStatus[] = ["PENDING", "CLARIFICATION_REQUESTED", "ACCEPTED"];

export const HANDOVER_STATUS_LABEL: Record<string, string> = {
  PENDING: "Awaiting acknowledgement",
  CLARIFICATION_REQUESTED: "Clarification requested",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export type HandoverAction = "accept" | "request_clarification" | "reject" | "respond" | "complete" | "cancel";
export const HANDOVER_ACTIONS: readonly HandoverAction[] = [
  "accept", "request_clarification", "reject", "respond", "complete", "cancel",
];

type Rule = {
  /** Who may perform it. The receiver and sender are always two different people (DB CHECK). */
  by: "receiver" | "sender";
  from: HandoverStatus[];
  to: HandoverStatus;
  /** RULES 1.8: rejection and clarification requests need a reason. Also used for the sender's answer and completion summary. */
  needsText: string | null;
  /** Event type written to the history. */
  event: string;
};

/** The whole state machine. Anything not listed here is rejected server-side. */
export const RULES: Record<HandoverAction, Rule> = {
  accept:                { by: "receiver", from: ["PENDING"], to: "ACCEPTED", needsText: null, event: "accepted" },
  request_clarification: { by: "receiver", from: ["PENDING"], to: "CLARIFICATION_REQUESTED", needsText: "Say what needs clarifying", event: "clarification_requested" },
  reject:                { by: "receiver", from: ["PENDING"], to: "REJECTED", needsText: "Give a reason for rejecting", event: "rejected" },
  respond:               { by: "sender", from: ["CLARIFICATION_REQUESTED"], to: "PENDING", needsText: "Write your answer first", event: "clarification_answered" },
  complete:              { by: "receiver", from: ["ACCEPTED"], to: "COMPLETED", needsText: "Add a completion summary", event: "completed" },
  cancel:                { by: "sender", from: ["PENDING", "CLARIFICATION_REQUESTED"], to: "CANCELLED", needsText: null, event: "cancelled" },
};

export type Decision =
  | { ok: true; to: HandoverStatus; event: string; text: string | null }
  | { ok: false; code: "FORBIDDEN" | "INVALID_STATE" | "TEXT_REQUIRED" | "ALREADY_DONE"; message: string };

export const MAX_TEXT = 5000;

/**
 * Decide whether `userId` may perform `action` on a handover in its current state.
 * Role comes from the stored sender/receiver IDs only, never from anything the client sends,
 * so a sender cannot accept on the receiver's behalf (RULES 1.7).
 */
export function decide(
  h: { status: string; senderId: string; receiverId: string },
  userId: string,
  action: string,
  text?: string | null,
): Decision {
  // Own-property check: a forged action such as "toString" or "__proto__" must not resolve to a prototype member.
  const rule = Object.prototype.hasOwnProperty.call(RULES, action) ? (RULES as Record<string, Rule>)[action] : undefined;
  if (!rule) return { ok: false, code: "INVALID_STATE", message: "That action is not valid." };

  const required = rule.by === "receiver" ? h.receiverId : h.senderId;
  if (userId !== required) {
    return {
      ok: false, code: "FORBIDDEN",
      message: rule.by === "receiver"
        ? "Only the named receiver can do this. A sender cannot respond on the receiver's behalf."
        : "Only the sender can do this.",
    };
  }
  // A double-submit/retry of an action that has already taken effect is reported, not repeated.
  if (h.status === rule.to && rule.from.every((s) => s !== rule.to)) {
    return { ok: false, code: "ALREADY_DONE", message: `This handover is already ${HANDOVER_STATUS_LABEL[rule.to].toLowerCase()}.` };
  }
  if (!(rule.from as string[]).includes(h.status)) {
    return {
      ok: false, code: "INVALID_STATE",
      message: `This can't be done while the handover is "${(HANDOVER_STATUS_LABEL[h.status] ?? h.status).toLowerCase()}".`,
    };
  }
  const trimmed = (text ?? "").trim();
  if (rule.needsText && !trimmed) return { ok: false, code: "TEXT_REQUIRED", message: rule.needsText + "." };
  if (trimmed.length > MAX_TEXT) return { ok: false, code: "TEXT_REQUIRED", message: `Text is too long (max ${MAX_TEXT}).` };
  return { ok: true, to: rule.to, event: rule.event, text: trimmed || null };
}

/** Which actions the viewer can currently take; drives which forms the detail page renders. */
export function availableActions(
  h: { status: string; senderId: string; receiverId: string },
  userId: string,
): HandoverAction[] {
  return HANDOVER_ACTIONS.filter((a) => {
    const r = RULES[a];
    return (r.by === "receiver" ? h.receiverId : h.senderId) === userId && (r.from as string[]).includes(h.status);
  });
}

// ---- Access ---------------------------------------------------------------------------

type Viewer = { id: string; memberships: { departmentId: string; type: string }[] };

function headDepartmentIds(user: Viewer): string[] {
  return user.memberships.filter((m) => m.type === "HEAD").map((m) => m.departmentId);
}

/**
 * Visible to the sender, the named receiver, and the heads of the sending or receiving
 * department (read-only oversight). Admin role and plain membership grant nothing (RULES 2.3, 2.7).
 */
export function visibleHandoverWhere(user: Viewer): Prisma.HandoverWhereInput {
  const heads = headDepartmentIds(user);
  return {
    OR: [
      { senderId: user.id },
      { receiverId: user.id },
      ...(heads.length ? [{ fromDepartmentId: { in: heads } }, { toDepartmentId: { in: heads } }] : []),
    ],
  };
}

export function canAccessHandover(
  user: Viewer,
  h: { senderId: string; receiverId: string; fromDepartmentId: string; toDepartmentId: string },
): boolean {
  if (h.senderId === user.id || h.receiverId === user.id) return true;
  const heads = headDepartmentIds(user);
  return heads.includes(h.fromDepartmentId) || heads.includes(h.toDepartmentId);
}

// ---- Escalation windows -----------------------------------------------------------------

/** Hours a receiver has to acknowledge before the handover is flagged. Configurable via HANDOVER_ACK_HOURS. */
export function ackWindowHours(): number {
  const n = Number(process.env.HANDOVER_ACK_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 24;
}

export function ackCutoff(now: Date = new Date(), hours = ackWindowHours()): Date {
  return new Date(now.getTime() - hours * 3_600_000);
}

/** Awaiting the receiver and past the acknowledgement window. */
export function isAckOverdue(h: { status: string; sentAt: Date }, now: Date = new Date(), hours = ackWindowHours()): boolean {
  return h.status === "PENDING" && h.sentAt.getTime() < ackCutoff(now, hours).getTime();
}

/** Human age such as "3h" or "2d" for "waiting for …" labels. */
export function ageLabel(from: Date, now: Date = new Date()): string {
  const mins = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return hrs < 48 ? `${hrs}h` : `${Math.floor(hrs / 24)}d`;
}

/** Receiver picker values are "<departmentId>|<userId>" so department and person are chosen together. */
export function parseReceiverChoice(v: string): { toDepartmentId: string; receiverId: string } | null {
  const [toDepartmentId, receiverId, extra] = v.split("|");
  return toDepartmentId && receiverId && extra === undefined ? { toDepartmentId, receiverId } : null;
}
