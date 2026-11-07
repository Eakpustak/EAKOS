import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageVendors, canViewVendors, changedFields, validateVendor, vendorNameKey, vendorStatusLabel } from "../lib/vendors";

const m = (slug: string, type = "MEMBER") => ({ departmentId: `d-${slug}`, type, department: { slug } });
const ops = { id: "o", memberships: [m("operations", "HEAD")] };
const opsMember = { id: "om", memberships: [m("operations")] };
const fin = { id: "f", memberships: [m("finance-and-administration", "HEAD")] };
const finMember = { id: "fm", memberships: [m("finance-and-administration")] };
const mgmt = { id: "mg", memberships: [m("management", "HEAD")] };
const emp = { id: "e", memberships: [m("technology")] };
const good = { name: "Acme Hosting", category: "Hosting and domains", contactName: "", email: "", phone: "", notes: "" };

test("access: Operations head manages; Finance head reads; nobody else", () => {
  assert.deepEqual([canViewVendors(ops), canManageVendors(ops)], [true, true]);
  assert.deepEqual([canViewVendors(fin), canManageVendors(fin)], [true, false], "Finance reads only");
  for (const u of [opsMember, finMember, mgmt, emp, { id: "z", memberships: [] }, { id: "z", memberships: [{ departmentId: "d", type: "HEAD", department: null }] }]) {
    assert.deepEqual([canViewVendors(u), canManageVendors(u)], [false, false]);
  }
});

test("name key ignores case, spacing and compatibility forms", () => {
  assert.equal(vendorNameKey("  Acme   Hosting "), "acme hosting");
  assert.equal(vendorNameKey("ACME HOSTING"), vendorNameKey("acme hosting"));
  assert.equal(vendorNameKey("Ａcme"), "acme", "full-width letter folds to ASCII");
  assert.equal(vendorNameKey("A B"), "a b", "non-breaking space collapses");
});

test("validation accepts good input and normalises it", () => {
  const r = validateVendor({ ...good, name: "  Acme   Hosting ", email: " sales@acme.io ", phone: "+91 98765-43210", contactName: " Ravi ", notes: " ok " });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual([r.name, r.nameKey, r.email, r.phone, r.contactName, r.notes], ["Acme Hosting", "acme hosting", "sales@acme.io", "+91 98765-43210", "Ravi", "ok"]);
  const empty = validateVendor(good);
  assert.ok(empty.ok && empty.email === null && empty.phone === null && empty.contactName === null && empty.notes === null);
});

test("validation refuses bad input", () => {
  const bad: Partial<typeof good>[] = [
    { name: "A" }, { name: "   " }, { name: "x".repeat(121) }, { category: "Gifts" }, { category: "constructor" },
    { email: "nope" }, { email: "a@b" }, { email: "a b@c.io" }, { email: "a@b.io,c@d.io" }, { email: "<x>@y.io" }, { email: `${"a".repeat(200)}@b.io` },
    { phone: "abc" }, { phone: "12" }, { phone: "+91 98765-43210 ext 5" }, { phone: "1".repeat(31) },
    { notes: "x".repeat(1001) }, { contactName: "x".repeat(121) },
    { name: "Acme‮gnp" }, { name: "Acme\u0000" }, { notes: "a\u0007b" },
  ];
  for (const b of bad) assert.equal(validateVendor({ ...good, ...b }).ok, false, JSON.stringify(b));
  assert.equal(validateVendor({ ...good, notes: "line1\nline2\ttab" }).ok, true, "newlines and tabs are fine in notes");
});

test("audit helper lists field names, not values", () => {
  assert.deepEqual(changedFields({ name: "A", email: null, phone: "1" }, { name: "A", email: "x@y.io", phone: "2" }), ["email", "phone"]);
  assert.deepEqual(changedFields({ email: null }, { email: null }), []);
  assert.deepEqual(changedFields({ email: undefined }, { email: null }), [], "missing and null are the same");
  assert.equal(vendorStatusLabel("toString"), "toString");
});
