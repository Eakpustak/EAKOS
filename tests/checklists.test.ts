import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TEMPLATES, buildItems, canManageCases, canOwnItem, canViewCase, caseProgress, caseTypeLabel, decideCase, decideItem,
  checklistSummary, itemOverdue, openKeyFor, resolveOwner, validateCaseInput, validateItemInput, visibleCaseWhere, visibleItems,
} from "../lib/checklists";

const m = (slug: string, type = "MEMBER") => ({ departmentId: `d-${slug}`, type, department: { slug } });
const hr = { id: "hr", memberships: [m("human-resources", "HEAD")] };
const hrMember = { id: "hm", memberships: [m("human-resources")] };
const admin = { id: "ad", memberships: [m("management", "HEAD")] };
const owner = { id: "o1", memberships: [m("technology", "HEAD")] };
const other = { id: "o2", memberships: [m("operations")] };
const subject = { id: "s", memberships: [m("sales-and-marketing")] };
const items = [{ ownerId: "o1" }, { ownerId: "o2" }, { ownerId: "hr" }];

test("only the HR head manages checklists; HR members, management and others do not", () => {
  assert.equal(canManageCases(hr), true);
  assert.equal(canManageCases(hrMember), false);
  assert.equal(canManageCases(admin), false);
  assert.equal(canManageCases({ id: "x", memberships: [] }), false);
  assert.equal(canManageCases({ id: "x", memberships: [{ departmentId: "d", type: "HEAD", department: null }] }), false);
});

test("who may open a case: HR head and item owners; never the subject, never outsiders", () => {
  assert.equal(canViewCase(hr, "s", items), true);
  assert.equal(canViewCase(owner, "s", items), true);
  assert.equal(canViewCase(hrMember, "s", items), false);
  assert.equal(canViewCase(subject, "s", items), false);
  assert.equal(canViewCase({ ...hr, id: "s" }, "s", items), false, "even an HR head cannot open the case about themselves");
  assert.equal(canViewCase({ id: "s", memberships: [] }, "s", [{ ownerId: "s" }]), false, "owning an item does not let the subject in");
  assert.equal(canViewCase({ id: "z", memberships: [] }, "s", items), false);
});

test("an item owner sees only their own items; HR head sees all", () => {
  assert.deepEqual(visibleItems(owner, items), [{ ownerId: "o1" }]);
  assert.equal(visibleItems(hr, items).length, 3);
  assert.deepEqual(visibleItems(subject, items), []);
});

test("Prisma filter mirrors the policy", () => {
  assert.deepEqual(visibleCaseWhere(hr), { subjectId: { not: "hr" } });
  assert.deepEqual(visibleCaseWhere(owner), { subjectId: { not: "o1" }, items: { some: { ownerId: "o1" } } });
});

test("owner is never the subject", () => {
  assert.equal(canOwnItem("a", "s"), true);
  assert.equal(canOwnItem("s", "s"), false);
});

test("default owners: role heads, never the subject, HR head as fallback so nothing is unowned", () => {
  const c = { managerHeadIds: ["s", "m2", "m1"], technologyHeadIds: ["t1"], operationsHeadIds: [], creatorId: "hr", subjectId: "s" };
  assert.equal(resolveOwner("MANAGER", c), "m1", "sorted, subject excluded");
  assert.equal(resolveOwner("TECHNOLOGY", c), "t1");
  assert.equal(resolveOwner("OPERATIONS", c), "hr", "no operations head: falls back to the creator");
  assert.equal(resolveOwner("HR", c), "hr");
  assert.equal(resolveOwner("MANAGER", { ...c, managerHeadIds: ["s"] }), "hr", "subject is the only head");
  const built = buildItems("ONBOARDING", c);
  assert.equal(built.length, TEMPLATES.ONBOARDING.length);
  assert.ok(built.every((b) => b.ownerId && b.ownerId !== "s"));
  assert.deepEqual(built.map((b) => b.position), built.map((_, i) => i));
});

test("case input: type and date window", () => {
  const today = "2026-11-15";
  assert.equal(validateCaseInput("ONBOARDING", "2026-12-01", today), null);
  assert.equal(validateCaseInput("OFFBOARDING", "2026-10-20", today), null);
  assert.notEqual(validateCaseInput("TRANSFER", "2026-12-01", today), null);
  assert.notEqual(validateCaseInput("toString", "2026-12-01", today), null);
  assert.notEqual(validateCaseInput("ONBOARDING", "", today), null);
  assert.notEqual(validateCaseInput("ONBOARDING", "2026-02-30", today), null);
  assert.notEqual(validateCaseInput("ONBOARDING", "2026-10-01", today), null, "more than 30 days back");
  assert.notEqual(validateCaseInput("ONBOARDING", "2027-12-01", today), null, "more than a year ahead");
});

test("item input", () => {
  assert.equal(validateItemInput("Order a chair", ""), null);
  assert.equal(validateItemInput("Order a chair", "2026-12-01"), null);
  assert.notEqual(validateItemInput("  ", ""), null);
  assert.notEqual(validateItemInput("x".repeat(201), ""), null);
  assert.notEqual(validateItemInput("ok", "2026-13-01"), null);
});

test("marking done: owner or HR head; reopen: HR head only; closed cases are frozen", () => {
  const open = { status: "OPEN" };
  const it = { ownerId: "o1", status: "OPEN" };
  assert.equal(decideItem(owner, open, it, "done").ok, true);
  assert.equal(decideItem(hr, open, it, "done").ok, true);
  assert.equal(decideItem(other, open, it, "done").ok, false, "someone else's item");
  assert.equal(decideItem(hrMember, open, it, "done").ok, false);
  assert.equal(decideItem(subject, open, it, "done").ok, false);
  const done = { ownerId: "o1", status: "DONE" };
  assert.equal(decideItem(owner, open, done, "reopen").ok, false, "owner cannot reopen");
  assert.equal(decideItem(hr, open, done, "reopen").ok, true);
  const r = decideItem(owner, open, done, "done");
  assert.equal(r.ok === false && r.code, "ALREADY_DONE");
  const closed = decideItem(hr, { status: "COMPLETED" }, it, "done");
  assert.equal(closed.ok === false && closed.code, "INVALID_STATE");
  assert.equal(decideItem(hr, open, it, "toString").ok, false);
  assert.equal(decideItem(hr, open, it, "__proto__").ok, false);
});

test("closing: HR head only; complete needs every item done; cancel needs a reason; no double close", () => {
  const open = { status: "OPEN" };
  assert.equal(decideCase(hr, open, "complete", 0, null).ok, true);
  const inc = decideCase(hr, open, "complete", 2, null);
  assert.equal(inc.ok === false && inc.code, "INCOMPLETE");
  assert.equal(decideCase(owner, open, "complete", 0, null).ok, false);
  assert.equal(decideCase(hrMember, open, "cancel", 0, "x").ok, false);
  const nr = decideCase(hr, open, "cancel", 3, "  ");
  assert.equal(nr.ok === false && nr.code, "NOTE_REQUIRED");
  assert.equal(decideCase(hr, open, "cancel", 3, "Offer withdrawn").ok, true, "cancel works with open items");
  const again = decideCase(hr, { status: "COMPLETED" }, "complete", 0, null);
  assert.equal(again.ok === false && again.code, "ALREADY_DONE");
  const wrong = decideCase(hr, { status: "COMPLETED" }, "cancel", 0, "late");
  assert.equal(wrong.ok === false && wrong.code, "INVALID_STATE", "a completed case cannot be cancelled");
  assert.equal(decideCase(hr, open, "constructor", 0, "x").ok, false);
  assert.equal(decideCase(hr, open, "cancel", 0, "y".repeat(1001)).ok, false);
});

test("progress, overdue and keys", () => {
  assert.deepEqual(caseProgress([]), { done: 0, total: 0, pct: 0 });
  assert.deepEqual(caseProgress([{ status: "DONE" }, { status: "OPEN" }, { status: "DONE" }]), { done: 2, total: 3, pct: 67 });
  const due = new Date("2026-11-10T00:00:00Z");
  assert.equal(itemOverdue({ status: "OPEN", dueAt: due }, "2026-11-11"), true);
  assert.equal(itemOverdue({ status: "OPEN", dueAt: due }, "2026-11-10"), false, "due today is not overdue");
  assert.equal(itemOverdue({ status: "DONE", dueAt: due }, "2026-11-11"), false);
  assert.equal(itemOverdue({ status: "OPEN", dueAt: null }, "2026-11-11"), false);
  assert.equal(openKeyFor("u1", "ONBOARDING"), "u1:ONBOARDING");
  assert.equal(caseTypeLabel("toString"), "toString", "prototype keys are not labels");
});

test("HR dashboard summary counts open steps and overdue steps per case", () => {
  const d = (x: string) => new Date(`${x}T00:00:00Z`);
  assert.deepEqual(checklistSummary([], "2026-11-11"), { openCases: 0, openSteps: 0, overdueSteps: 0, casesWithOverdue: 0, onboarding: 0, offboarding: 0 });
  const r = checklistSummary([
    { type: "ONBOARDING", items: [{ status: "OPEN", dueAt: d("2026-11-10") }, { status: "OPEN", dueAt: d("2026-11-10") }, { status: "DONE", dueAt: d("2026-11-01") }] },
    { type: "OFFBOARDING", items: [{ status: "OPEN", dueAt: d("2026-11-11") }, { status: "OPEN", dueAt: null }] },
    { type: "OFFBOARDING", items: [{ status: "DONE", dueAt: d("2026-11-01") }] },
  ], "2026-11-11");
  assert.deepEqual(r, { openCases: 3, openSteps: 4, overdueSteps: 2, casesWithOverdue: 1, onboarding: 1, offboarding: 2 });
});
