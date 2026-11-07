import { test } from "node:test";
import assert from "node:assert/strict";
import { techContentSecretProblem } from "../lib/assets";

const tech = { scope: "DEPARTMENTS", departmentSlugs: ["technology"] };

test("Technology-addressed content: secrets are refused in title and body", () => {
  assert.ok(techContentSecretProblem(tech, "Restore runbook", "Connect with postgres://admin:pw@db/app"));
  assert.ok(techContentSecretProblem(tech, "Deploy", "The api_key: abc12345 goes in the header"));
  assert.ok(techContentSecretProblem(tech, "ghp_abcdefghijklmnopqrstuvwxyz0123", "steps"));
  assert.ok(techContentSecretProblem({ scope: "DEPARTMENTS", departmentSlugs: ["sales-and-marketing", "technology"] }, "x", "-----BEGIN RSA PRIVATE KEY-----"));
});

test("ordinary SOP text and other audiences are not checked", () => {
  assert.equal(techContentSecretProblem(tech, "Restore runbook", "Credentials are kept in the team vault. Ask the Technology head."), null);
  assert.equal(techContentSecretProblem({ scope: "DEPARTMENTS", departmentSlugs: ["human-resources"] }, "x", "password: hunter22"), null);
  assert.equal(techContentSecretProblem({ scope: "ALL", departmentSlugs: [] }, "x", "password: hunter22"), null);
});
