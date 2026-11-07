import { test } from "node:test";
import assert from "node:assert/strict";
import { availableReleaseActions, canCreateRelease, canViewReleases, decideRelease, validateRelease } from "../lib/releases";

const m = (slug: string, type = "MEMBER") => ({ departmentId: `d-${slug}`, type, department: { slug } });
const head = { id: "h", memberships: [m("technology", "HEAD")] };
const alice = { id: "al", memberships: [m("technology")] };
const bob = { id: "bo", memberships: [m("technology")] };
const outsiders = [{ id: "a", systemRole: "ADMIN", memberships: [m("sales-and-marketing")] }, { id: "g", memberships: [m("management", "HEAD")] }, { id: "o", memberships: [m("operations", "HEAD")] }, { id: "z", memberships: [] }];
const rel = (status: string, creatorId = "al") => ({ status, creatorId });
const good = { version: " v1.4.2 ", summary: "Fixes the login redirect.", assetId: "asset1", commitRef: "ABCDEF1", changeUrl: "" };

test("access: only Technology reads and plans releases; admin and other heads see nothing", () => {
  for (const u of [head, alice]) { assert.equal(canViewReleases(u), true); assert.equal(canCreateRelease(u), true); }
  for (const u of outsiders) {
    assert.equal(canViewReleases(u), false); assert.equal(canCreateRelease(u), false);
    assert.deepEqual(availableReleaseActions(u, rel("PLANNED")), []);
    const r = decideRelease(u, rel("PLANNED"), "note", "hi");
    assert.ok(!r.ok && r.code === "FORBIDDEN");
  }
});

test("validation: normalises, lower-cases the commit, and rejects bad input and secrets", () => {
  const v = validateRelease(good);
  assert.ok(v.ok);
  if (v.ok) { assert.equal(v.version, "v1.4.2"); assert.equal(v.commitRef, "abcdef1"); assert.equal(v.changeUrl, null); }
  for (const o of [{ version: " " }, { version: "v".repeat(61) }, { summary: "  " }, { assetId: "" }, { commitRef: "xyz1234" }, { commitRef: "abc" }, { version: "v1‮" },
    { changeUrl: "javascript:alert(1)" }, { changeUrl: "https://user:pw@github.com/x" }, { summary: "db password: hunter22" }, { summary: "x".repeat(1001) }])
    assert.equal(validateRelease({ ...good, ...o }).ok, false, JSON.stringify(o));
  assert.ok(validateRelease({ ...good, changeUrl: "https://github.com/org/repo/pull/12" }).ok);
});

test("outcome: only the head or the creator records it; another member may only add notes", () => {
  assert.ok(decideRelease(alice, rel("PLANNED"), "deploy", "").ok, "creator");
  assert.ok(decideRelease(head, rel("PLANNED"), "deploy", "").ok, "head");
  const r = decideRelease(bob, rel("PLANNED"), "deploy", "");
  assert.ok(!r.ok && r.code === "FORBIDDEN");
  assert.deepEqual(availableReleaseActions(bob, rel("PLANNED")), ["note"]);
  assert.deepEqual(availableReleaseActions(alice, rel("PLANNED")).sort(), ["cancel", "deploy", "fail", "note"]);
});

test("flow: fail, cancel and rollback need a note; rollback only from deployed; final states stay final", () => {
  for (const a of ["fail", "cancel"]) { assert.equal(decideRelease(alice, rel("PLANNED"), a, " ").ok, false); assert.ok(decideRelease(alice, rel("PLANNED"), a, "reason").ok); }
  assert.equal(decideRelease(alice, rel("DEPLOYED"), "rollback", "").ok, false);
  const rb = decideRelease(alice, rel("DEPLOYED"), "rollback", "error rate spiked");
  assert.ok(rb.ok && rb.to === "ROLLED_BACK");
  assert.equal(decideRelease(alice, rel("PLANNED"), "rollback", "x").ok, false, "cannot roll back what was never deployed");
  assert.equal(decideRelease(alice, rel("DEPLOYED"), "deploy", "").ok, false, "cannot deploy twice");
  for (const s of ["FAILED", "CANCELLED", "ROLLED_BACK"]) {
    for (const a of ["deploy", "fail", "cancel", "rollback"]) assert.equal(decideRelease(head, rel(s), a, "x").ok, false, `${s} -> ${a}`);
    assert.deepEqual(availableReleaseActions(head, rel(s)), ["note"]);
  }
});

test("notes: any Technology member, any status, status unchanged, secrets and control characters refused", () => {
  for (const s of ["PLANNED", "DEPLOYED", "FAILED", "ROLLED_BACK", "CANCELLED"]) { const r = decideRelease(bob, rel(s), "note", "checked logs"); assert.ok(r.ok && r.to === s); }
  assert.equal(decideRelease(bob, rel("PLANNED"), "note", "").ok, false);
  assert.equal(decideRelease(bob, rel("PLANNED"), "note", "token is abc123xyz").ok, false);
  assert.equal(decideRelease(bob, rel("PLANNED"), "note", "a‮b").ok, false);
  assert.equal(decideRelease(bob, rel("PLANNED"), "note", "x".repeat(1001)).ok, false);
});

test("actions: unknown and prototype-key names are rejected", () => {
  for (const a of ["toString", "constructor", "__proto__", "hasOwnProperty", "", "approve"]) assert.equal(decideRelease(head, rel("PLANNED"), a, "x").ok, false, a);
});
