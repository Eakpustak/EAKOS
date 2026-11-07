import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canViewPipelineSummary, closedWindowStart, countFor, openLeadTotal, sharePercent, stageBreakdown, winRatePercent,
} from "../lib/pipeline";

const m = (slug: string, type = "MEMBER") => ({ type, department: { slug } });

test("only the Sales head or the Management head may see the summary", () => {
  assert.equal(canViewPipelineSummary({ memberships: [m("sales-and-marketing", "HEAD")] }), true);
  assert.equal(canViewPipelineSummary({ memberships: [m("management", "HEAD")] }), true);
  assert.equal(canViewPipelineSummary({ memberships: [m("sales-and-marketing")] }), false, "plain Sales member");
  assert.equal(canViewPipelineSummary({ memberships: [m("management")] }), false, "plain Management member");
  assert.equal(canViewPipelineSummary({ memberships: [m("technology", "HEAD")] }), false, "other department head");
  assert.equal(canViewPipelineSummary({ memberships: [] }), false);
  assert.equal(canViewPipelineSummary({ memberships: [{ type: "HEAD", department: null }] }), false);
  assert.equal(canViewPipelineSummary({ memberships: [{ type: "HEAD" }] }), false);
});

test("administrator role alone grants nothing", () => {
  // the policy takes no role argument at all; a type-level guarantee that ADMIN cannot widen access
  assert.equal(canViewPipelineSummary({ memberships: [], ...({ systemRole: "ADMIN" } as object) } as never), false);
});

test("stage breakdown is ordered, zero-filled, merges duplicates and ignores unknown stages", () => {
  const rows = stageBreakdown([
    { stage: "WON", count: 2 }, { stage: "NEW", count: 3 }, { stage: "NEW", count: 1 },
    { stage: "BOGUS", count: 99 }, { stage: "toString", count: 5 },
  ]);
  assert.deepEqual(rows.map((r) => r.stage), ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"]);
  assert.deepEqual(rows.map((r) => r.count), [4, 0, 0, 0, 2, 0]);
  assert.equal(rows.find((r) => r.stage === "NEW")?.open, true);
  assert.equal(rows.find((r) => r.stage === "WON")?.open, false);
  assert.equal(rows.find((r) => r.stage === "LOST")?.open, false);
});

test("open total counts only open stages", () => {
  const rows = stageBreakdown([{ stage: "NEW", count: 2 }, { stage: "PROPOSAL", count: 1 }, { stage: "WON", count: 7 }, { stage: "LOST", count: 4 }]);
  assert.equal(openLeadTotal(rows), 3);
});

test("win rate is null with no closed leads, otherwise a whole percent", () => {
  assert.equal(winRatePercent(0, 0), null);
  assert.equal(winRatePercent(1, 2), 33);
  assert.equal(winRatePercent(2, 1), 67);
  assert.equal(winRatePercent(0, 3), 0);
  assert.equal(winRatePercent(3, 0), 100);
});

test("share percent never divides by zero", () => {
  assert.equal(sharePercent(1, 0), 0);
  assert.equal(sharePercent(1, 4), 25);
});

test("closed window is 30 days; countFor sums matching keys only", () => {
  const now = new Date("2026-11-30T00:00:00Z");
  assert.equal(now.getTime() - closedWindowStart(now).getTime(), 30 * 86_400_000);
  assert.equal(countFor([{ key: "A", count: 2 }, { key: "B", count: 5 }, { key: "A", count: 1 }], "A"), 3);
  assert.equal(countFor([], "A"), 0);
});
