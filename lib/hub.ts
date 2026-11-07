import type { Prisma } from "@prisma/client";

/**
 * Company Hub rules (PRD "Company Hub", WORKFLOWS 9, RULES 7). Pure: no DB, no session, so the
 * publishing and audience rules can be unit-tested directly. Server actions call these and then
 * persist with a guarded write.
 *
 * Decisions (also in MEMORY.md section 15):
 *  - Author: department heads, Administrators and heads of the "management" department.
 *  - Company-wide publishing (audience ALL): Administrator or head of the "management" department.
 *  - Department-restricted publishing: only the head(s) of EVERY audience department. The admin role
 *    alone grants nothing over department-restricted content (RULES 2.7).
 *  - Plain members only read published content addressed to them.
 */

export const CONTENT_TYPES = ["ANNOUNCEMENT", "POLICY", "RESOURCE"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];
export const CONTENT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export type AudienceScope = "ALL" | "DEPARTMENTS";

export const TYPE_LABEL: Record<string, string> = {
  ANNOUNCEMENT: "Announcement",
  POLICY: "Policy / SOP",
  RESOURCE: "Resource",
};
export const TYPE_LABEL_PLURAL: Record<string, string> = {
  ANNOUNCEMENT: "Announcements",
  POLICY: "Policies & SOPs",
  RESOURCE: "Resources",
};
export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const MAX_TITLE = 200;
export const MAX_BODY = 20000;
export const MAX_URL = 2000;
export const MANAGEMENT_SLUG = "management";

export type HubViewer = {
  id: string;
  systemRole: string;
  memberships: { departmentId: string; type: string; department?: { slug: string } | null }[];
};
export type HubItem = {
  status: string;
  authorId: string;
  audienceScope: string;
  /** Department IDs of the audience. Meaningful only when audienceScope is DEPARTMENTS. */
  audienceDepartmentIds: string[];
};

// ---- Roles -------------------------------------------------------------------------------

export function headDepartmentIds(u: HubViewer): string[] {
  return u.memberships.filter((m) => m.type === "HEAD").map((m) => m.departmentId);
}
export function isManagementHead(u: HubViewer): boolean {
  return u.memberships.some((m) => m.type === "HEAD" && m.department?.slug === MANAGEMENT_SLUG);
}
/** May publish to the whole company. */
export function canPublishCompanyWide(u: HubViewer): boolean {
  return u.systemRole === "ADMIN" || isManagementHead(u);
}
/** May create drafts at all. */
export function canAuthor(u: HubViewer): boolean {
  return canPublishCompanyWide(u) || headDepartmentIds(u).length > 0;
}

/** May publish (or unpublish/archive/edit live content) addressed to this audience. */
export function canPublishTo(u: HubViewer, scope: string, departmentIds: string[]): boolean {
  if (scope === "ALL") return canPublishCompanyWide(u);
  if (scope !== "DEPARTMENTS" || departmentIds.length === 0) return false;
  const heads = headDepartmentIds(u);
  return departmentIds.every((id) => heads.includes(id));
}

/** Audience options a user may choose in the editor (they can only target what they could publish). */
export function allowedAudience(u: HubViewer): { companyWide: boolean; departmentIds: string[] } {
  return { companyWide: canPublishCompanyWide(u), departmentIds: headDepartmentIds(u) };
}

function item(i: HubItem) {
  return { scope: i.audienceScope, ids: i.audienceDepartmentIds };
}

/** May publish/unpublish/archive/restore this item. */
export function canPublishItem(u: HubViewer, i: HubItem): boolean {
  const a = item(i);
  return canPublishTo(u, a.scope, a.ids);
}

/** May edit this item: authors edit their own drafts; anything live/archived needs publish rights. */
export function canEditItem(u: HubViewer, i: HubItem): boolean {
  if (i.status === "DRAFT" && i.authorId === u.id && canAuthor(u)) return true;
  return canPublishItem(u, i);
}

/** May see the item in management views (drafts and archived included). */
export function canManageItem(u: HubViewer, i: HubItem): boolean {
  return (i.authorId === u.id && canAuthor(u)) || canPublishItem(u, i);
}

/** Published and addressed to this user. */
export function isAudienceMember(u: HubViewer, i: HubItem): boolean {
  if (i.audienceScope === "ALL") return true;
  const mine = new Set(u.memberships.map((m) => m.departmentId));
  return i.audienceDepartmentIds.some((id) => mine.has(id));
}

/** Server-side read check. Draft and archived content is never visible to ordinary audience members. */
export function canReadItem(u: HubViewer, i: HubItem): boolean {
  if (i.status === "PUBLISHED" && isAudienceMember(u, i)) return true;
  return canManageItem(u, i);
}

/**
 * Prisma filter equivalent of `canReadItem`. Used for lists and search so results obey the same
 * audience rules as the detail page (RULES 2.8). Keep in step with `canReadItem`.
 */
export function visibleContentWhere(u: HubViewer): Prisma.ContentItemWhereInput {
  const mine = u.memberships.map((m) => m.departmentId);
  const heads = headDepartmentIds(u);
  const or: Prisma.ContentItemWhereInput[] = [
    { status: "PUBLISHED", audienceScope: "ALL" },
    ...(mine.length ? [{ status: "PUBLISHED" as const, audienceScope: "DEPARTMENTS" as const, audiences: { some: { departmentId: { in: mine } } } }] : []),
  ];
  if (canAuthor(u)) or.push({ authorId: u.id });
  if (canPublishCompanyWide(u)) or.push({ audienceScope: "ALL" });
  if (heads.length) {
    or.push({ audienceScope: "DEPARTMENTS", audiences: { some: {}, every: { departmentId: { in: heads } } } });
  }
  return { OR: or };
}

// ---- Lifecycle ----------------------------------------------------------------------------

export type ContentAction = "publish" | "unpublish" | "archive" | "restore";
export const CONTENT_ACTIONS: readonly ContentAction[] = ["publish", "unpublish", "archive", "restore"];

type Rule = { from: ContentStatus[]; to: ContentStatus; event: string };
/** Whole lifecycle. Nothing is hard-deleted; unpublish and archive keep every version. */
export const CONTENT_RULES: Record<ContentAction, Rule> = {
  publish:   { from: ["DRAFT"], to: "PUBLISHED", event: "published" },
  unpublish: { from: ["PUBLISHED"], to: "DRAFT", event: "unpublished" },
  archive:   { from: ["DRAFT", "PUBLISHED"], to: "ARCHIVED", event: "archived" },
  restore:   { from: ["ARCHIVED"], to: "DRAFT", event: "restored" },
};

export const CONTENT_ACTION_DONE: Record<ContentAction, string> = {
  publish: "Published. The audience has been notified.",
  unpublish: "Unpublished. It is now a draft and no longer visible to its audience.",
  archive: "Archived. History is kept.",
  restore: "Restored to draft.",
};

export type ContentDecision =
  | { ok: true; to: ContentStatus; event: string }
  | { ok: false; code: "FORBIDDEN" | "INVALID_STATE" | "ALREADY_DONE" | "NO_AUDIENCE"; message: string };

export function decideContentAction(u: HubViewer, i: HubItem, action: string): ContentDecision {
  // Own-property check so "toString" / "__proto__" cannot resolve to a prototype member.
  const rule = Object.prototype.hasOwnProperty.call(CONTENT_RULES, action)
    ? (CONTENT_RULES as Record<string, Rule>)[action] : undefined;
  if (!rule) return { ok: false, code: "INVALID_STATE", message: "That action is not valid." };
  if (!canPublishItem(u, i)) {
    return { ok: false, code: "FORBIDDEN", message: "You are not authorised to publish or unpublish content for this audience." };
  }
  if (i.status === rule.to) {
    return { ok: false, code: "ALREADY_DONE", message: `This item is already ${STATUS_LABEL[rule.to].toLowerCase()}.` };
  }
  if (!(rule.from as string[]).includes(i.status)) {
    return {
      ok: false, code: "INVALID_STATE",
      message: `This can't be done while the item is ${(STATUS_LABEL[i.status] ?? i.status).toLowerCase()}.`,
    };
  }
  return { ok: true, to: rule.to, event: rule.event };
}

/** Actions to render for this viewer on this item. */
export function availableContentActions(u: HubViewer, i: HubItem): ContentAction[] {
  if (!canPublishItem(u, i)) return [];
  return CONTENT_ACTIONS.filter((a) => (CONTENT_RULES[a].from as string[]).includes(i.status));
}

// ---- Input validation ---------------------------------------------------------------------

/**
 * Accept only plain http(s) links without embedded credentials. Rejects javascript:, data:, file:,
 * vbscript: and protocol-relative values. Returns the normalised href or null.
 */
export function safeHttpUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || s.length > MAX_URL) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  if (!u.hostname) return null;
  return u.href;
}

export type AudienceInput = { scope: AudienceScope; departmentIds: string[] };

/** Parse the posted audience; unknown scope or empty/duplicate department lists are normalised or rejected. */
export function parseAudience(scope: string, departmentIds: string[]): AudienceInput | null {
  if (scope === "ALL") return { scope: "ALL", departmentIds: [] };
  if (scope === "DEPARTMENTS") {
    const ids = Array.from(new Set(departmentIds.map((d) => d.trim()).filter(Boolean)));
    return ids.length > 0 ? { scope: "DEPARTMENTS", departmentIds: ids } : null;
  }
  return null;
}

/** Plain-text body to paragraphs. React escapes the text, so no markup from authors can execute. */
export function splitParagraphs(body: string): string[] {
  return body.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

/** Describe an audience for display (names resolved by the caller). */
export function audienceLabel(scope: string, departmentNames: string[]): string {
  return scope === "ALL" ? "Everyone" : departmentNames.length ? departmentNames.join(", ") : "No departments";
}
