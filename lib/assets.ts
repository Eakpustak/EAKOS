import { safeHttpUrl } from "./hub";
import { TECHNOLOGY_SLUG } from "./checklists";
import { vendorNameKey } from "./vendors";
import type { ExpenseViewer } from "./expenses";

/**
 * Technical asset inventory (PHASES 8). Pure. Records WHAT exists (servers, domains, repositories, services) and WHO owns it.
 *
 * UNCONFIRMED by stakeholders:
 *  - Read: any member of Technology. Manage (add, edit, retire, reactivate): the Technology head. Other departments, Management heads
 *    as such and the Administrator role see nothing (RULES 2.3, 2.7).
 *  - SECRETS ARE NEVER STORED (PHASES 8 acceptance). `findSecret` refuses obvious passwords, tokens, private keys and URLs with credentials.
 *    It is a heuristic safety net, not a guarantee: the form says not to enter secrets and a human must still not.
 *  - GitHub stays the source of truth for code: a repository asset only links to it.
 *  - Never deleted, only retired. Names are unique (NFKC, case and spacing folded). Audit trail records field names, never values.
 */

export const ASSET_TYPES = ["Server", "Domain", "Repository", "Cloud account", "Service", "Database", "Device", "Other"] as const;
export const ENVIRONMENTS = ["Production", "Staging", "Development", "Not applicable"] as const;
export const MIN_NAME = 2, MAX_NAME = 120, MAX_NOTES = 1000;

export const isTechMember = (u: ExpenseViewer) => u.memberships.some((m) => m.department?.slug === TECHNOLOGY_SLUG);
export const isTechHead = (u: ExpenseViewer) => u.memberships.some((m) => m.type === "HEAD" && m.department?.slug === TECHNOLOGY_SLUG);
export const canViewAssets = isTechMember;
export const canManageAssets = isTechHead;

export const isAssetType = (v: string) => (ASSET_TYPES as readonly string[]).includes(v);
export const isEnvironment = (v: string) => (ENVIRONMENTS as readonly string[]).includes(v);
export const assetNameKey = vendorNameKey;

const SECRET_PATTERNS: [RegExp, string][] = [
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/, "a private key"],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, "a cloud access key"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/, "a GitHub token"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "an API key"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/, "a signed token"],
  [/[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i, "a URL containing a password"],
  [/\b(?:pass(?:word|wd)?|pwd|passcode|secret|api[_-]?key|access[_-]?key|auth[_-]?token|token|private[_-]?key)\b\s*(?:[:=]|is)\s*\S{3,}/i, "a password, key or token"],
];
/** Returns what looks like a secret in `text`, or null. Heuristic only. */
export function findSecret(text: string): string | null {
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) return what;
  return null;
}

// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/;
export type AssetInput = { name: string; assetType: string; environment: string; url: string; ownerId: string; notes: string };
export type AssetOk = { ok: true; name: string; nameKey: string; assetType: string; environment: string; url: string | null; ownerId: string | null; notes: string | null };

export function validateAsset(i: AssetInput): AssetOk | { ok: false; error: string } {
  if (BAD.test(i.name) || BAD.test(i.notes.replace(/[\r\n\t]/g, ""))) return { ok: false, error: "Remove control or direction-override characters." };
  const name = i.name.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (name.length < MIN_NAME) return { ok: false, error: "Enter the asset's name." };
  if (name.length > MAX_NAME) return { ok: false, error: `The name is longer than ${MAX_NAME} characters.` };
  if (!isAssetType(i.assetType)) return { ok: false, error: "Choose a type." };
  if (!isEnvironment(i.environment)) return { ok: false, error: "Choose an environment." };
  const rawUrl = i.url.trim();
  let url: string | null = null;
  if (rawUrl) {
    if (findSecret(rawUrl)) return { ok: false, error: "The link contains credentials. Remove them; secrets are never stored here." };
    url = safeHttpUrl(rawUrl);
    if (!url) return { ok: false, error: "The link must be an http or https address without a username or password." };
  }
  const notes = i.notes.trim();
  if (notes.length > MAX_NOTES) return { ok: false, error: `The notes are longer than ${MAX_NOTES} characters.` };
  const hit = findSecret(name) ?? findSecret(notes);
  if (hit) return { ok: false, error: `That looks like ${hit}. Secrets are never stored here: keep them in your password manager or secrets store and say where, not what.` };
  return { ok: true, name, nameKey: assetNameKey(name), assetType: i.assetType, environment: i.environment, url, ownerId: i.ownerId.trim() || null, notes: notes || null };
}
export const ASSET_STATUS_LABEL = { ACTIVE: "Active", RETIRED: "Retired" } as const;
export const assetStatusLabel = (s: string) => (Object.prototype.hasOwnProperty.call(ASSET_STATUS_LABEL, s) ? ASSET_STATUS_LABEL[s as keyof typeof ASSET_STATUS_LABEL] : s);
