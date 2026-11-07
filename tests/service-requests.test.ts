import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assigneeEligible, availableServiceActions, canAssign, canViewService, categoryDepartmentSlug, decideService, priorityLabel, serviceStatusLabel,
  serviceViews, serviceWhere, validateService,
} from "../lib/service-requests";

const m = (slug: string, type = "MEMBER", id = `d-${slug}`) => ({ departmentId: id, type, department: { slug } });
const req = { id: "r", memberships: [m("sales-and-marketing")] };
const techHead = { id: "th", memberships: [m("technology", "HEAD")] };
const techMember = { id: "tm", memberships: [m("technology")] };
const opsHead = { id: "oh", memberships: [m("operations", "HEAD")] };
const mgmt = { id: "mg", memberships: [m("management", "HEAD")] };
const s = (status: string, over: Record<string, string | null> = {}) => ({ requesterId: "r", departmentId: "d-technology", assigneeId: null as string | null, status, ...over });

test("input validation and category routing", () => {
  const good = { title: "Laptop will not boot", description: "Black screen since morning", category: "IT support", priority: "HIGH" };
  const r = validateService(good);
  assert.equal(r.ok && r.departmentSlug, "technology");
  assert.equal(validateService({ ...good, category: "Facilities" }).ok && (validateService({ ...good, category: "Facilities" }) as { departmentSlug: string }).departmentSlug, "operations");
  for (const patch of [{ title: "ab" }, { title: "x".repeat(121) }, { title: "bad\u202etitle" }, { description: "  " }, { description: "x".repeat(2001) }, { category: "Cafeteria" }, { category: "constructor" }, { category: "__proto__" }, { priority: "URGENT" }, { priority: "toString" }]) {
    assert.equal(validateService({ ...good, ...patch }).ok, false, JSON.stringify(patch));
  }
  assert.equal(categoryDepartmentSlug("hasOwnProperty"), null);
  assert.equal(priorityLabel("toString"), "toString");
  assert.equal(serviceStatusLabel("constructor"), "constructor");
});

test("visibility: requester, handling heads, assignee; nobody else", () => {
  assert.equal(canViewService(req, s("OPEN")), true);
  assert.equal(canViewService(techHead, s("OPEN")), true);
  assert.equal(canViewService(techMember, s("OPEN")), false, "plain team membership grants nothing");
  assert.equal(canViewService(techMember, s("OPEN", { assigneeId: "tm" })), true, "the assignee can read it");
  assert.equal(canViewService(opsHead, s("OPEN")), false, "another team's head sees nothing");
  assert.equal(canViewService(mgmt, s("OPEN")), false, "Management head as such sees nothing");
  assert.equal(canViewService({ id: "z", memberships: [] }, s("OPEN")), false);
  assert.equal(canViewService({ id: "r", memberships: [m("technology", "HEAD")] }, s("OPEN")), true, "requester sees own even if a handling head");
});

test("a head cannot handle their own request", () => {
  const own = { id: "th", memberships: [m("technology", "HEAD")] };
  const r = s("OPEN", { requesterId: "th" });
  assert.equal(canAssign(own, r), false);
  assert.equal(decideService(own, r, "decline", "no").ok, false);
  assert.equal(decideService(own, r, "cancel", null).ok, true, "but they may cancel it as the requester");
});

test("assignment: handling head only, while open or in progress, active team member who is not the requester", () => {
  assert.equal(canAssign(techHead, s("OPEN")), true);
  assert.equal(canAssign(techHead, s("IN_PROGRESS", { assigneeId: "tm" })), true, "reassignment allowed");
  for (const st of ["RESOLVED", "CLOSED", "DECLINED", "CANCELLED"]) assert.equal(canAssign(techHead, s(st)), false, st);
  assert.equal(canAssign(techMember, s("OPEN", { assigneeId: "tm" })), false, "assignee cannot reassign");
  assert.equal(canAssign(opsHead, s("OPEN")), false);
  assert.equal(canAssign(req, s("OPEN")), false);
  const ok = { id: "tm", active: true, departmentIds: ["d-technology"] };
  assert.equal(assigneeEligible(ok, s("OPEN")), true);
  assert.equal(assigneeEligible({ ...ok, active: false }, s("OPEN")), false, "inactive");
  assert.equal(assigneeEligible({ ...ok, departmentIds: ["d-sales"] }, s("OPEN")), false, "not in the handling team");
  assert.equal(assigneeEligible({ ...ok, id: "r" }, s("OPEN")), false, "the requester cannot be the assignee");
  assert.equal(assigneeEligible(null, s("OPEN")), false);
});

test("start: handler only, needs an assignee, only from open", () => {
  const needs = decideService(techHead, s("OPEN"), "start", null);
  assert.equal(needs.ok === false && needs.code, "NEEDS_ASSIGNEE");
  assert.equal(decideService(techHead, s("OPEN", { assigneeId: "tm" }), "start", null).ok, true);
  assert.equal(decideService(techMember, s("OPEN", { assigneeId: "tm" }), "start", null).ok, true, "the assignee may start");
  assert.equal(decideService(req, s("OPEN", { assigneeId: "tm" }), "start", null).ok, false);
  assert.equal(decideService(opsHead, s("OPEN", { assigneeId: "tm" }), "start", null).ok, false);
  const again = decideService(techHead, s("IN_PROGRESS", { assigneeId: "tm" }), "start", null);
  assert.equal(again.ok === false && again.code, "ALREADY_DONE");
});

test("resolve: handler only, needs a note, only while in progress", () => {
  const prog = s("IN_PROGRESS", { assigneeId: "tm" });
  assert.equal(decideService(techMember, prog, "resolve", "Replaced the SSD").ok, true);
  const noNote = decideService(techMember, prog, "resolve", "  ");
  assert.equal(noNote.ok === false && noNote.code, "NOTE_REQUIRED");
  assert.equal(decideService(req, prog, "resolve", "done").ok, false, "requester cannot resolve their own");
  const early = decideService(techHead, s("OPEN", { assigneeId: "tm" }), "resolve", "done");
  assert.equal(early.ok === false && early.code, "INVALID_STATE");
  assert.equal(decideService(techMember, prog, "resolve", "x".repeat(1001)).ok, false);
});

test("close and reopen: requester only, only after resolution; reopen needs a reason", () => {
  const res = s("RESOLVED", { assigneeId: "tm" });
  assert.equal(decideService(req, res, "close", null).ok, true);
  assert.equal(decideService(techMember, res, "close", null).ok, false, "the handler cannot close on the requester's behalf");
  assert.equal(decideService(techHead, res, "close", null).ok, false);
  const reo = decideService(req, res, "reopen", " ");
  assert.equal(reo.ok === false && reo.code, "NOTE_REQUIRED");
  assert.equal(decideService(req, res, "reopen", "Still black screen").ok, true);
  assert.equal(decideService(req, s("IN_PROGRESS", { assigneeId: "tm" }), "close", null).ok, false, "cannot close before it is resolved");
  assert.equal(decideService(req, s("CLOSED"), "reopen", "again").ok, false, "closed is final");
});

test("decline and cancel", () => {
  assert.equal(decideService(techHead, s("OPEN"), "decline", "Out of scope").ok, true);
  const noReason = decideService(techHead, s("OPEN"), "decline", "");
  assert.equal(noReason.ok === false && noReason.code, "NOTE_REQUIRED");
  assert.equal(decideService(techMember, s("OPEN", { assigneeId: "tm" }), "decline", "no").ok, false, "only a head may decline");
  assert.equal(decideService(techHead, s("IN_PROGRESS", { assigneeId: "tm" }), "decline", "no").ok, false, "cannot decline work already started");
  assert.equal(decideService(req, s("OPEN"), "cancel", null).ok, true);
  assert.equal(decideService(req, s("IN_PROGRESS", { assigneeId: "tm" }), "cancel", null).ok, false, "cannot cancel once work started");
  assert.equal(decideService(techHead, s("OPEN"), "cancel", null).ok, false);
  for (const bad of ["constructor", "__proto__", "toString", "assign", ""]) assert.equal(decideService(req, s("OPEN"), bad, null).ok, false, bad);
});

test("available actions per role and state", () => {
  assert.deepEqual(availableServiceActions(techHead, s("OPEN")), ["decline"]);
  assert.deepEqual(availableServiceActions(techHead, s("OPEN", { assigneeId: "tm" })), ["start", "decline"]);
  assert.deepEqual(availableServiceActions(techMember, s("IN_PROGRESS", { assigneeId: "tm" })), ["resolve"]);
  assert.deepEqual(availableServiceActions(req, s("OPEN")), ["cancel"]);
  assert.deepEqual(availableServiceActions(req, s("RESOLVED")), ["reopen", "close"]);
  assert.deepEqual(availableServiceActions(req, s("CLOSED")), []);
});

test("views and query scope", () => {
  assert.deepEqual(serviceViews(req).map((v) => v[0]), ["mine", "assigned"]);
  assert.deepEqual(serviceViews(techHead).map((v) => v[0]), ["mine", "assigned", "queue"]);
  assert.deepEqual(serviceWhere(req, "queue"), { requesterId: "r" }, "a plain user asking for 'queue' still gets only their own");
  assert.deepEqual(serviceWhere(techMember, "queue"), { requesterId: "tm" });
  assert.deepEqual(serviceWhere(techHead, "queue"), { departmentId: { in: ["d-technology"] }, requesterId: { not: "th" }, status: { in: ["OPEN", "IN_PROGRESS"] } });
  assert.deepEqual(serviceWhere(techMember, "assigned"), { assigneeId: "tm", requesterId: { not: "tm" }, status: { in: ["OPEN", "IN_PROGRESS"] } });
});
