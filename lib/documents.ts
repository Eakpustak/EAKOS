import { randomUUID } from "node:crypto";

/**
 * Restricted employee document register (PHASES 6, ARCHITECTURE 6 `hr.documents.read`). Pure: no DB, no session, no disk.
 *
 * UNCONFIRMED by stakeholders (PRD: "file storage provider, retention and allowed document types" are open):
 *  - Types are an allowlist of PDF, PNG and JPEG, at most 5 MB. The type is decided from the file's own first bytes, never from the
 *    browser's content type or the file name.
 *  - Who may read: the HR head, and the employee for their OWN documents. Nobody else. The Administrator role, Management heads,
 *    department heads and plain HR members get nothing (RULES 2.3, 2.7; ARCHITECTURE 6).
 *  - Who may add or remove: the HR head only, and never for themselves (so nobody can quietly edit their own record; the HR head's own
 *    documents have to be handled by someone outside this slice).
 *  - Kinds are placeholders and are checked in code and by a DB CHECK.
 *  - The register keeps no version history and no retention timer.
 */

export const DOC_KINDS = ["ID_PROOF", "CONTRACT", "OFFER_LETTER", "CERTIFICATE", "OTHER"] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export const DOC_KIND_LABEL: Record<string, string> = {
  ID_PROOF: "Identity proof", CONTRACT: "Contract", OFFER_LETTER: "Offer letter", CERTIFICATE: "Certificate", OTHER: "Other",
};
export function docKindLabel(k: string): string {
  return Object.prototype.hasOwnProperty.call(DOC_KIND_LABEL, k) ? DOC_KIND_LABEL[k] : k;
}
export function isDocKind(v: string): v is DocKind {
  return (DOC_KINDS as readonly string[]).includes(v);
}

export const MAX_DOC_BYTES = 5 * 1024 * 1024;
export const MAX_DOC_NOTE = 300;
export const MAX_NAME = 120;

export type DocViewer = { id: string; memberships: { departmentId: string; type: string; department?: { slug: string } | null }[] };
export const HR_SLUG = "human-resources";

export function isDocHrHead(u: DocViewer): boolean {
  return u.memberships.some((m) => m.type === "HEAD" && m.department?.slug === HR_SLUG);
}
/** The employee reads their own documents; the HR head reads everyone's. Nobody else. */
export function canReadDocument(u: DocViewer, subjectId: string): boolean {
  return u.id === subjectId || isDocHrHead(u);
}
/** Only the HR head adds or removes documents, and never for themselves. */
export function canManageDocuments(u: DocViewer, subjectId: string): boolean {
  return isDocHrHead(u) && u.id !== subjectId;
}

// ---- File content -----------------------------------------------------------------------------------------

export type Sniffed = { mime: "application/pdf" | "image/png" | "image/jpeg"; ext: "pdf" | "png" | "jpg" };
export function sniffType(b: Uint8Array): Sniffed | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return { mime: "application/pdf", ext: "pdf" };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { mime: "image/png", ext: "png" };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  return null;
}

/** A display name: no path, no control or bidi characters, bounded, extension forced to the real type. */
export function safeFileName(raw: string, ext: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069"<>:*?|]/g, "")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, MAX_NAME - 5)
    .trim();
  return `${base || "document"}.${ext}`;
}

export type UploadOk = { ok: true; kind: DocKind; mime: Sniffed["mime"]; ext: Sniffed["ext"]; name: string; note: string | null };
export type UploadResult = UploadOk | { ok: false; error: string };

export function validateUpload(input: { kind: string; fileName: string; bytes: Uint8Array; note: string }): UploadResult {
  if (!isDocKind(input.kind)) return { ok: false, error: "Choose a document type." };
  if (input.bytes.length === 0) return { ok: false, error: "Choose a file." };
  if (input.bytes.length > MAX_DOC_BYTES) return { ok: false, error: "The file is larger than 5 MB." };
  const s = sniffType(input.bytes);
  if (!s) return { ok: false, error: "Only PDF, PNG or JPEG files are accepted." };
  const note = input.note.trim();
  if (note.length > MAX_DOC_NOTE) return { ok: false, error: `The note is longer than ${MAX_DOC_NOTE} characters.` };
  return { ok: true, kind: input.kind, mime: s.mime, ext: s.ext, name: safeFileName(input.fileName, s.ext), note: note || null };
}

// ---- Storage keys and download headers --------------------------------------------------------------------

/** Keys are generated here, never taken from a user. The pattern is also the traversal guard before any disk access. */
export function newStorageKey(ext: string): string {
  return `${randomUUID()}.${ext}`;
}
const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg)$/;
export function isSafeStorageKey(k: string): boolean {
  return KEY_RE.test(k);
}

/** Always a download, never inline. The ASCII fallback has no quotes or separators; the real name goes in filename*. */
export function attachmentHeader(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\;%]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Audit metadata. Deliberately no file name, note or content: names often carry personal data. */
export function auditMeta(d: { kind: string; sizeBytes: number }): { kind: string; sizeBytes: number } {
  return { kind: d.kind, sizeBytes: d.sizeBytes };
}
