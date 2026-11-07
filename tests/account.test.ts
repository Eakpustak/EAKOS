import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attemptWindowStart, isLockedOut, isSessionStale, loginNotice, parseDisplayName,
  validatePassword, validatePasswordChange,
} from "../lib/account";

const ctx = { email: "asha.rao@company.com", displayName: "Asha Rao" };

test("password strength: length, bytes, trivial, common, personal", () => {
  assert.equal(validatePassword("river-Lamp-42-orbit", ctx), null);
  assert.notEqual(validatePassword("short1", ctx), null);
  assert.notEqual(validatePassword("a".repeat(30), ctx), null, "one repeated character");
  assert.notEqual(validatePassword("Password123", ctx), null, "common, case-insensitive");
  assert.notEqual(validatePassword("xx-asha.rao-xx-1", ctx), null, "contains email name");
  assert.notEqual(validatePassword("ASHA RAO KUMAR", { email: "q@x.io", displayName: "Asha Rao Kumar" }), null, "is the name");
});

test("bcrypt 72-byte limit is measured in bytes, not characters", () => {
  assert.equal(validatePassword("a1".repeat(36), ctx), null, "72 ascii bytes is allowed");
  assert.notEqual(validatePassword("a1".repeat(36) + "b", ctx), null, "73 bytes is refused");
  const cjk = "日本語の".repeat(7); // 28 characters, 84 bytes
  assert.equal(cjk.length, 28);
  assert.notEqual(validatePassword(cjk, ctx), null, "28 characters but 84 bytes");
  assert.equal(validatePassword("日本語の".repeat(6), ctx), null, "24 characters, 72 bytes is allowed");
});

test("password change needs current, matching confirmation, and a different new password", () => {
  const ok = { current: "old-secret-123", next: "river-Lamp-42-orbit", confirm: "river-Lamp-42-orbit" };
  assert.equal(validatePasswordChange(ok, ctx), null);
  assert.notEqual(validatePasswordChange({ ...ok, current: "" }, ctx), null);
  assert.notEqual(validatePasswordChange({ ...ok, confirm: "different-pass-99" }, ctx), null);
  assert.notEqual(validatePasswordChange({ ...ok, next: ok.current, confirm: ok.current }, ctx), null);
  assert.notEqual(validatePasswordChange({ ...ok, next: "short", confirm: "short" }, ctx), null);
});

test("display name: trimmed, collapsed, bounded, no control characters", () => {
  assert.deepEqual(parseDisplayName("  Asha   Rao "), { value: "Asha Rao" });
  assert.ok("error" in parseDisplayName("   "));
  assert.ok("error" in parseDisplayName("x".repeat(121)));
  assert.ok("error" in parseDisplayName("Asha\u0000Rao"));
  assert.ok("error" in parseDisplayName("Asha\u202ERao"), "bidi override is refused");
});

test("a sign-in older than the last password change is stale; unstamped sign-ins fail closed", () => {
  const changed = new Date("2026-11-07T10:00:00Z");
  const sec = Math.floor(changed.getTime() / 1000);
  assert.equal(isSessionStale(sec - 60, changed), true);
  assert.equal(isSessionStale(sec, changed), false, "signed in the same second as the change");
  assert.equal(isSessionStale(sec + 60, changed), false);
  assert.equal(isSessionStale(undefined, changed), true);
  assert.equal(isSessionStale(NaN, changed), true);
  assert.equal(isSessionStale(undefined, null), false, "never changed: nothing to compare");
  assert.equal(isSessionStale(sec - 9999, null), false);
});

test("attempt throttle: locks at the limit, window is 15 minutes", () => {
  assert.equal(isLockedOut(4), false);
  assert.equal(isLockedOut(5), true);
  assert.equal(isLockedOut(6), true);
  const now = new Date("2026-11-07T10:00:00Z");
  assert.equal(now.getTime() - attemptWindowStart(now).getTime(), 15 * 60_000);
});

test("login notices come from a fixed list, never from the URL text", () => {
  assert.ok(loginNotice("password-changed"));
  assert.equal(loginNotice("<script>"), null);
  assert.equal(loginNotice("toString"), null, "prototype keys are not notices");
  assert.equal(loginNotice("__proto__"), null);
  assert.equal(loginNotice(null), null);
});
