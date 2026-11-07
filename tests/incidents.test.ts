import { test } from "node:test";
import assert from "node:assert/strict";
import { availableIncidentActions, canAssignIncident, canViewIncidents, decideIncident, validateIncident } from "../lib/incidents";

const m = (slug: string, type = "MEMBER") => ({ departmentId: `d-${slug}`, type, department: { slug } });
const head = { id: "h", memberships: [m("technology", "HEAD")] };
const alice = { id: "al", memberships: [m("technology")] };
const bob = { id: "bo", memberships: [m("technology")] };
const outsiders = [{ id: "a", systemRole: "ADMIN", memberships: [m("sales-and-marketing")] }, { id: "g", memberships: [m("management", "HEAD")] }, { id: "o", memberships: [m("operations", "HEAD")] }, { id: "z", memberships: [] }];
const inc = (status: string, assigneeId: string | null = "al") => ({ status, assigneeId });
const good = { title: " Prod API down ", description: "502s since 10:02 on the API gateway.", severity: "HIGH", assetId: "" };

test("access: only Technology reads and reports; only the head assigns; admin and other heads nothing", () => {
  for (const u of [head, alice]) assert.equal(canViewIncidents(u), true);
  for (const u of outsiders) { assert.equal(canViewIncidents(u), false); assert.deepEqual(availableIncidentActions(u, inc("OPEN")), []); }
  assert.equal(canAssignIncident(head, inc("OPEN")), true);
  assert.equal(canAssignIncident(alice, inc("OPEN")), false);
  assert.equal(canAssignIncident(head, inc("RESOLVED")), false);
});

test("validation: normalises, and rejects bad severity, empty text, control chars and secrets", () => {
  const v = validateIncident(good);
  assert.ok(v.ok);
  if (v.ok) { assert.equal(v.title, "Prod API down"); assert.equal(v.assetId, null); }
  for (const o of [{ severity: "SEV9" }, { severity: "constructor" }, { title: "x" }, { description: "  " }, { title: "A‮B" }, { description: "x".repeat(2001) }, { description: "db password: hunter22" }, { description: "postgres://admin:pw@db/app" }])
    assert.equal(validateIncident({ ...good, ...o }).ok, false, JSON.stringify(o));
});

test("flow: start needs an assignee; assignee or head may start; another member may not", () => {
  assert.equal(decideIncident(head, inc("OPEN", null), "start", "").ok, false, "no assignee");
  assert.ok(decideIncident(alice, inc("OPEN"), "start", "").ok);
  assert.ok(decideIncident(head, inc("OPEN"), "start", "").ok);
  const r = decideIncident(bob, inc("OPEN"), "start", "");
  assert.ok(!r.ok && r.code === "FORBIDDEN");
});

test("flow: mitigate and resolve need a note; resolve allowed from investigating or mitigated only", () => {
  assert.equal(decideIncident(alice, inc("INVESTIGATING"), "mitigate", " ").ok, false);
  assert.ok(decideIncident(alice, inc("INVESTIGATING"), "mitigate", "rolled back").ok);
  assert.ok(decideIncident(alice, inc("MITIGATED"), "resolve", "fixed config").ok);
  assert.ok(decideIncident(alice, inc("INVESTIGATING"), "resolve", "fixed config").ok);
  assert.equal(decideIncident(alice, inc("OPEN"), "resolve", "x").ok, false, "cannot skip investigating");
  assert.equal(decideIncident(alice, inc("RESOLVED"), "resolve", "x").ok, false);
});

test("reopen: head only, needs a reason; resolved incidents otherwise accept notes only", () => {
  const r = decideIncident(alice, inc("RESOLVED"), "reopen", "recurred");
  assert.ok(!r.ok && r.code === "FORBIDDEN");
  assert.equal(decideIncident(head, inc("RESOLVED"), "reopen", "").ok, false);
  const ok = decideIncident(head, inc("RESOLVED"), "reopen", "recurred");
  assert.ok(ok.ok && ok.to === "INVESTIGATING");
  assert.deepEqual(availableIncidentActions(bob, inc("RESOLVED")), ["note"]);
  assert.deepEqual(availableIncidentActions(head, inc("RESOLVED")).sort(), ["note", "reopen"]);
});

test("notes: any Technology member, any status, status unchanged, secrets refused", () => {
  for (const s of ["OPEN", "INVESTIGATING", "MITIGATED", "RESOLVED"]) { const r = decideIncident(bob, inc(s), "note", "still seeing 502s"); assert.ok(r.ok && r.to === s); }
  assert.equal(decideIncident(bob, inc("OPEN"), "note", "").ok, false);
  assert.equal(decideIncident(bob, inc("OPEN"), "note", "token is abc123xyz").ok, false);
  for (const u of outsiders) { const r = decideIncident(u, inc("OPEN"), "note", "hi"); assert.ok(!r.ok && r.code === "FORBIDDEN"); }
  for (const a of ["toString", "constructor", "__proto__", ""]) assert.equal(decideIncident(head, inc("OPEN"), a, "x").ok, false);
});
