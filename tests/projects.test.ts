import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessProject, canCreateFromHandover, canManageProject, decideProjectStatus, isProjectOpen, milestoneOverdue,
  milestoneProgress, nextProjectStatuses, projectStatusLabel, visibleProjectWhere,
} from "../lib/projects";

const mem = (dep: string, type = "MEMBER") => ({ departmentId: dep, type });
const owner = { id: "o", memberships: [mem("tech")] };
const member = { id: "m", memberships: [mem("tech")] };
const creator = { id: "c", memberships: [mem("tech")] };
const stranger = { id: "s", memberships: [mem("tech")] };
const techHead = { id: "th", memberships: [mem("tech", "HEAD")] };
const salesHead = { id: "sh", memberships: [mem("sales", "HEAD")] };
const p = (status = "ACTIVE") => ({ ownerId: "o", createdById: "c", departmentId: "tech", status, members: [{ userId: "m" }] });

test("owner, member, creator and department head can read; a plain department colleague cannot (RULES 2.7)", () => {
  for (const u of [owner, member, creator, techHead]) assert.equal(canAccessProject(u, p()), true, u.id);
  assert.equal(canAccessProject(stranger, p()), false);
  assert.equal(canAccessProject(salesHead, p()), false, "another department's head");
  assert.equal(canAccessProject({ id: "m", memberships: [] }, { ...p(), members: [] }), false);
});

test("only owner and department head manage; members and creators do not", () => {
  assert.equal(canManageProject(owner, p()), true);
  assert.equal(canManageProject(techHead, p()), true);
  for (const u of [member, creator, stranger, salesHead]) assert.equal(canManageProject(u, p()), false, u.id);
});

test("visibleProjectWhere mirrors the access rule", () => {
  const w = visibleProjectWhere(techHead).OR!;
  assert.equal(w.length, 4);
  assert.equal(visibleProjectWhere(stranger).OR!.length, 3);
});

test("project from a handover: receiver only, ACCEPTED only, once", () => {
  const h = { receiverId: "o", status: "ACCEPTED" };
  assert.equal(canCreateFromHandover(owner, h, false).ok, true);
  assert.equal(canCreateFromHandover(owner, h, true).ok, false);
  assert.equal(canCreateFromHandover(owner, { ...h, status: "PENDING" }, false).ok, false);
  for (const s of ["REJECTED", "CANCELLED", "COMPLETED", "CLARIFICATION_REQUESTED"]) assert.equal(canCreateFromHandover(owner, { ...h, status: s }, false).ok, false, s);
  assert.equal(canCreateFromHandover({ id: "sender" }, h, false).ok, false, "sender cannot start the receiver's project");
  assert.equal(canCreateFromHandover(techHead, h, false).ok, false, "even the head, unless named receiver");
});

test("status machine: legal moves, final states, and completion blocked by open milestones", () => {
  assert.deepEqual(nextProjectStatuses("ACTIVE"), ["ON_HOLD", "COMPLETED", "CANCELLED"]);
  assert.deepEqual(nextProjectStatuses("COMPLETED"), []);
  assert.deepEqual(nextProjectStatuses("toString"), []);
  assert.equal(decideProjectStatus(owner, p(), "COMPLETED", 0).ok, true);
  const blocked = decideProjectStatus(owner, p(), "COMPLETED", 2);
  assert.equal(blocked.ok, false);
  assert.equal(!blocked.ok && blocked.code, "OPEN_MILESTONES");
  assert.equal(decideProjectStatus(owner, p("ON_HOLD"), "COMPLETED", 0).ok, false, "on hold must resume first");
  assert.equal(decideProjectStatus(owner, p("COMPLETED"), "ACTIVE", 0).ok, false, "completed is final");
  assert.equal(decideProjectStatus(owner, p("CANCELLED"), "ACTIVE", 0).ok, false);
  assert.equal(!decideProjectStatus(owner, p(), "ACTIVE", 0).ok && (decideProjectStatus(owner, p(), "ACTIVE", 0) as { code: string }).code, "ALREADY_DONE");
  assert.equal(decideProjectStatus(owner, p(), "ARCHIVED", 0).ok, false);
  assert.equal(decideProjectStatus(owner, p(), "__proto__", 0).ok, false);
});

test("members cannot change status", () => {
  const r = decideProjectStatus(member, p(), "ON_HOLD", 0);
  assert.equal(!r.ok && r.code, "FORBIDDEN");
});

test("only ACTIVE and ON_HOLD projects are open for changes", () => {
  assert.equal(isProjectOpen("ACTIVE"), true);
  assert.equal(isProjectOpen("ON_HOLD"), true);
  assert.equal(isProjectOpen("COMPLETED"), false);
  assert.equal(isProjectOpen("CANCELLED"), false);
  assert.equal(isProjectOpen("constructor"), false);
});

test("milestone progress and overdue", () => {
  assert.deepEqual(milestoneProgress([]), { done: 0, total: 0, pct: 0 });
  assert.deepEqual(milestoneProgress([{ status: "DONE" }, { status: "OPEN" }, { status: "OPEN" }]), { done: 1, total: 3, pct: 33 });
  const past = new Date("2026-01-01T00:00:00Z");
  assert.equal(milestoneOverdue({ status: "OPEN", dueAt: past }, "2026-11-07"), true);
  assert.equal(milestoneOverdue({ status: "DONE", dueAt: past }, "2026-11-07"), false);
  assert.equal(milestoneOverdue({ status: "OPEN", dueAt: null }, "2026-11-07"), false);
  assert.equal(milestoneOverdue({ status: "OPEN", dueAt: new Date("2026-11-07T00:00:00Z") }, "2026-11-07"), false);
});

test("label lookup ignores prototype keys", () => {
  assert.equal(projectStatusLabel("ON_HOLD"), "On hold");
  assert.equal(projectStatusLabel("constructor"), "constructor");
});
