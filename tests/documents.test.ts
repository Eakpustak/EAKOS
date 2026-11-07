import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DOC_BYTES, attachmentHeader, auditMeta, canManageDocuments, canReadDocument, docKindLabel, fmtSize, isSafeStorageKey,
  newStorageKey, safeFileName, sniffType, validateUpload,
} from "../lib/documents";

const m = (slug: string, type = "MEMBER") => ({ departmentId: `d-${slug}`, type, department: { slug } });
const hr = { id: "hr", memberships: [m("human-resources", "HEAD")] };
const hrMember = { id: "hm", memberships: [m("human-resources")] };
const admin = { id: "ad", memberships: [m("management", "HEAD")] };
const sales = { id: "sh", memberships: [m("sales-and-marketing", "HEAD")] };
const emp = { id: "e1", memberships: [m("technology")] };

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

test("read: the employee reads their own, the HR head reads all, nobody else", () => {
  assert.equal(canReadDocument(emp, "e1"), true);
  assert.equal(canReadDocument(hr, "e1"), true);
  assert.equal(canReadDocument(emp, "e2"), false, "another employee is denied");
  assert.equal(canReadDocument(hrMember, "e1"), false, "plain HR membership grants nothing");
  assert.equal(canReadDocument(admin, "e1"), false, "management head / admin grants nothing");
  assert.equal(canReadDocument(sales, "e1"), false, "a department head grants nothing");
  assert.equal(canReadDocument({ id: "x", memberships: [{ departmentId: "d", type: "HEAD", department: null }] }, "e1"), false);
});

test("manage: only the HR head, never about themselves", () => {
  assert.equal(canManageDocuments(hr, "e1"), true);
  assert.equal(canManageDocuments(hr, "hr"), false, "HR head cannot edit their own record");
  assert.equal(canManageDocuments(hrMember, "e1"), false);
  assert.equal(canManageDocuments(admin, "e1"), false);
  assert.equal(canManageDocuments(emp, "e1"), false, "an employee cannot add or delete their own documents");
});

test("file type comes from the bytes, not the name", () => {
  assert.deepEqual(sniffType(pdf), { mime: "application/pdf", ext: "pdf" });
  assert.deepEqual(sniffType(png), { mime: "image/png", ext: "png" });
  assert.deepEqual(sniffType(jpg), { mime: "image/jpeg", ext: "jpg" });
  assert.equal(sniffType(new TextEncoder().encode("<html><script>alert(1)</script>")), null);
  assert.equal(sniffType(new TextEncoder().encode("PK\u0003\u0004")), null, "zip/docx is refused");
  assert.equal(sniffType(new Uint8Array([0x25, 0x50])), null, "truncated header");
  assert.equal(sniffType(new Uint8Array()), null);
});

test("upload validation", () => {
  const ok = validateUpload({ kind: "CONTRACT", fileName: "evil.html", bytes: pdf, note: "  signed  " });
  assert.equal(ok.ok && ok.name, "evil.pdf", "extension is forced to the real type");
  assert.equal(ok.ok && ok.note, "signed");
  assert.equal(ok.ok && ok.mime, "application/pdf");
  const html = validateUpload({ kind: "OTHER", fileName: "a.pdf", bytes: new TextEncoder().encode("<html>"), note: "" });
  assert.equal(html.ok, false, "a .pdf name does not make it a PDF");
  assert.equal(validateUpload({ kind: "nope", fileName: "a.pdf", bytes: pdf, note: "" }).ok, false);
  assert.equal(validateUpload({ kind: "constructor", fileName: "a.pdf", bytes: pdf, note: "" }).ok, false);
  assert.equal(validateUpload({ kind: "OTHER", fileName: "a.pdf", bytes: new Uint8Array(), note: "" }).ok, false);
  const big = new Uint8Array(MAX_DOC_BYTES + 1); big.set(pdf);
  assert.equal(validateUpload({ kind: "OTHER", fileName: "a.pdf", bytes: big, note: "" }).ok, false);
  const edge = new Uint8Array(MAX_DOC_BYTES); edge.set(pdf);
  assert.equal(validateUpload({ kind: "OTHER", fileName: "a.pdf", bytes: edge, note: "" }).ok, true, "exactly 5 MB is allowed");
  assert.equal(validateUpload({ kind: "OTHER", fileName: "a.pdf", bytes: pdf, note: "x".repeat(301) }).ok, false);
});

test("file names are sanitised", () => {
  assert.equal(safeFileName("../../etc/passwd", "pdf"), "passwd.pdf");
  assert.equal(safeFileName("C:\\Users\\a\\cv.final.docx", "pdf"), "cv.final.pdf");
  assert.equal(safeFileName("", "png"), "document.png");
  assert.equal(safeFileName("..", "png"), "document.png");
  assert.equal(safeFileName('a"b<c>.pdf', "pdf"), "abc.pdf");
  assert.equal(safeFileName("exe\u202Efdp.exe", "pdf"), "exefdp.pdf", "bidi override removed");
  assert.ok(safeFileName("x".repeat(500) + ".pdf", "pdf").length <= 120);
});

test("storage keys are generated and guarded against traversal", () => {
  const k = newStorageKey("pdf");
  assert.equal(isSafeStorageKey(k), true);
  assert.notEqual(k, newStorageKey("pdf"));
  for (const bad of ["../x.pdf", "a/b.pdf", "", "x.pdf", `${k}/..`, `${k}.exe`, k.replace(".pdf", ".html"), `/${k}`, `${k}\u0000`]) {
    assert.equal(isSafeStorageKey(bad), false, JSON.stringify(bad));
  }
});

test("download header is always an attachment and cannot be broken out of", () => {
  const h = attachmentHeader('re"port;\r\nX-Evil: 1.pdf');
  assert.ok(h.startsWith("attachment;"));
  assert.equal(/[\r\n]/.test(h), false, "no header injection");
  assert.equal(h.split('"').length, 3, "exactly one quoted value");
  assert.ok(attachmentHeader("résumé.pdf").includes("filename*=UTF-8''r%C3%A9sum%C3%A9.pdf"));
});

test("labels, sizes and audit metadata", () => {
  assert.equal(docKindLabel("ID_PROOF"), "Identity proof");
  assert.equal(docKindLabel("toString"), "toString", "prototype keys are not labels");
  assert.equal(fmtSize(512), "512 B");
  assert.equal(fmtSize(2048), "2 KB");
  assert.equal(fmtSize(5 * 1024 * 1024), "5.0 MB");
  const meta = auditMeta({ kind: "CONTRACT", sizeBytes: 10, fileName: "secret.pdf", note: "n" } as never);
  assert.deepEqual(meta, { kind: "CONTRACT", sizeBytes: 10 }, "no file name or note in the audit trail");
});
