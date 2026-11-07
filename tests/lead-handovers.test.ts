import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HANDOVER_STAGES, SALES_SLUG, buildLeadHandoverContext, canHandOverLead, handoverSentNote, handoverTimelineNote,
} from "../lib/leads";
import { canAccessHandover, visibleHandoverWhere } from "../lib/handovers";

const sales = (type = "MEMBER") => ({ departmentId: "d-sales", type, department: { slug: SALES_SLUG } });
const tech = (type = "MEMBER") => ({ departmentId: "d-tech", type, department: { slug: "technology" } });
const owner = { id: "o", memberships: [sales()] };
const head = { id: "h", memberships: [sales("HEAD")] };
const other = { id: "x", memberships: [sales()] };
const techHead = { id: "t", memberships: [tech("HEAD")] };
const lead = (stage: string) => ({ ownerId: "o", createdById: "c", stage });

test("owner and Sales head may hand over a lead at QUALIFIED, PROPOSAL, WON", () => {
  for (const stage of HANDOVER_STAGES) {
    assert.equal(canHandOverLead(owner, lead(stage)), true, stage);
    assert.equal(canHandOverLead(head, lead(stage)), true, stage);
  }
});

test("too-early and closed stages cannot be handed over", () => {
  for (const stage of ["NEW", "CONTACTED", "LOST", "constructor", ""]) {
    assert.equal(canHandOverLead(owner, lead(stage)), false, stage);
    assert.equal(canHandOverLead(head, lead(stage)), false, stage);
  }
});

test("other Sales members, creators who no longer own it, Tech head and ex-Sales owner cannot hand over", () => {
  assert.equal(canHandOverLead(other, lead("WON")), false);
  assert.equal(canHandOverLead({ id: "c", memberships: [sales()] }, lead("WON")), false);
  assert.equal(canHandOverLead(techHead, lead("WON")), false);
  assert.equal(canHandOverLead({ id: "o", memberships: [tech()] }, lead("WON")), false);
});

test("receiver and receiving head can open the handover but that grants nothing on the lead", () => {
  const h = { senderId: "o", receiverId: "r", fromDepartmentId: "d-sales", toDepartmentId: "d-tech" };
  assert.equal(canAccessHandover({ id: "r", memberships: [{ departmentId: "d-tech", type: "MEMBER" }] }, h), true);
  assert.equal(canAccessHandover({ id: "t", memberships: [{ departmentId: "d-tech", type: "HEAD" }] }, h), true);
  assert.equal(canAccessHandover({ id: "z", memberships: [{ departmentId: "d-tech", type: "MEMBER" }] }, h), false);
  assert.deepEqual(visibleHandoverWhere({ id: "z", memberships: [] }).OR?.length, 2);
  // lead-side rules stay separate: the receiver is not Sales, so the lead is closed to them
  assert.equal(canHandOverLead({ id: "r", memberships: [tech()] }, lead("WON")), false);
});

test("context snapshot carries the source facts and omits missing contact fields", () => {
  const full = buildLeadHandoverContext({
    organizationName: "Acme Traders", contactName: "Rita", contactEmail: "r@acme.in", contactPhone: "+91 98765 43210",
    source: "Referral", stage: "WON",
  });
  for (const part of ["Acme Traders", "Rita", "r@acme.in", "+91 98765 43210", "Referral", "Won"]) assert.ok(full.includes(part), part);
  const min = buildLeadHandoverContext({
    organizationName: "Acme", contactName: "Rita", contactEmail: null, contactPhone: null, source: "Event", stage: "PROPOSAL",
  });
  assert.ok(!min.includes("Email:") && !min.includes("Phone:"));
  assert.ok(min.includes("Proposal sent"));
});

test("timeline notes: known events only, text quoted, long text capped", () => {
  assert.match(handoverTimelineNote("accepted", "Site", "Dev")!, /Dev accepted it/);
  assert.match(handoverTimelineNote("rejected", "Site", "Dev", " no budget ")!, /rejected it\. “no budget”/);
  assert.equal(handoverTimelineNote("created", "Site", "Dev"), null);
  assert.equal(handoverTimelineNote("toString", "Site", "Dev"), null);
  assert.equal(handoverTimelineNote("__proto__", "Site", "Dev"), null);
  assert.ok(handoverTimelineNote("completed", "Site", "Dev", "x".repeat(5000))!.length <= 2000);
});

test("sent note names title, receiver and department", () => {
  assert.equal(handoverSentNote("Site", "Dev", "Technology"), 'Delivery handover "Site" sent to Dev (Technology).');
});
