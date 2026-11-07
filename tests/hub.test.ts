import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_ACTIONS, MAX_URL, allowedAudience, availableContentActions, canAuthor, canEditItem, canManageItem,
  canPublishCompanyWide, canPublishItem, canPublishTo, canReadItem, decideContentAction, parseAudience,
  safeHttpUrl, splitParagraphs, visibleContentWhere, type HubItem, type HubViewer,
} from "../lib/hub";

const MGMT = "d_mgmt", SALES = "d_sales", TECH = "d_tech";
const mem = (departmentId: string, type: "HEAD" | "MEMBER", slug = departmentId) => ({ departmentId, type, department: { slug } });

const admin: HubViewer = { id: "admin", systemRole: "ADMIN", memberships: [] };
const mgmtHead: HubViewer = { id: "mgmt", systemRole: "MEMBER", memberships: [mem(MGMT, "HEAD", "management")] };
const salesHead: HubViewer = { id: "salesHead", systemRole: "MEMBER", memberships: [mem(SALES, "HEAD")] };
const salesIntern: HubViewer = { id: "intern", systemRole: "MEMBER", memberships: [mem(SALES, "MEMBER")] };
const techDev: HubViewer = { id: "dev", systemRole: "MEMBER", memberships: [mem(TECH, "MEMBER")] };
const techHead: HubViewer = { id: "techHead", systemRole: "MEMBER", memberships: [mem(TECH, "HEAD")] };
const multiHead: HubViewer = { id: "multi", systemRole: "MEMBER", memberships: [mem(SALES, "HEAD"), mem(TECH, "HEAD")] };

const company = (status: string, authorId = "someone"): HubItem => ({ status, authorId, audienceScope: "ALL", audienceDepartmentIds: [] });
const salesOnly = (status: string, authorId = "salesHead"): HubItem => ({ status, authorId, audienceScope: "DEPARTMENTS", audienceDepartmentIds: [SALES] });
const salesAndTech = (status: string): HubItem => ({ status, authorId: "multi", audienceScope: "DEPARTMENTS", audienceDepartmentIds: [SALES, TECH] });

// ---- Who may publish -------------------------------------------------------------------------

test("plain members cannot author or publish anything", () => {
  assert.equal(canAuthor(salesIntern), false);
  assert.equal(canPublishTo(salesIntern, "ALL", []), false);
  assert.equal(canPublishTo(salesIntern, "DEPARTMENTS", [SALES]), false);
  assert.equal(availableContentActions(salesIntern, company("DRAFT")).length, 0);
});

test("company-wide publishing is for admins and the management head only", () => {
  assert.equal(canPublishCompanyWide(admin), true);
  assert.equal(canPublishCompanyWide(mgmtHead), true);
  assert.equal(canPublishCompanyWide(salesHead), false);
  assert.equal(canPublishTo(salesHead, "ALL", []), false);
});

test("a department head may publish only to departments they head (all of them)", () => {
  assert.equal(canPublishTo(salesHead, "DEPARTMENTS", [SALES]), true);
  assert.equal(canPublishTo(salesHead, "DEPARTMENTS", [TECH]), false);
  assert.equal(canPublishTo(salesHead, "DEPARTMENTS", [SALES, TECH]), false);
  assert.equal(canPublishTo(multiHead, "DEPARTMENTS", [SALES, TECH]), true);
});

test("admin role alone grants nothing over department-restricted content (RULES 2.7)", () => {
  assert.equal(canPublishTo(admin, "DEPARTMENTS", [SALES]), false);
  assert.equal(canReadItem(admin, salesOnly("DRAFT")), false);
  assert.equal(canReadItem(admin, salesOnly("ARCHIVED")), false);
});

test("empty or unknown audiences can never be published to", () => {
  assert.equal(canPublishTo(admin, "DEPARTMENTS", []), false);
  assert.equal(canPublishTo(admin, "EVERYONE", []), false);
  assert.equal(canPublishTo(mgmtHead, "", []), false);
});

test("allowedAudience limits what the editor offers", () => {
  assert.deepEqual(allowedAudience(salesHead), { companyWide: false, departmentIds: [SALES] });
  assert.deepEqual(allowedAudience(admin), { companyWide: true, departmentIds: [] });
});

// ---- Reading: drafts and audience (PHASES acceptance) ---------------------------------------

test("draft content is not visible to ordinary audience members", () => {
  assert.equal(canReadItem(salesIntern, company("DRAFT")), false);
  assert.equal(canReadItem(salesIntern, salesOnly("DRAFT")), false);
  assert.equal(canReadItem(salesIntern, salesOnly("ARCHIVED")), false);
});

test("published content is visible to its audience only", () => {
  assert.equal(canReadItem(salesIntern, company("PUBLISHED")), true);
  assert.equal(canReadItem(salesIntern, salesOnly("PUBLISHED")), true);
  assert.equal(canReadItem(techDev, salesOnly("PUBLISHED")), false);
  assert.equal(canReadItem(techHead, salesOnly("PUBLISHED")), false);
});

test("an author sees their own draft but not other people's", () => {
  assert.equal(canReadItem(salesHead, salesOnly("DRAFT", "salesHead")), true);
  const otherDraft = { ...salesOnly("DRAFT", "someoneElse"), audienceDepartmentIds: [SALES] };
  assert.equal(canReadItem(salesHead, otherDraft), true, "heads of the audience department can see it");
  assert.equal(canReadItem(techHead, otherDraft), false);
});

test("a demoted author (no longer a head) loses access to their old draft", () => {
  const demoted: HubViewer = { id: "salesHead", systemRole: "MEMBER", memberships: [mem(SALES, "MEMBER")] };
  assert.equal(canReadItem(demoted, salesOnly("DRAFT", "salesHead")), false);
  assert.equal(canEditItem(demoted, salesOnly("DRAFT", "salesHead")), false);
});

test("management views include company-wide drafts for admins and the management head", () => {
  assert.equal(canReadItem(admin, company("DRAFT")), true);
  assert.equal(canReadItem(mgmtHead, company("ARCHIVED")), true);
  assert.equal(canManageItem(salesHead, company("DRAFT", "x")), false);
});

// ---- Editing -------------------------------------------------------------------------------

test("only the author edits a draft; live and archived content needs publish rights", () => {
  assert.equal(canEditItem(salesHead, salesOnly("DRAFT", "salesHead")), true);
  assert.equal(canEditItem(salesHead, salesOnly("PUBLISHED", "salesHead")), true);
  assert.equal(canEditItem(salesIntern, salesOnly("PUBLISHED", "salesHead")), false);
  assert.equal(canEditItem(techHead, salesOnly("DRAFT", "salesHead")), false);
  // An author who may not publish to company-wide cannot edit it once live.
  assert.equal(canEditItem(salesHead, company("PUBLISHED", "salesHead")), false);
});

// ---- Lifecycle ---------------------------------------------------------------------------

test("authorised publisher can publish a draft", () => {
  const d = decideContentAction(salesHead, salesOnly("DRAFT"), "publish");
  assert.deepEqual(d, { ok: true, to: "PUBLISHED", event: "published" });
});

test("unauthorised user cannot publish, even the author of a company-wide draft", () => {
  const d = decideContentAction(salesHead, company("DRAFT", "salesHead"), "publish");
  assert.equal(!d.ok && d.code, "FORBIDDEN");
  assert.equal((decideContentAction(salesIntern, salesOnly("DRAFT"), "publish") as { code: string }).code, "FORBIDDEN");
  assert.equal((decideContentAction(techHead, salesOnly("DRAFT"), "publish") as { code: string }).code, "FORBIDDEN");
});

test("publishing to a multi-department audience needs every department head", () => {
  assert.equal(decideContentAction(salesHead, salesAndTech("DRAFT"), "publish").ok, false);
  assert.equal(decideContentAction(multiHead, salesAndTech("DRAFT"), "publish").ok, true);
});

test("lifecycle: publish -> unpublish -> archive -> restore, nothing else", () => {
  const pub = (s: string, a: string) => decideContentAction(mgmtHead, company(s), a);
  assert.equal(pub("DRAFT", "publish").ok, true);
  assert.equal(pub("PUBLISHED", "unpublish").ok, true);
  assert.equal(pub("PUBLISHED", "archive").ok, true);
  assert.equal(pub("DRAFT", "archive").ok, true);
  assert.equal(pub("ARCHIVED", "restore").ok, true);
  assert.equal((pub("ARCHIVED", "publish") as { code: string }).code, "INVALID_STATE");
  assert.equal((pub("DRAFT", "unpublish") as { code: string }).code, "ALREADY_DONE");
  assert.equal((pub("PUBLISHED", "restore") as { code: string }).code, "INVALID_STATE");
  assert.equal((pub("ARCHIVED", "unpublish") as { code: string }).code, "INVALID_STATE");
});

test("a repeated publish is reported as already done, not repeated", () => {
  assert.equal((decideContentAction(mgmtHead, company("PUBLISHED"), "publish") as { code: string }).code, "ALREADY_DONE");
  assert.equal((decideContentAction(mgmtHead, company("ARCHIVED"), "archive") as { code: string }).code, "ALREADY_DONE");
});

test("forged action names are rejected (no prototype lookup)", () => {
  for (const a of ["toString", "__proto__", "constructor", "hasOwnProperty", "delete", ""]) {
    assert.equal((decideContentAction(admin, company("DRAFT"), a) as { code: string }).code, "INVALID_STATE", a);
  }
});

test("availableContentActions matches decideContentAction for every status", () => {
  for (const status of ["DRAFT", "PUBLISHED", "ARCHIVED"]) {
    const i = company(status);
    const listed = availableContentActions(mgmtHead, i);
    const allowed = CONTENT_ACTIONS.filter((a) => decideContentAction(mgmtHead, i, a).ok);
    assert.deepEqual(listed, allowed, status);
  }
});

// ---- Query filter (lists and search) ---------------------------------------------------------

test("visibleContentWhere gives a plain member only published + audience clauses", () => {
  const w = visibleContentWhere(salesIntern) as { OR: unknown[] };
  assert.equal(w.OR.length, 2);
  assert.deepEqual(w.OR[0], { status: "PUBLISHED", audienceScope: "ALL" });
  assert.deepEqual(w.OR[1], { status: "PUBLISHED", audienceScope: "DEPARTMENTS", audiences: { some: { departmentId: { in: [SALES] } } } });
  assert.ok(!JSON.stringify(w).includes("DRAFT"));
});

test("visibleContentWhere never widens a member's view to drafts or other departments", () => {
  const w = JSON.stringify(visibleContentWhere(techDev));
  assert.ok(w.includes(TECH));
  assert.ok(!w.includes(SALES));
  assert.ok(!w.includes("authorId"));
});

test("visibleContentWhere adds management clauses only for those who manage", () => {
  const head = JSON.stringify(visibleContentWhere(salesHead));
  assert.ok(head.includes('"authorId":"salesHead"'));
  assert.ok(head.includes('"every":{"departmentId":{"in":["d_sales"]}}'));
  const headOr = (visibleContentWhere(salesHead) as { OR: { audienceScope?: string; status?: string }[] }).OR;
  assert.ok(!headOr.some((c) => c.audienceScope === "ALL" && !c.status), "a department head sees no company-wide drafts");
  const adm = visibleContentWhere(admin) as { OR: { audienceScope?: string; status?: string }[] };
  assert.ok(adm.OR.some((c) => c.audienceScope === "ALL" && !c.status), "admin sees company-wide drafts");
  assert.ok(!JSON.stringify(adm).includes('"every"'), "admin gets no department-restricted clause");
});

// ---- Input handling ------------------------------------------------------------------------

test("safeHttpUrl accepts plain http(s) and rejects script-capable or credentialed links", () => {
  assert.equal(safeHttpUrl("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(safeHttpUrl("  http://example.com "), "http://example.com/");
  for (const bad of [
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>1</script>", "vbscript:x", "file:///etc/passwd",
    "//evil.com", "example.com", "ftp://example.com", "https://user:pw@example.com", "", "   ", "https://",
    "https://example.com/" + "a".repeat(MAX_URL),
  ]) assert.equal(safeHttpUrl(bad), null, bad);
});

test("parseAudience normalises and rejects bad input", () => {
  assert.deepEqual(parseAudience("ALL", ["x"]), { scope: "ALL", departmentIds: [] });
  assert.deepEqual(parseAudience("DEPARTMENTS", ["a", "a", " b ", ""]), { scope: "DEPARTMENTS", departmentIds: ["a", "b"] });
  assert.equal(parseAudience("DEPARTMENTS", []), null);
  assert.equal(parseAudience("PUBLIC", ["a"]), null);
});

test("splitParagraphs keeps markup as inert text", () => {
  const out = splitParagraphs("Hello <script>alert(1)</script>\r\n\r\n\r\nSecond\nline\n\n  ");
  assert.deepEqual(out, ["Hello <script>alert(1)</script>", "Second\nline"]);
});
