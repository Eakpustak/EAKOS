import { test } from "node:test";
import assert from "node:assert/strict";
import { availableRecordActions, canManageRecords, canViewRecords, decideRecord, lateDays, lateState, referenceKey, validateRecord, vendorUsable } from "../lib/finance-records";

const m = (slug: string, type = "MEMBER") => ({ departmentId: `d-${slug}`, type, department: { slug } });
const fin = { id: "f", memberships: [m("finance-and-administration", "HEAD")] };
const finMember = { id: "fm", memberships: [m("finance-and-administration")] };
const ops = { id: "o", memberships: [m("operations", "HEAD")] };
const opsMember = { id: "om", memberships: [m("operations")] };
const mgmt = { id: "mg", memberships: [m("management", "HEAD")] };
const admin = { id: "a", systemRole: "ADMIN", memberships: [m("technology")] };
const TODAY = "2026-11-21";
const good = { kind: "INVOICE", vendorId: "v1", reference: " INV-001 ", amount: "1250.5", currency: "INR", issueDate: "2026-11-01", dueDate: "2026-12-01" };

test("access: Finance head manages; Operations head reads; nobody else", () => {
  assert.deepEqual([canViewRecords(fin), canManageRecords(fin)], [true, true]);
  assert.deepEqual([canViewRecords(ops), canManageRecords(ops)], [true, false], "Operations reads only");
  for (const u of [finMember, opsMember, mgmt, admin, { id: "z", memberships: [] }]) assert.deepEqual([canViewRecords(u), canManageRecords(u)], [false, false]);
});

test("validation normalises and converts the amount to integer minor units", () => {
  const r = validateRecord(good, TODAY);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.reference, "INV-001"); assert.equal(r.amountMinor, 125050); assert.equal(r.dueDate, "2026-12-01"); }
});

test("validation: kind, amount, currency and reference", () => {
  const bad = (o: object) => { const r = validateRecord({ ...good, ...o }, TODAY); assert.equal(r.ok, false); };
  bad({ kind: "RECEIPT" }); bad({ kind: "toString" }); bad({ vendorId: " " }); bad({ reference: "   " }); bad({ reference: "x".repeat(81) });
  bad({ reference: "A‮B" }); bad({ amount: "0" }); bad({ amount: "-5" }); bad({ amount: "1e3" }); bad({ amount: "10.123" }); bad({ amount: "1000000.01" });
  bad({ currency: "JPY" });
});

test("validation: dates", () => {
  const bad = (o: object) => assert.equal(validateRecord({ ...good, ...o }, TODAY).ok, false);
  bad({ issueDate: "2026-11-22" });            // future
  bad({ issueDate: "2024-01-01" });            // older than 730 days
  bad({ issueDate: "2026-02-30" });            // not a real date
  bad({ dueDate: "" });                        // invoice needs a due date
  bad({ dueDate: "2026-10-31" });              // before document date
  bad({ dueDate: "2029-01-01" });              // too far out
  assert.ok(validateRecord({ ...good, kind: "QUOTATION", dueDate: "" }, TODAY).ok, "valid-until is optional on a quotation");
});

test("reference key ignores case, spacing and compatibility forms", () => {
  assert.equal(referenceKey("  INV   001 "), referenceKey("inv 001"));
  assert.equal(referenceKey("ＩＮＶ-1"), "inv-1");
});

test("late state is computed, only for OPEN records, and uses calendar dates", () => {
  assert.equal(lateState("INVOICE", "OPEN", "2026-11-20", TODAY), "overdue");
  assert.equal(lateState("QUOTATION", "OPEN", "2026-11-20", TODAY), "expired");
  assert.equal(lateState("INVOICE", "OPEN", TODAY, TODAY), null, "due today is not late");
  assert.equal(lateState("INVOICE", "PAID", "2026-01-01", TODAY), null);
  assert.equal(lateState("INVOICE", "OPEN", null, TODAY), null);
  assert.equal(lateDays("2026-11-18", TODAY), 3);
});

test("actions available depend on kind and status, and only for the Finance head", () => {
  assert.deepEqual(availableRecordActions(fin, { kind: "INVOICE", status: "OPEN" }).sort(), ["pay", "void"]);
  assert.deepEqual(availableRecordActions(fin, { kind: "QUOTATION", status: "OPEN" }).sort(), ["accept", "decline", "void"]);
  for (const s of ["PAID", "VOID", "ACCEPTED", "DECLINED"]) assert.deepEqual(availableRecordActions(fin, { kind: "INVOICE", status: s }), []);
  assert.deepEqual(availableRecordActions(ops, { kind: "INVOICE", status: "OPEN" }), [], "Operations cannot act");
  assert.deepEqual(availableRecordActions(admin, { kind: "INVOICE", status: "OPEN" }), [], "ADMIN grants nothing");
});

test("decide: pay needs a payment reference; accept/decline only for quotations", () => {
  const inv = { kind: "INVOICE", status: "OPEN" }, quo = { kind: "QUOTATION", status: "OPEN" };
  assert.equal(decideRecord(fin, inv, "pay", "  ").ok, false);
  assert.equal(decideRecord(fin, inv, "pay", "ab").ok, false);
  const ok = decideRecord(fin, inv, "pay", " NEFT-998877 ");
  assert.ok(ok.ok && ok.to === "PAID" && ok.text === "NEFT-998877");
  assert.equal(decideRecord(fin, inv, "accept", "").ok, false, "cannot accept an invoice");
  assert.equal(decideRecord(fin, quo, "pay", "NEFT-1").ok, false, "cannot pay a quotation");
  assert.ok(decideRecord(fin, quo, "accept", "").ok);
  assert.equal(decideRecord(fin, quo, "decline", "").ok, false, "decline needs a reason");
  assert.equal(decideRecord(fin, inv, "void", "").ok, false, "void needs a reason");
  assert.ok(decideRecord(fin, inv, "void", "entered twice").ok);
});

test("decide: forbidden for everyone but the Finance head; terminal states are final; prototype keys are invalid", () => {
  const inv = { kind: "INVOICE", status: "OPEN" };
  for (const u of [ops, opsMember, finMember, mgmt, admin]) {
    const r = decideRecord(u, inv, "pay", "NEFT-1");
    assert.ok(!r.ok && r.code === "FORBIDDEN");
  }
  const paid = decideRecord(fin, { kind: "INVOICE", status: "PAID" }, "pay", "NEFT-1");
  assert.ok(!paid.ok && paid.code === "ALREADY_DONE");
  const voided = decideRecord(fin, { kind: "INVOICE", status: "VOID" }, "pay", "NEFT-1");
  assert.ok(!voided.ok && voided.code === "INVALID_STATE");
  for (const a of ["toString", "constructor", "__proto__", ""]) assert.ok(!decideRecord(fin, inv, a, "x").ok);
});

test("vendors must be ACTIVE", () => {
  assert.equal(vendorUsable({ status: "ACTIVE" }), true);
  assert.equal(vendorUsable({ status: "INACTIVE" }), false);
  assert.equal(vendorUsable(null), false);
});
