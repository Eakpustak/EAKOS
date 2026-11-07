import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availableLeaveActions, canViewLeave, chooseApproverDepartment, decideLeave, isLeaveType, leaveDays,
  leaveStatusLabel, overlaps, validateLeaveDates, visibleLeaveWhere,
} from "../lib/leave";

const m = (dep: string, slug: string, type = "MEMBER") => ({ departmentId: dep, type, department: { slug } });
const emp = { id: "e", memberships: [m("tech", "technology")] };
const techHead = { id: "th", memberships: [m("tech", "technology", "HEAD")] };
const salesHead = { id: "sh", memberships: [m("sales", "sales-and-marketing", "HEAD")] };
const hrHead = { id: "hr", memberships: [m("hr", "human-resources", "HEAD")] };
const colleague = { id: "c", memberships: [m("tech", "technology")] };
const L = (status = "PENDING", extra = {}) => ({ requesterId: "e", approverDepartmentId: "tech", status, startDate: new Date("2026-12-01T00:00:00Z"), ...extra });
const TODAY = "2026-11-07";

test("dates: valid, order, backdate, length, format", () => {
  assert.equal(validateLeaveDates("2026-11-10", "2026-11-12", TODAY), null);
  assert.equal(validateLeaveDates("2026-11-12", "2026-11-10", TODAY) !== null, true);
  assert.equal(validateLeaveDates("2026-10-01", "2026-10-02", TODAY) !== null, true, "too far back");
  assert.equal(validateLeaveDates("2026-10-30", "2026-10-31", TODAY), null, "recent past ok");
  assert.equal(validateLeaveDates("2026-11-10", "2027-03-10", TODAY) !== null, true, "over 60 days");
  assert.equal(validateLeaveDates("2026-02-30", "2026-03-01", TODAY) !== null, true, "impossible date");
  assert.equal(validateLeaveDates("", "", TODAY) !== null, true);
  assert.equal(leaveDays(new Date("2026-11-10T00:00:00Z"), new Date("2026-11-10T00:00:00Z")), 1);
  assert.equal(leaveDays(new Date("2026-11-10T00:00:00Z"), new Date("2026-11-12T00:00:00Z")), 3);
});

test("overlap is inclusive on both ends", () => {
  const d = (a: string, b: string) => ({ startDate: new Date(a), endDate: new Date(b) });
  assert.equal(overlaps(d("2026-11-10", "2026-11-12"), d("2026-11-12", "2026-11-14")), true);
  assert.equal(overlaps(d("2026-11-10", "2026-11-12"), d("2026-11-13", "2026-11-14")), false);
});

test("approver department: own head, else Management, else nobody; never the requester", () => {
  assert.equal(chooseApproverDepartment("e", ["tech"], { tech: ["th"] }, "mgmt"), "tech");
  assert.equal(chooseApproverDepartment("th", ["tech"], { tech: ["th"], mgmt: ["boss"] }, "mgmt"), "mgmt", "a head asks Management");
  assert.equal(chooseApproverDepartment("e", ["tech"], { tech: [], mgmt: ["boss"] }, "mgmt"), "mgmt", "no head in own dept");
  assert.equal(chooseApproverDepartment("boss", ["mgmt"], { mgmt: ["boss"] }, "mgmt"), null, "only head of Management cannot approve self");
  assert.equal(chooseApproverDepartment("e", ["tech"], {}, null), null);
  assert.equal(chooseApproverDepartment("e", ["tech", "ops"], { tech: [], ops: ["oh"] }, "mgmt"), "ops", "second department");
});

test("who can view: requester, approving head, HR head; not colleagues, other heads, or admins by role", () => {
  assert.equal(canViewLeave(emp, L()), true);
  assert.equal(canViewLeave(techHead, L()), true);
  assert.equal(canViewLeave(hrHead, L()), true);
  assert.equal(canViewLeave(colleague, L()), false);
  assert.equal(canViewLeave(salesHead, L()), false);
  assert.equal(canViewLeave({ id: "adm", memberships: [] }, L()), false);
  // a head viewing their OWN request sees it as requester, not as approver
  assert.equal(canViewLeave(techHead, L("PENDING", { requesterId: "th" })), true);
  assert.equal(visibleLeaveWhere(emp).OR!.length, 1);
  assert.equal(visibleLeaveWhere(techHead).OR!.length, 2);
  assert.equal(visibleLeaveWhere(hrHead).OR!.length, 3);
});

test("approve / reject: approver only, pending only, never self, reject needs a reason", () => {
  assert.equal(decideLeave(techHead, L(), "approve", null, TODAY).ok, true);
  const rej = decideLeave(techHead, L(), "reject", "  ", TODAY);
  assert.equal(!rej.ok && rej.code, "NOTE_REQUIRED");
  assert.equal(decideLeave(techHead, L(), "reject", "busy week", TODAY).ok, true);
  for (const u of [emp, colleague, salesHead, hrHead]) {
    const r = decideLeave(u, L(), "approve", null, TODAY);
    assert.equal(!r.ok && r.code, "FORBIDDEN", u.id);
  }
  const self = decideLeave(techHead, L("PENDING", { requesterId: "th" }), "approve", null, TODAY);
  assert.equal(!self.ok && self.code, "FORBIDDEN", "a head cannot approve their own leave");
  const again = decideLeave(techHead, L("APPROVED"), "approve", null, TODAY);
  assert.equal(!again.ok && again.code, "ALREADY_DONE");
  const flip = decideLeave(techHead, L("REJECTED"), "approve", null, TODAY);
  assert.equal(!flip.ok && flip.code, "INVALID_STATE", "a decision is final");
  assert.equal(decideLeave(techHead, L(), "toString", null, TODAY).ok, false);
});

test("cancel: requester only; approved leave only before it starts", () => {
  assert.equal(decideLeave(emp, L(), "cancel", null, TODAY).ok, true);
  assert.equal(decideLeave(emp, L("APPROVED"), "cancel", null, TODAY).ok, true);
  const started = decideLeave(emp, L("APPROVED", { startDate: new Date("2026-11-07T00:00:00Z") }), "cancel", null, TODAY);
  assert.equal(!started.ok && started.code, "STARTED");
  assert.equal(decideLeave(techHead, L(), "cancel", null, TODAY).ok, false, "approver cannot cancel for the requester");
  assert.equal(decideLeave(emp, L("REJECTED"), "cancel", null, TODAY).ok, false);
  assert.equal(decideLeave(emp, L("CANCELLED"), "cancel", null, TODAY).ok, false);
});

test("available actions drive the forms", () => {
  assert.deepEqual(availableLeaveActions(techHead, L(), TODAY), ["approve", "reject"]);
  assert.deepEqual(availableLeaveActions(emp, L(), TODAY), ["cancel"]);
  assert.deepEqual(availableLeaveActions(colleague, L(), TODAY), []);
  assert.deepEqual(availableLeaveActions(hrHead, L(), TODAY), [], "HR head is read-only");
});

test("types and labels", () => {
  assert.equal(isLeaveType("Sick"), true);
  assert.equal(isLeaveType("constructor"), false);
  assert.equal(isLeaveType(""), false);
  assert.equal(leaveStatusLabel("PENDING"), "Awaiting decision");
  assert.equal(leaveStatusLabel("toString"), "toString");
});
