import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availablePurchaseActions, canViewPurchase, decidePurchase, purchaseStatusLabel, purchaseViews, purchaseWhere, validateNeededBy, validatePurchase,
  vendorUsable,
} from "../lib/purchases";

const m = (slug: string, type = "MEMBER", id = `d-${slug}`) => ({ departmentId: id, type, department: { slug } });
const req = { id: "r", memberships: [m("technology")] };
const techHead = { id: "th", memberships: [m("technology", "HEAD")] };
const ops = { id: "o", memberships: [m("operations", "HEAD")] };
const opsMember = { id: "om", memberships: [m("operations")] };
const fin = { id: "f", memberships: [m("finance-and-administration", "HEAD")] };
const mgmt = { id: "mg", memberships: [m("management", "HEAD")] };
const stranger = { id: "x", memberships: [m("sales-and-marketing", "HEAD")] };
const p = (status: string, over: Record<string, string> = {}) => ({ requesterId: "r", approverDepartmentId: "d-technology", status, ...over });

test("input validation: quantity, estimate, category, dates", () => {
  const good = { title: "Standing desk", justification: "Replace broken desk", category: "Facilities", quantity: "2", amount: "25000.50", currency: "INR", neededBy: "" };
  const r = validatePurchase(good, "2026-11-20");
  assert.equal(r.ok && r.estimatedMinor, 2500050);
  assert.equal(r.ok && r.quantity, 2);
  assert.equal(r.ok && r.neededBy, null);
  for (const patch of [
    { title: "ab" }, { title: "x".repeat(121) }, { title: "bad\u202etitle" }, { justification: "  " }, { justification: "x".repeat(1001) },
    { category: "Gifts" }, { category: "constructor" }, { quantity: "0" }, { quantity: "-1" }, { quantity: "1.5" }, { quantity: "10001" }, { quantity: "1e3" }, { quantity: "" },
    { amount: "0" }, { amount: "1,000" }, { amount: "1000000.01" }, { currency: "XYZ" }, { currency: "__proto__" }, { neededBy: "2026-11-19" }, { neededBy: "2026-02-30" }, { neededBy: "2028-01-01" },
  ]) {
    assert.equal(validatePurchase({ ...good, ...patch }, "2026-11-20").ok, false, JSON.stringify(patch));
  }
  assert.equal(validatePurchase({ ...good, neededBy: "2026-11-20" }, "2026-11-20").ok, true, "today is allowed");
  assert.equal(validatePurchase({ ...good, quantity: "10000" }, "2026-11-20").ok, true, "upper bound is inclusive");
});

test("needed-by window is today to one year ahead, and optional", () => {
  assert.equal(validateNeededBy("", "2026-11-20"), null);
  assert.equal(validateNeededBy("2027-11-20", "2026-11-20"), null, "365 days ahead is allowed");
  assert.ok(validateNeededBy("2027-11-21", "2026-11-20"));
  assert.ok(validateNeededBy("2026-11-19", "2026-11-20"));
});

test("visibility: requester, approving heads, and Operations only once approved", () => {
  assert.equal(canViewPurchase(req, p("SUBMITTED")), true);
  assert.equal(canViewPurchase(techHead, p("SUBMITTED")), true);
  assert.equal(canViewPurchase(ops, p("SUBMITTED")), false, "Operations does not see unapproved requests");
  assert.equal(canViewPurchase(ops, p("REJECTED")), false);
  assert.equal(canViewPurchase(ops, p("CANCELLED")), false);
  for (const s of ["APPROVED", "ORDERED", "RECEIVED"]) assert.equal(canViewPurchase(ops, p(s)), true, s);
  assert.equal(canViewPurchase(opsMember, p("APPROVED")), false, "plain Operations membership grants nothing");
  assert.equal(canViewPurchase(fin, p("APPROVED")), false, "Finance head sees nothing in this slice");
  assert.equal(canViewPurchase(mgmt, p("APPROVED")), false, "Management head as such sees nothing");
  assert.equal(canViewPurchase(stranger, p("APPROVED")), false);
  assert.equal(canViewPurchase({ id: "z", memberships: [] }, p("APPROVED")), false);
});

test("approve and reject: approving head only, never for their own request", () => {
  assert.equal(decidePurchase(techHead, p("SUBMITTED"), "approve", null).ok, true);
  assert.equal(decidePurchase(ops, p("SUBMITTED"), "approve", null).ok, false, "Operations head is not the approver");
  assert.equal(decidePurchase(req, p("SUBMITTED"), "approve", null).ok, false, "requester cannot approve");
  assert.equal(decidePurchase({ id: "th", memberships: techHead.memberships }, p("SUBMITTED", { requesterId: "th" }), "approve", null).ok, false, "a head cannot approve their own");
  const rej = decidePurchase(techHead, p("SUBMITTED"), "reject", " ");
  assert.equal(rej.ok === false && rej.code, "TEXT_REQUIRED");
  assert.equal(decidePurchase(techHead, p("SUBMITTED"), "reject", "Over budget").ok, true);
  const again = decidePurchase(techHead, p("APPROVED"), "approve", null);
  assert.equal(again.ok === false && again.code, "ALREADY_DONE");
  assert.equal(decidePurchase(techHead, p("ORDERED"), "reject", "late").ok, false, "an ordered request cannot be rejected");
  assert.equal(decidePurchase(techHead, p("REJECTED"), "approve", null).ok, false, "rejected cannot be revived");
});

test("order: Operations head only, only after approval, needs a reference, never for their own request", () => {
  assert.equal(decidePurchase(ops, p("APPROVED"), "order", "PO-1042").ok, true);
  const noRef = decidePurchase(ops, p("APPROVED"), "order", "  ");
  assert.equal(noRef.ok === false && noRef.code, "TEXT_REQUIRED");
  assert.equal(decidePurchase(ops, p("APPROVED"), "order", "ab").ok, false, "reference too short");
  assert.equal(decidePurchase(ops, p("APPROVED"), "order", "x".repeat(201)).ok, false);
  const early = decidePurchase(ops, p("SUBMITTED"), "order", "PO-1");
  assert.equal(early.ok === false && early.code, "INVALID_STATE", "cannot order before approval");
  assert.equal(decidePurchase(opsMember, p("APPROVED"), "order", "PO-1").ok, false);
  assert.equal(decidePurchase(techHead, p("APPROVED"), "order", "PO-1").ok, false, "approver cannot order");
  assert.equal(decidePurchase(fin, p("APPROVED"), "order", "PO-1").ok, false);
  assert.equal(decidePurchase(req, p("APPROVED"), "order", "PO-1").ok, false, "requester cannot order");
  assert.equal(decidePurchase(ops, p("APPROVED", { requesterId: "o" }), "order", "PO-1").ok, false, "Operations head cannot order their own request");
  const done = decidePurchase(ops, p("ORDERED"), "order", "PO-1");
  assert.equal(done.ok === false && done.code, "ALREADY_DONE");
});

test("receive: requester only, only once ordered", () => {
  assert.equal(decidePurchase(req, p("ORDERED"), "receive", null).ok, true);
  const early = decidePurchase(req, p("APPROVED"), "receive", null);
  assert.equal(early.ok === false && early.code, "INVALID_STATE", "cannot receive before it is ordered");
  assert.equal(decidePurchase(ops, p("ORDERED"), "receive", null).ok, false, "the orderer cannot confirm receipt for the requester");
  assert.equal(decidePurchase(techHead, p("ORDERED"), "receive", null).ok, false);
  const done = decidePurchase(req, p("RECEIVED"), "receive", null);
  assert.equal(done.ok === false && done.code, "ALREADY_DONE");
});

test("cancel: requester only, while awaiting approval or awaiting order; never once ordered", () => {
  assert.equal(decidePurchase(req, p("SUBMITTED"), "cancel", null).ok, true);
  assert.equal(decidePurchase(req, p("APPROVED"), "cancel", null).ok, true);
  assert.equal(decidePurchase(req, p("ORDERED"), "cancel", null).ok, false, "an order already placed cannot be withdrawn here");
  assert.equal(decidePurchase(req, p("RECEIVED"), "cancel", null).ok, false);
  assert.equal(decidePurchase(techHead, p("SUBMITTED"), "cancel", null).ok, false);
  assert.equal(decidePurchase(ops, p("APPROVED"), "cancel", null).ok, false);
  for (const bad of ["constructor", "__proto__", "toString", "hasOwnProperty", ""]) assert.equal(decidePurchase(req, p("SUBMITTED"), bad, null).ok, false, bad);
});

test("approve notes are optional and stored; cancel and receive store none", () => {
  const a = decidePurchase(techHead, p("SUBMITTED"), "approve", "  ok  ");
  assert.equal(a.ok && a.text, "ok");
  const c = decidePurchase(req, p("SUBMITTED"), "cancel", "ignored");
  assert.equal(c.ok && c.text, null);
});

test("available actions per role and state", () => {
  assert.deepEqual(availablePurchaseActions(techHead, p("SUBMITTED")), ["approve", "reject"]);
  assert.deepEqual(availablePurchaseActions(req, p("SUBMITTED")), ["cancel"]);
  assert.deepEqual(availablePurchaseActions(req, p("APPROVED")), ["cancel"]);
  assert.deepEqual(availablePurchaseActions(ops, p("APPROVED")), ["order"]);
  assert.deepEqual(availablePurchaseActions(req, p("ORDERED")), ["receive"]);
  assert.deepEqual(availablePurchaseActions(req, p("RECEIVED")), []);
  assert.deepEqual(availablePurchaseActions(ops, p("SUBMITTED")), []);
});

test("views and query scope", () => {
  assert.deepEqual(purchaseViews(req).map((v) => v[0]), ["mine"]);
  assert.deepEqual(purchaseViews(techHead).map((v) => v[0]), ["mine", "review"]);
  assert.deepEqual(purchaseViews(ops).map((v) => v[0]), ["mine", "review", "order", "all"]);
  assert.deepEqual(purchaseWhere(req, "all"), { requesterId: "r" }, "a plain user asking for 'all' still gets only their own");
  assert.deepEqual(purchaseWhere(req, "order"), { requesterId: "r" });
  assert.deepEqual(purchaseWhere(fin, "all"), { requesterId: "f" }, "Finance head is not Operations");
  assert.deepEqual(purchaseWhere(mgmt, "review"), { approverDepartmentId: { in: ["d-management"] }, requesterId: { not: "mg" }, status: "SUBMITTED" });
  assert.deepEqual(purchaseWhere(ops, "order"), { status: "APPROVED", requesterId: { not: "o" } });
  assert.deepEqual(purchaseWhere(ops, "all"), { status: { in: ["APPROVED", "ORDERED", "RECEIVED"] }, requesterId: { not: "o" } }, "never SUBMITTED");
  assert.equal(purchaseStatusLabel("toString"), "toString");
});

test("only an active, existing vendor may be used on an order", () => {
  assert.equal(vendorUsable({ status: "ACTIVE" }), true);
  assert.equal(vendorUsable({ status: "INACTIVE" }), false);
  assert.equal(vendorUsable(null), false);
  assert.equal(vendorUsable(undefined), false);
});
