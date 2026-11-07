import test from "node:test";
import assert from "node:assert/strict";
import {
  LEAD_STAGES, allowedNextStages, canAccessLead, canCreateLead, canManageLead, decideStage, followUpState,
  isOpenStage, isSalesHead, isSalesMember, validEmail, validOccurredAt, validPhone, visibleLeadWhere,
  type LeadViewer,
} from "../lib/leads";

const m = (slug: string, type: "HEAD" | "MEMBER") => ({ departmentId: `d_${slug}`, type, department: { slug } });
const head: LeadViewer = { id: "head", memberships: [m("sales-and-marketing", "HEAD")] };
const owner: LeadViewer = { id: "owner", memberships: [m("sales-and-marketing", "MEMBER")] };
const intern: LeadViewer = { id: "intern", memberships: [m("sales-and-marketing", "MEMBER")] };
const techHead: LeadViewer = { id: "tech", memberships: [m("technology", "HEAD")] };
const mgmtHead: LeadViewer = { id: "mgmt", memberships: [m("management", "HEAD")] };
const lead = (stage = "NEW", ownerId = "owner", createdById = "owner") => ({ ownerId, createdById, stage });

// ---- Access (Sales data is not exposed without permission) -------------------------------------

test("only Sales members can create leads", () => {
  assert.equal(canCreateLead(owner), true);
  assert.equal(canCreateLead(techHead), false);
  assert.equal(canCreateLead(mgmtHead), false);
  assert.equal(isSalesMember(techHead), false);
  assert.equal(isSalesHead(owner), false);
  assert.equal(isSalesHead(head), true);
});

test("owner, creator and Sales head can read; another Sales member cannot (RULES 1.3)", () => {
  const l = lead("NEW", "owner", "creator");
  assert.equal(canAccessLead(owner, l), true);
  assert.equal(canAccessLead({ ...intern, id: "creator" }, l), true);
  assert.equal(canAccessLead(head, l), true);
  assert.equal(canAccessLead(intern, l), false);
});

test("non-Sales users never read leads, even heads of other departments", () => {
  const l = lead();
  assert.equal(canAccessLead(techHead, l), false);
  assert.equal(canAccessLead(mgmtHead, l), false);
});

test("someone moved out of Sales loses access to leads they own", () => {
  const moved: LeadViewer = { id: "owner", memberships: [m("technology", "MEMBER")] };
  assert.equal(canAccessLead(moved, lead()), false);
  assert.equal(canManageLead(moved, lead()), false);
});

test("only the owner or Sales head can manage; a former owner who created it is read-only", () => {
  const l = lead("NEW", "newOwner", "owner");
  assert.equal(canAccessLead(owner, l), true);
  assert.equal(canManageLead(owner, l), false);
  assert.equal(canManageLead(head, l), true);
  assert.equal(canManageLead(intern, lead()), false);
});

test("visibleLeadWhere mirrors canAccessLead", () => {
  assert.deepEqual(visibleLeadWhere(head), {});
  assert.deepEqual(visibleLeadWhere(owner), { OR: [{ ownerId: "owner" }, { createdById: "owner" }] });
  assert.deepEqual(visibleLeadWhere(techHead), { id: { in: [] } });
});

// ---- Pipeline ---------------------------------------------------------------------------------

test("owner can move a lead forward one defined step", () => {
  const d = decideStage(owner, lead("NEW"), "CONTACTED");
  assert.deepEqual(d, { ok: true, to: "CONTACTED", reason: null, closes: false, reopens: false });
  assert.equal(decideStage(owner, lead("CONTACTED"), "QUALIFIED").ok, true);
  assert.equal(decideStage(owner, lead("QUALIFIED"), "PROPOSAL").ok, true);
  const won = decideStage(owner, lead("PROPOSAL"), "WON");
  assert.equal(won.ok && won.closes, true);
});

test("stages cannot be skipped", () => {
  for (const [from, to] of [["NEW", "QUALIFIED"], ["NEW", "WON"], ["CONTACTED", "PROPOSAL"], ["QUALIFIED", "WON"]]) {
    const d = decideStage(owner, lead(from), to);
    assert.equal(!d.ok && d.code, "INVALID_TRANSITION", `${from}->${to}`);
  }
});

test("a proposal can fall back to qualified", () => {
  assert.equal(decideStage(owner, lead("PROPOSAL"), "QUALIFIED").ok, true);
});

test("losing a lead requires a reason, from any open stage", () => {
  for (const s of ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL"]) {
    assert.equal((decideStage(owner, lead(s), "LOST") as { code: string }).code, "REASON_REQUIRED", s);
    assert.equal((decideStage(owner, lead(s), "LOST", "   ") as { code: string }).code, "REASON_REQUIRED", s);
    const ok = decideStage(owner, lead(s), "LOST", " Budget cut ");
    assert.deepEqual(ok, { ok: true, to: "LOST", reason: "Budget cut", closes: true, reopens: false });
  }
});

test("won is final: nothing can move a won lead", () => {
  for (const to of LEAD_STAGES) {
    const d = decideStage(head, lead("WON"), to, "x");
    assert.equal(d.ok, false, to);
  }
  assert.deepEqual(allowedNextStages(head, lead("WON")), []);
});

test("only the Sales head can reopen a lost lead", () => {
  const d = decideStage(owner, lead("LOST"), "NEW");
  assert.equal(!d.ok && d.code, "FORBIDDEN");
  const h = decideStage(head, lead("LOST"), "NEW");
  assert.deepEqual(h, { ok: true, to: "NEW", reason: null, closes: false, reopens: true });
  assert.deepEqual(allowedNextStages(owner, lead("LOST")), []);
  assert.deepEqual(allowedNextStages(head, lead("LOST")), ["NEW"]);
});

test("non-owners and outsiders cannot change stage", () => {
  assert.equal((decideStage(intern, lead("NEW"), "CONTACTED") as { code: string }).code, "FORBIDDEN");
  assert.equal((decideStage(techHead, lead("NEW"), "CONTACTED") as { code: string }).code, "FORBIDDEN");
});

test("repeating a stage change is reported as already done; bad stages rejected", () => {
  assert.equal((decideStage(owner, lead("CONTACTED"), "CONTACTED") as { code: string }).code, "ALREADY_DONE");
  for (const bad of ["", "toString", "__proto__", "won", "ARCHIVED"]) {
    assert.equal((decideStage(owner, lead("NEW"), bad) as { code: string }).code, "INVALID_STAGE", bad);
  }
});

test("unknown current stage cannot be exploited via prototype keys", () => {
  assert.equal(decideStage(owner, lead("constructor"), "NEW").ok, false);
  assert.deepEqual(allowedNextStages(owner, lead("toString")), []);
});

// ---- Follow-ups -------------------------------------------------------------------------------

test("follow-up state is derived from the date and stage", () => {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  assert.equal(followUpState({ stage: "NEW", nextFollowUpAt: null }, "2026-11-10"), "none");
  assert.equal(followUpState({ stage: "NEW", nextFollowUpAt: d("2026-11-09") }, "2026-11-10"), "overdue");
  assert.equal(followUpState({ stage: "CONTACTED", nextFollowUpAt: d("2026-11-10") }, "2026-11-10"), "today");
  assert.equal(followUpState({ stage: "PROPOSAL", nextFollowUpAt: d("2026-11-11") }, "2026-11-10"), "upcoming");
  assert.equal(followUpState({ stage: "WON", nextFollowUpAt: d("2026-11-01") }, "2026-11-10"), "closed");
  assert.equal(followUpState({ stage: "LOST", nextFollowUpAt: null }, "2026-11-10"), "closed");
  assert.equal(isOpenStage("QUALIFIED"), true);
  assert.equal(isOpenStage("WON"), false);
});

// ---- Validation -------------------------------------------------------------------------------

test("email validation", () => {
  assert.equal(validEmail("a@b.co"), true);
  assert.equal(validEmail("first.last+tag@school.edu.in"), true);
  for (const bad of ["", "a", "a@b", "a@b.c", "a b@c.com", "<x>@c.com", "a@@c.com", "a@c.com, b@c.com"]) assert.equal(validEmail(bad), false, bad);
});

test("phone validation", () => {
  for (const ok of ["+91 98765 43210", "(022) 2345-6789", "9876543210"]) assert.equal(validPhone(ok), true, ok);
  for (const bad of ["", "12345", "abc1234567", "+1234567890123456", "98765 <script>", "1".repeat(30)]) assert.equal(validPhone(bad), false, bad);
});

test("interaction time cannot be in the future", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  assert.equal(validOccurredAt(new Date("2026-11-10T09:00:00Z"), now), true);
  assert.equal(validOccurredAt(new Date("2026-11-10T10:03:00Z"), now), true);
  assert.equal(validOccurredAt(new Date("2026-11-11T10:00:00Z"), now), false);
  assert.equal(validOccurredAt(new Date("nope"), now), false);
});
