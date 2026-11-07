import { test } from "node:test";
import assert from "node:assert/strict";
import { addCycle, attentionCount, canManageRenewals, canViewRenewals, renewalState, validateRenewal } from "../lib/renewals";

const m = (slug: string, type = "MEMBER") => ({ departmentId: `d-${slug}`, type, department: { slug } });
const ops = { id: "o", memberships: [m("operations", "HEAD")] };
const fin = { id: "f", memberships: [m("finance-and-administration", "HEAD")] };
const T = "2026-11-23";
const good = { name: " Acme  domain ", category: "Hosting and domains", vendorId: "", amount: "999.99", currency: "INR", cycle: "YEARLY", renewalDate: "2027-01-10", reminderDays: "" };

test("access: Operations head manages; Finance head reads; others nothing", () => {
  assert.deepEqual([canViewRenewals(ops), canManageRenewals(ops)], [true, true]);
  assert.deepEqual([canViewRenewals(fin), canManageRenewals(fin)], [true, false]);
  for (const u of [{ id: "a", systemRole: "ADMIN", memberships: [m("technology")] }, { id: "b", memberships: [m("operations")] }, { id: "c", memberships: [m("management", "HEAD")] }])
    assert.deepEqual([canViewRenewals(u), canManageRenewals(u)], [false, false]);
});

test("addCycle clamps month ends and rolls years", () => {
  assert.equal(addCycle("2027-01-31", "MONTHLY"), "2027-02-28");
  assert.equal(addCycle("2028-01-31", "MONTHLY"), "2028-02-29");
  assert.equal(addCycle("2026-11-30", "QUARTERLY"), "2027-02-28");
  assert.equal(addCycle("2026-12-15", "MONTHLY"), "2027-01-15");
  assert.equal(addCycle("2028-02-29", "YEARLY"), "2029-02-28");
  assert.throws(() => addCycle("2026-11-01", "toString"));
  assert.throws(() => addCycle("2026-02-30", "MONTHLY"));
});

test("state: overdue, due-soon window, scheduled, cancelled", () => {
  const r = (renewalDate: string, status = "ACTIVE", reminderDays = 30) => ({ status, renewalDate, reminderDays });
  assert.equal(renewalState(r("2026-11-22"), T), "overdue");
  assert.equal(renewalState(r(T), T), "due-soon", "due today is due soon, not overdue");
  assert.equal(renewalState(r("2026-12-23"), T), "due-soon", "exactly reminderDays away");
  assert.equal(renewalState(r("2026-12-24"), T), "scheduled");
  assert.equal(renewalState(r("2026-01-01", "CANCELLED"), T), "cancelled");
  assert.equal(attentionCount([r("2026-11-01"), r("2026-12-01"), r("2027-06-01"), r("2026-11-01", "CANCELLED")], T), 2);
});

test("validation normalises and defaults reminder to 30", () => {
  const v = validateRenewal(good, T);
  assert.ok(v.ok);
  if (v.ok) { assert.equal(v.name, "Acme domain"); assert.equal(v.amountMinor, 99999); assert.equal(v.reminderDays, 30); assert.equal(v.vendorId, null); }
});

test("validation rejects bad input", () => {
  const bad = (o: object) => assert.equal(validateRenewal({ ...good, ...o }, T).ok, false);
  bad({ name: "a" }); bad({ name: "x‮" }); bad({ category: "Nope" }); bad({ amount: "0" }); bad({ amount: "1e3" }); bad({ currency: "JPY" });
  bad({ cycle: "WEEKLY" }); bad({ cycle: "constructor" }); bad({ renewalDate: "2026-02-30" }); bad({ renewalDate: "2025-01-01" }); bad({ renewalDate: "2040-01-01" });
  bad({ reminderDays: "0" }); bad({ reminderDays: "181" }); bad({ reminderDays: "5.5" });
});
