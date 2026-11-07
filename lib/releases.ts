import { findSecret, isTechHead, isTechMember } from "./assets";
import { safeHttpUrl } from "./hub";
import type { ExpenseViewer } from "./expenses";

/**
 * Technology deployment/release records (PHASES 8). Pure. Records WHAT was released WHERE, by WHOM and with what outcome.
 * GitHub stays the source of truth for code (RULES 1.10): a release keeps only a commit id and a link, never code or diffs.
 *
 * UNCONFIRMED by stakeholders:
 *  - Read, create and add notes: any member of Technology. Record an outcome (deployed, failed, cancelled, rolled back): the Technology head
 *    or the person who created the record. Everyone else, including Management heads and the Administrator role, sees nothing (RULES 2.3, 2.7).
 *  - Flow: PLANNED -> DEPLOYED | FAILED | CANCELLED; DEPLOYED -> ROLLED_BACK. FAILED, CANCELLED and ROLLED_BACK are final: a fix is a NEW record.
 *    "Deployed" records who marked it and when. This app deploys nothing; it records what people say they did.
 *  - No four-eyes rule for Production yet (whether a second person must confirm a Production deploy is an open question).
 *  - The environment is copied from the asset at creation, so the record survives later asset edits. Only ACTIVE assets can be released.
 *  - Text fields are refused if they contain an obvious secret (same detector as the asset inventory).
 */

export const RELEASE_STATUS_LABEL: Record<string, string> = { PLANNED: "Planned", DEPLOYED: "Deployed", FAILED: "Failed", ROLLED_BACK: "Rolled back", CANCELLED: "Cancelled" };
export const releaseStatusLabel = (s: string) => (Object.prototype.hasOwnProperty.call(RELEASE_STATUS_LABEL, s) ? RELEASE_STATUS_LABEL[s] : s);
export const FINAL_STATUSES = ["FAILED", "ROLLED_BACK", "CANCELLED"] as const;

export const MAX_VERSION = 60, MAX_SUMMARY = 1000, MAX_TEXT = 1000;
export const canViewReleases = isTechMember;
export const canCreateRelease = isTechMember;

// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/;
const noSecret = (t: string) => { const h = findSecret(t); return h ? `That looks like ${h}. Secrets are never stored here; say where it is kept, not what it is.` : null; };

export type ReleaseInput = { version: string; summary: string; assetId: string; commitRef: string; changeUrl: string };
export type ReleaseOk = { ok: true; version: string; summary: string; assetId: string; commitRef: string | null; changeUrl: string | null };
export function validateRelease(i: ReleaseInput): ReleaseOk | { ok: false; error: string } {
  if (BAD.test(i.version) || BAD.test(i.commitRef) || BAD.test(i.summary.replace(/[\r\n\t]/g, ""))) return { ok: false, error: "Remove control or direction-override characters." };
  const version = i.version.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!version) return { ok: false, error: "Enter the version or release name, for example v1.4.2." };
  if (version.length > MAX_VERSION) return { ok: false, error: `The version is longer than ${MAX_VERSION} characters.` };
  const summary = i.summary.trim();
  if (!summary) return { ok: false, error: "Say what changes in this release." };
  if (summary.length > MAX_SUMMARY) return { ok: false, error: `The summary is longer than ${MAX_SUMMARY} characters.` };
  const assetId = i.assetId.trim();
  if (!assetId) return { ok: false, error: "Choose the asset being released." };
  const commit = i.commitRef.trim().toLowerCase();
  if (commit && !/^[0-9a-f]{7,40}$/.test(commit)) return { ok: false, error: "A commit id is 7 to 40 hexadecimal characters (0-9, a-f)." };
  const rawUrl = i.changeUrl.trim();
  let changeUrl: string | null = null;
  if (rawUrl) {
    if (findSecret(rawUrl)) return { ok: false, error: "The link contains credentials. Remove them; secrets are never stored here." };
    changeUrl = safeHttpUrl(rawUrl);
    if (!changeUrl) return { ok: false, error: "The link must be an http or https address without a username or password." };
  }
  const secret = noSecret(version) ?? noSecret(summary);
  if (secret) return { ok: false, error: secret };
  return { ok: true, version, summary, assetId, commitRef: commit || null, changeUrl };
}

export type ReleaseAction = "deploy" | "fail" | "cancel" | "rollback" | "note";
type Rule = { from: readonly string[] | "any"; to: string | null; by: "handler" | "member"; text: "required" | "optional" };
const RULES: Record<ReleaseAction, Rule> = {
  deploy: { from: ["PLANNED"], to: "DEPLOYED", by: "handler", text: "optional" },
  fail: { from: ["PLANNED"], to: "FAILED", by: "handler", text: "required" },
  cancel: { from: ["PLANNED"], to: "CANCELLED", by: "handler", text: "required" },
  rollback: { from: ["DEPLOYED"], to: "ROLLED_BACK", by: "handler", text: "required" },
  note: { from: "any", to: null, by: "member", text: "required" },
};
export type ReleaseLike = { status: string; creatorId: string };
export type ReleaseDecision =
  | { ok: true; to: string; text: string | null }
  | { ok: false; code: "INVALID_STATE" | "FORBIDDEN" | "BAD_INPUT"; message: string };

/** The head, or the person who created the record. Being in Technology alone is not enough to record an outcome. */
export const isReleaseHandler = (u: ExpenseViewer, r: ReleaseLike) => isTechHead(u) || (isTechMember(u) && r.creatorId === u.id);

export function availableReleaseActions(u: ExpenseViewer, r: ReleaseLike): ReleaseAction[] {
  if (!isTechMember(u)) return [];
  return (Object.keys(RULES) as ReleaseAction[]).filter((a) => {
    const rule = RULES[a];
    if (rule.from !== "any" && !rule.from.includes(r.status)) return false;
    if (rule.by === "handler" && !isReleaseHandler(u, r)) return false;
    return true;
  });
}

export function decideRelease(u: ExpenseViewer, r: ReleaseLike, action: string, rawText: string): ReleaseDecision {
  const rule = Object.prototype.hasOwnProperty.call(RULES, action) ? RULES[action as ReleaseAction] : undefined;
  if (!rule) return { ok: false, code: "INVALID_STATE", message: "That action is not valid." };
  if (!isTechMember(u)) return { ok: false, code: "FORBIDDEN", message: "Only the Technology team can change release records." };
  if (rule.by === "handler" && !isReleaseHandler(u, r)) return { ok: false, code: "FORBIDDEN", message: "Only the Technology head or the person who created this record can do that." };
  if (rule.from !== "any" && !rule.from.includes(r.status)) return { ok: false, code: "INVALID_STATE", message: `This release is ${releaseStatusLabel(r.status).toLowerCase()}, so that is not possible now.` };
  const text = rawText.trim();
  if (BAD.test(text.replace(/[\r\n\t]/g, ""))) return { ok: false, code: "BAD_INPUT", message: "Remove control or direction-override characters." };
  if (rule.text === "required" && !text) return { ok: false, code: "BAD_INPUT", message: "Write a note. It stays in the history." };
  if (text.length > MAX_TEXT) return { ok: false, code: "BAD_INPUT", message: `The note is longer than ${MAX_TEXT} characters.` };
  const secret = text ? noSecret(text) : null;
  if (secret) return { ok: false, code: "BAD_INPUT", message: secret };
  return { ok: true, to: rule.to ?? r.status, text: text || null };
}
