import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availableExpenseActions, canViewExpense, decideExpense, expenseStatusLabel, expenseViews, expenseWhere, formatMoney, parseAmount,
  validateExpense, validateExpenseDate,
} from "../lib/expenses";

const m = (slug: string, type = "MEMBER", id = `d-${slug}`) => ({ departmentId: id, type, department: { slug } });
const sub = { id: "s", memberships: [m("technology")] };
const techHead = { id: "th", memberships: [m("technology", "HEAD")] };
const fin = { id: "f", memberships: [m("finance-and-administration", "HEAD")] };
const finMember = { id: "fm", memberships: [m("finance-and-administration")] };
const mgmt = { id: "mg", memberships: [m("management", "HEAD")] };
const stranger = { id: "x", memberships: [m("sales-and-marketing", "HEAD")] };
const e = (status: string, over: Record<string, string> = {}) => ({ submittedById: "s", approverDepartmentId: "d-technology", status, ...over });

test("amounts parse to integer minor units without floats", () => {
  assert.deepEqual(parseAmount("1250.50"), { ok: true, minor: 125050 });
  assert.deepEqual(parseAmount("0.07"), { ok: true, minor: 7 });
  assert.deepEqual(parseAmount("19"), { ok: true, minor: 1900 });
  assert.deepEqual(parseAmount("1.5"), { ok: true, minor: 150 });
  assert.deepEqual(parseAmount("  10.10 "), { ok: true, minor: 1010 });
  assert.deepEqual(parseAmount("1000000.00"), { ok: true, minor: 100_000_000 }, "limit is inclusive");
  for (const bad of ["", "0", "0.00", "-5", "+5", "1,000", "1e3", "1.234", ".5", "5.", "abc", "1 000", "1000000.01", "9999999999", "Infinity", "0x10"]) {
    assert.equal(parseAmount(bad).ok, false, JSON.stringify(bad));
  }
  assert.deepEqual(parseAmount("19.99"), { ok: true, minor: 1999 }, "19.99 * 100 would be 1998.9999 in floats");
  assert.deepEqual(parseAmount("0.29"), { ok: true, minor: 29 });
});

test("money is formatted from integers", () => {
  assert.equal(formatMoney(125050, "INR"), "INR 1,250.50");
  assert.equal(formatMoney(5, "USD"), "USD 0.05");
  assert.equal(formatMoney(100_000_000, "EUR"), "EUR 10,00,000.00");
});

test("expense date window", () => {
  assert.equal(validateExpenseDate("2026-11-18", "2026-11-18"), null);
  assert.ok(validateExpenseDate("2026-11-19", "2026-11-18"), "future refused");
  assert.equal(validateExpenseDate("2026-08-20", "2026-11-18"), null, "90 days back is allowed");
  assert.ok(validateExpenseDate("2026-08-19", "2026-11-18"), "91 days back refused");
  assert.ok(validateExpenseDate("2026-02-30", "2026-11-18"), "impossible date");
  assert.ok(validateExpenseDate("", "2026-11-18"));
});

test("full input validation", () => {
  const good = { amount: "100", currency: "INR", category: "Travel", date: "2026-11-10", description: "Taxi to client", evidenceRef: "Receipt 4471" };
  const r = validateExpense(good, "2026-11-18");
  assert.equal(r.ok && r.minor, 10000);
  for (const patch of [{ currency: "XYZ" }, { currency: "constructor" }, { category: "Gifts" }, { description: "  " }, { description: "x".repeat(501) }, { evidenceRef: "ab" }, { evidenceRef: "x".repeat(301) }, { amount: "0" }]) {
    assert.equal(validateExpense({ ...good, ...patch }, "2026-11-18").ok, false, JSON.stringify(patch));
  }
});

test("who can see an expense: submitter, approving heads, Finance head; nobody else", () => {
  const x = e("SUBMITTED");
  assert.equal(canViewExpense(sub, x), true);
  assert.equal(canViewExpense(techHead, x), true);
  assert.equal(canViewExpense(fin, x), true);
  assert.equal(canViewExpense(finMember, x), false, "plain Finance membership grants nothing");
  assert.equal(canViewExpense(mgmt, x), false, "Management head as such sees nothing");
  assert.equal(canViewExpense(stranger, x), false);
  assert.equal(canViewExpense({ id: "z", memberships: [] }, x), false);
  assert.equal(canViewExpense({ id: "s", memberships: [m("technology", "HEAD")] }, e("SUBMITTED")), true, "submitter sees own");
});

test("approve and reject: approving head only, never for their own expense", () => {
  assert.equal(decideExpense(techHead, e("SUBMITTED"), "approve", null).ok, true);
  assert.equal(decideExpense(fin, e("SUBMITTED"), "approve", null).ok, false, "Finance head is not the approver");
  assert.equal(decideExpense(mgmt, e("SUBMITTED"), "approve", null).ok, false);
  assert.equal(decideExpense(sub, e("SUBMITTED"), "approve", null).ok, false, "submitter cannot approve");
  const selfHead = { id: "th", memberships: [m("technology", "HEAD")] };
  assert.equal(decideExpense(selfHead, e("SUBMITTED", { submittedById: "th" }), "approve", null).ok, false, "a head cannot approve their own");
  const rej = decideExpense(techHead, e("SUBMITTED"), "reject", "  ");
  assert.equal(rej.ok === false && rej.code, "NOTE_REQUIRED");
  assert.equal(decideExpense(techHead, e("SUBMITTED"), "reject", "No receipt").ok, true);
  const again = decideExpense(techHead, e("APPROVED"), "approve", null);
  assert.equal(again.ok === false && again.code, "ALREADY_DONE");
  const wrong = decideExpense(techHead, e("PAID"), "reject", "late");
  assert.equal(wrong.ok === false && wrong.code, "INVALID_STATE", "paid cannot be rejected");
  assert.equal(decideExpense(techHead, e("REJECTED"), "approve", null).ok, false, "rejected cannot be revived");
});

test("payment: Finance head only, only after approval, never for their own expense", () => {
  assert.equal(decideExpense(fin, e("APPROVED"), "pay", "UTR 99").ok, true);
  const early = decideExpense(fin, e("SUBMITTED"), "pay", null);
  assert.equal(early.ok === false && early.code, "INVALID_STATE", "cannot pay before approval");
  assert.equal(decideExpense(techHead, e("APPROVED"), "pay", null).ok, false, "approver cannot pay");
  assert.equal(decideExpense(finMember, e("APPROVED"), "pay", null).ok, false);
  assert.equal(decideExpense(sub, e("APPROVED"), "pay", null).ok, false);
  assert.equal(decideExpense(fin, e("APPROVED", { submittedById: "f" }), "pay", null).ok, false, "Finance head cannot pay their own expense");
  const done = decideExpense(fin, e("PAID"), "pay", null);
  assert.equal(done.ok === false && done.code, "ALREADY_DONE");
  assert.equal(decideExpense(fin, e("APPROVED"), "pay", "x".repeat(201)).ok, false);
});

test("cancel: submitter only, only while awaiting approval", () => {
  assert.equal(decideExpense(sub, e("SUBMITTED"), "cancel", null).ok, true);
  assert.equal(decideExpense(sub, e("APPROVED"), "cancel", null).ok, false, "approved money cannot be withdrawn here");
  assert.equal(decideExpense(techHead, e("SUBMITTED"), "cancel", null).ok, false);
  assert.equal(decideExpense(sub, e("SUBMITTED"), "constructor", null).ok, false);
  assert.equal(decideExpense(sub, e("SUBMITTED"), "__proto__", null).ok, false);
});

test("available actions per role and state", () => {
  assert.deepEqual(availableExpenseActions(techHead, e("SUBMITTED")), ["approve", "reject"]);
  assert.deepEqual(availableExpenseActions(sub, e("SUBMITTED")), ["cancel"]);
  assert.deepEqual(availableExpenseActions(fin, e("APPROVED")), ["pay"]);
  assert.deepEqual(availableExpenseActions(sub, e("APPROVED")), []);
  assert.deepEqual(availableExpenseActions(fin, e("PAID")), []);
});

test("views and query scope", () => {
  assert.deepEqual(expenseViews(sub).map((v) => v[0]), ["mine"]);
  assert.deepEqual(expenseViews(techHead).map((v) => v[0]), ["mine", "review"]);
  assert.deepEqual(expenseViews(fin).map((v) => v[0]), ["mine", "review", "pay", "all"]);
  assert.deepEqual(expenseWhere(sub, "all"), { submittedById: "s" }, "a plain user asking for 'all' still gets only their own");
  assert.deepEqual(expenseWhere(sub, "pay"), { submittedById: "s" });
  assert.deepEqual(expenseWhere(mgmt, "all"), { submittedById: "mg" }, "Management head is not Finance");
  assert.deepEqual(expenseWhere(fin, "all"), {});
  assert.deepEqual(expenseWhere(techHead, "review"), { approverDepartmentId: { in: ["d-technology"] }, submittedById: { not: "th" }, status: "SUBMITTED" });
  assert.equal(expenseStatusLabel("toString"), "toString");
});
