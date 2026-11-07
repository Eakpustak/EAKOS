import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageHolidays, holidaysInRange, untilLabel, upcomingHolidays, validateHoliday } from "../lib/holidays";

const m = (slug: string, type = "MEMBER") => ({ departmentId: `d-${slug}`, type, department: { slug } });
const hrHead = { id: "h", memberships: [m("human-resources", "HEAD")] };
const hrMember = { id: "hm", memberships: [m("human-resources")] };
const mgmtHead = { id: "g", memberships: [m("management", "HEAD")] };
const d = (s: string) => ({ date: new Date(`${s}T00:00:00Z`), name: s });

test("only the HR head manages the calendar", () => {
  assert.equal(canManageHolidays(hrHead), true);
  assert.equal(canManageHolidays(hrMember), false);
  assert.equal(canManageHolidays(mgmtHead), false);
  assert.equal(canManageHolidays({ id: "x", memberships: [] }), false);
});

test("validation: name, real date, sane year", () => {
  assert.equal(validateHoliday("Diwali", "2026-11-08"), null);
  assert.notEqual(validateHoliday("  ", "2026-11-08"), null);
  assert.notEqual(validateHoliday("x".repeat(101), "2026-11-08"), null);
  assert.notEqual(validateHoliday("Diwali", ""), null);
  assert.notEqual(validateHoliday("Diwali", "2026-02-30"), null);
  assert.notEqual(validateHoliday("Diwali", "1999-01-01"), null);
  assert.notEqual(validateHoliday("Diwali", "2101-01-01"), null);
});

test("range filter is inclusive and sorted", () => {
  const hs = [d("2026-11-12"), d("2026-11-10"), d("2026-11-09"), d("2026-11-13")];
  const r = holidaysInRange(hs, new Date("2026-11-10T00:00:00Z"), new Date("2026-11-12T00:00:00Z"));
  assert.deepEqual(r.map((h) => h.name), ["2026-11-10", "2026-11-12"]);
  assert.deepEqual(holidaysInRange([], new Date("2026-11-10T00:00:00Z"), new Date("2026-11-12T00:00:00Z")), []);
});

test("upcoming includes today, drops the past, limits", () => {
  const hs = [d("2026-11-06"), d("2026-11-07"), d("2026-11-20"), d("2026-12-01")];
  assert.deepEqual(upcomingHolidays(hs, "2026-11-07", 2).map((h) => h.name), ["2026-11-07", "2026-11-20"]);
  assert.deepEqual(upcomingHolidays(hs, "2026-11-07", 0), []);
});

test("until label", () => {
  assert.equal(untilLabel("2026-11-07", "2026-11-07"), "today");
  assert.equal(untilLabel("2026-11-08", "2026-11-07"), "tomorrow");
  assert.equal(untilLabel("2026-11-19", "2026-11-07"), "in 12 days");
  assert.equal(untilLabel("2026-11-06", "2026-11-07"), "1 day ago");
  assert.equal(untilLabel("2026-11-01", "2026-11-07"), "6 days ago");
});
