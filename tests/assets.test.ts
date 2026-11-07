import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageAssets, canViewAssets, findSecret, validateAsset } from "../lib/assets";

const m = (slug: string, type = "MEMBER") => ({ departmentId: `d-${slug}`, type, department: { slug } });
const good = { name: " Prod  API server ", assetType: "Server", environment: "Production", url: "", ownerId: "", notes: "Hosted on OCI. Credentials are in the team vault." };

test("access: Technology members read, Technology head manages, nobody else", () => {
  const head = { id: "h", memberships: [m("technology", "HEAD")] }, mem = { id: "m", memberships: [m("technology")] };
  assert.deepEqual([canViewAssets(head), canManageAssets(head)], [true, true]);
  assert.deepEqual([canViewAssets(mem), canManageAssets(mem)], [true, false]);
  for (const u of [{ id: "a", systemRole: "ADMIN", memberships: [m("sales-and-marketing")] }, { id: "g", memberships: [m("management", "HEAD")] }, { id: "o", memberships: [m("operations", "HEAD")] }, { id: "z", memberships: [] }])
    assert.deepEqual([canViewAssets(u), canManageAssets(u)], [false, false]);
});

test("secret finder catches common secrets", () => {
  const hits = [
    "-----BEGIN RSA PRIVATE KEY-----", "AKIAIOSFODNN7EXAMPLE", "ghp_abcdefghijklmnopqrstuvwxyz0123456789", "xoxb-1234567890-abcdef", "sk-abcdefghijklmnopqrstuvwx",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123xyz", "postgres://admin:hunter2@db.internal/app", "password: hunter2", "Password = Winter2026!", "api_key=abc123def", "the token is abc123",
  ];
  for (const h of hits) assert.ok(findSecret(h), `should flag: ${h}`);
});

test("secret finder leaves ordinary notes alone", () => {
  for (const ok of ["Hosted on OCI Mumbai.", "Credentials are in the team vault.", "Renew password policy review quarterly", "Token rotation runbook is in the wiki", "https://github.com/eak/pustak", "Owner: Ravi"])
    assert.equal(findSecret(ok), null, ok);
});

test("validation accepts good input, normalises, and refuses secrets in notes, name and link", () => {
  const v = validateAsset(good);
  assert.ok(v.ok);
  if (v.ok) { assert.equal(v.name, "Prod API server"); assert.equal(v.nameKey, "prod api server"); assert.equal(v.url, null); }
  assert.equal(validateAsset({ ...good, notes: "root password: hunter22" }).ok, false);
  assert.equal(validateAsset({ ...good, name: "db secret=abc123" }).ok, false);
  assert.equal(validateAsset({ ...good, url: "https://user:pass@host.example" }).ok, false);
  const ok = validateAsset({ ...good, url: "https://github.com/eak/pustak" });
  assert.ok(ok.ok);
});

test("validation rejects bad type, environment, link scheme, control characters and prototype keys", () => {
  for (const o of [{ assetType: "Toaster" }, { assetType: "constructor" }, { environment: "Prod" }, { url: "javascript:alert(1)" }, { url: "ftp://x.io" }, { name: "x" }, { name: "A‮B" }, { notes: "x".repeat(1001) }])
    assert.equal(validateAsset({ ...good, ...o }).ok, false, JSON.stringify(o));
});
