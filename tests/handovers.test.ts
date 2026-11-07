import test from "node:test";
import assert from "node:assert/strict";
import {
  HANDOVER_ACTIONS, HANDOVER_STATUSES, RULES, MAX_TEXT, ackCutoff, ackWindowHours, ageLabel,
  availableActions, canAccessHandover, decide, isAckOverdue, parseReceiverChoice, visibleHandoverWhere,
} from "../lib/handovers";

const SENDER = "u_sender", RECEIVER = "u_receiver", OTHER = "u_other";
const h = (status: string) => ({ status, senderId: SENDER, receiverId: RECEIVER });

// ---- Acknowledgement is receiver-only (RULES 1.6, 1.7; WORKFLOWS 11) ---------------------

test("receiver can accept a pending handover", () => {
  const d = decide(h("PENDING"), RECEIVER, "accept");
  assert.deepEqual(d, { ok: true, to: "ACCEPTED", event: "accepted", text: null });
});

test("sender cannot accept on the receiver's behalf", () => {
  const d = decide(h("PENDING"), SENDER, "accept");
  assert.equal(d.ok, false);
  assert.equal(!d.ok && d.code, "FORBIDDEN");
});

test("sender cannot reject or request clarification either", () => {
  for (const a of ["reject", "request_clarification"]) {
    const d = decide(h("PENDING"), SENDER, a, "a reason");
    assert.equal(!d.ok && d.code, "FORBIDDEN", a);
  }
});

test("a third party (including a department head) cannot act", () => {
  for (const a of HANDOVER_ACTIONS) {
    const d = decide(h("PENDING"), OTHER, a, "text");
    assert.equal(!d.ok && d.code, "FORBIDDEN", a);
  }
});

test("receiver cannot perform sender-only actions", () => {
  assert.equal((decide(h("PENDING"), RECEIVER, "cancel") as { code: string }).code, "FORBIDDEN");
  assert.equal((decide(h("CLARIFICATION_REQUESTED"), RECEIVER, "respond", "x") as { code: string }).code, "FORBIDDEN");
});

// ---- Reasons (RULES 1.8) --------------------------------------------------------------

test("reject and clarification require a non-blank reason", () => {
  for (const a of ["reject", "request_clarification"]) {
    for (const t of [undefined, null, "", "   \n\t "]) {
      const d = decide(h("PENDING"), RECEIVER, a, t);
      assert.equal(!d.ok && d.code, "TEXT_REQUIRED", `${a} with ${JSON.stringify(t)}`);
    }
  }
  const ok = decide(h("PENDING"), RECEIVER, "reject", "  Out of scope  ");
  assert.deepEqual(ok, { ok: true, to: "REJECTED", event: "rejected", text: "Out of scope" });
});

test("sender's clarification answer and the completion summary are required too", () => {
  assert.equal((decide(h("CLARIFICATION_REQUESTED"), SENDER, "respond", " ") as { code: string }).code, "TEXT_REQUIRED");
  assert.equal((decide(h("ACCEPTED"), RECEIVER, "complete", "") as { code: string }).code, "TEXT_REQUIRED");
});

test("over-long text is rejected", () => {
  const d = decide(h("PENDING"), RECEIVER, "reject", "x".repeat(MAX_TEXT + 1));
  assert.equal(d.ok, false);
  assert.equal(decide(h("PENDING"), RECEIVER, "reject", "x".repeat(MAX_TEXT)).ok, true);
});

// ---- State machine (invalid transitions rejected server-side) -----------------------------

test("clarification loop: ask -> answer returns to pending and can then be accepted", () => {
  const asked = decide(h("PENDING"), RECEIVER, "request_clarification", "Which domain?");
  assert.equal(asked.ok && asked.to, "CLARIFICATION_REQUESTED");
  const answered = decide(h("CLARIFICATION_REQUESTED"), SENDER, "respond", "acme.in");
  assert.equal(answered.ok && answered.to, "PENDING");
  assert.equal(decide(h("PENDING"), RECEIVER, "accept").ok, true);
});

test("receiver cannot accept while clarification is outstanding", () => {
  const d = decide(h("CLARIFICATION_REQUESTED"), RECEIVER, "accept");
  assert.equal(!d.ok && d.code, "INVALID_STATE");
});

test("complete only from ACCEPTED; cancel only before acceptance", () => {
  assert.equal((decide(h("PENDING"), RECEIVER, "complete", "done") as { code: string }).code, "INVALID_STATE");
  assert.equal(decide(h("ACCEPTED"), RECEIVER, "complete", "done").ok, true);
  assert.equal((decide(h("ACCEPTED"), SENDER, "cancel") as { code: string }).code, "INVALID_STATE");
  assert.equal(decide(h("PENDING"), SENDER, "cancel").ok, true);
  assert.equal(decide(h("CLARIFICATION_REQUESTED"), SENDER, "cancel").ok, true);
});

test("terminal states accept nothing", () => {
  for (const s of ["REJECTED", "COMPLETED", "CANCELLED"]) {
    for (const a of HANDOVER_ACTIONS) {
      const who = RULES[a].by === "receiver" ? RECEIVER : SENDER;
      const d = decide(h(s), who, a, "text");
      assert.equal(d.ok, false, `${s} + ${a}`);
    }
  }
});

test("a repeated submission is reported as already done, not applied twice", () => {
  const d = decide(h("ACCEPTED"), RECEIVER, "accept");
  assert.equal(!d.ok && d.code, "ALREADY_DONE");
  assert.equal((decide(h("CANCELLED"), SENDER, "cancel") as { code: string }).code, "ALREADY_DONE");
  assert.equal((decide(h("REJECTED"), RECEIVER, "reject", "no") as { code: string }).code, "ALREADY_DONE");
});

test("unknown actions are rejected", () => {
  assert.equal(decide(h("PENDING"), RECEIVER, "force_accept").ok, false);
  assert.equal(decide(h("PENDING"), RECEIVER, "__proto__").ok, false);
  assert.equal(decide(h("PENDING"), RECEIVER, "toString").ok, false);
  // Regression: prototype keys used to throw for the sender/other roles instead of being rejected.
  for (const who of [SENDER, RECEIVER, OTHER]) {
    for (const a of ["toString", "constructor", "__proto__", "hasOwnProperty", ""]) {
      assert.doesNotThrow(() => decide(h("PENDING"), who, a, "x"), `${who}/${a}`);
      assert.equal(decide(h("PENDING"), who, a, "x").ok, false, `${who}/${a}`);
    }
  }
});

test("exhaustive: decide() agrees with the transition table for every status x action x role", () => {
  for (const status of HANDOVER_STATUSES) {
    for (const action of HANDOVER_ACTIONS) {
      for (const [who, id] of [["sender", SENDER], ["receiver", RECEIVER], ["other", OTHER]] as const) {
        const rule = RULES[action];
        const allowed = who === rule.by && (rule.from as string[]).includes(status);
        const d = decide(h(status), id, action, "some text");
        assert.equal(d.ok, allowed, `${status}/${action}/${who}`);
        if (d.ok) assert.equal(d.to, rule.to);
      }
    }
  }
});

test("availableActions drives the UI from the same rules", () => {
  assert.deepEqual(availableActions(h("PENDING"), RECEIVER), ["accept", "request_clarification", "reject"]);
  assert.deepEqual(availableActions(h("PENDING"), SENDER), ["cancel"]);
  assert.deepEqual(availableActions(h("CLARIFICATION_REQUESTED"), SENDER), ["respond", "cancel"]);
  assert.deepEqual(availableActions(h("ACCEPTED"), RECEIVER), ["complete"]);
  assert.deepEqual(availableActions(h("ACCEPTED"), SENDER), []);
  assert.deepEqual(availableActions(h("PENDING"), OTHER), []);
});

// ---- Access (RULES 2.3, 2.7, 2.9) ---------------------------------------------------------

const SALES = "d_sales", TECH = "d_tech", HR = "d_hr";
const ho = { senderId: SENDER, receiverId: RECEIVER, fromDepartmentId: SALES, toDepartmentId: TECH };
const viewer = (id: string, memberships: { departmentId: string; type: string }[] = []) => ({ id, memberships });

test("sender and receiver can open it", () => {
  assert.equal(canAccessHandover(viewer(SENDER), ho), true);
  assert.equal(canAccessHandover(viewer(RECEIVER), ho), true);
});

test("heads of the sending or receiving department get read access", () => {
  assert.equal(canAccessHandover(viewer(OTHER, [{ departmentId: SALES, type: "HEAD" }]), ho), true);
  assert.equal(canAccessHandover(viewer(OTHER, [{ departmentId: TECH, type: "HEAD" }]), ho), true);
});

test("plain members, unrelated heads and strangers cannot", () => {
  assert.equal(canAccessHandover(viewer(OTHER, [{ departmentId: SALES, type: "MEMBER" }, { departmentId: TECH, type: "MEMBER" }]), ho), false);
  assert.equal(canAccessHandover(viewer(OTHER, [{ departmentId: HR, type: "HEAD" }]), ho), false);
  assert.equal(canAccessHandover(viewer(OTHER), ho), false);
});

test("ID tampering: a head of an unrelated department cannot read another department's handover", () => {
  const hrHead = viewer("u_hr_head", [{ departmentId: HR, type: "HEAD" }]);
  assert.equal(canAccessHandover(hrHead, ho), false);
});

test("visibleHandoverWhere only widens for HEAD memberships", () => {
  const plain = visibleHandoverWhere(viewer(OTHER, [{ departmentId: SALES, type: "MEMBER" }]));
  assert.deepEqual(plain, { OR: [{ senderId: OTHER }, { receiverId: OTHER }] });
  const head = visibleHandoverWhere(viewer(OTHER, [{ departmentId: SALES, type: "HEAD" }]));
  assert.deepEqual(head, {
    OR: [{ senderId: OTHER }, { receiverId: OTHER }, { fromDepartmentId: { in: [SALES] } }, { toDepartmentId: { in: [SALES] } }],
  });
});

// ---- Escalation window (configurable) ---------------------------------------------------

test("ack window defaults to 24h and is configurable via HANDOVER_ACK_HOURS", () => {
  const prev = process.env.HANDOVER_ACK_HOURS;
  try {
    delete process.env.HANDOVER_ACK_HOURS;
    assert.equal(ackWindowHours(), 24);
    process.env.HANDOVER_ACK_HOURS = "4";
    assert.equal(ackWindowHours(), 4);
    for (const bad of ["0", "-3", "abc", ""]) { process.env.HANDOVER_ACK_HOURS = bad; assert.equal(ackWindowHours(), 24, bad); }
  } finally {
    if (prev === undefined) delete process.env.HANDOVER_ACK_HOURS; else process.env.HANDOVER_ACK_HOURS = prev;
  }
});

test("only PENDING handovers older than the window are flagged as not acknowledged", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  const old = new Date("2026-11-07T11:59:00Z");   // 24h01m ago
  const fresh = new Date("2026-11-07T12:01:00Z"); // 23h59m ago
  assert.equal(isAckOverdue({ status: "PENDING", sentAt: old }, now, 24), true);
  assert.equal(isAckOverdue({ status: "PENDING", sentAt: fresh }, now, 24), false);
  assert.equal(isAckOverdue({ status: "PENDING", sentAt: fresh }, now, 12), true);
  for (const s of ["CLARIFICATION_REQUESTED", "ACCEPTED", "REJECTED", "COMPLETED", "CANCELLED"]) {
    assert.equal(isAckOverdue({ status: s, sentAt: old }, now, 24), false, s);
  }
  assert.equal(ackCutoff(now, 24).toISOString(), "2026-11-07T12:00:00.000Z");
});

test("ageLabel", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  assert.equal(ageLabel(new Date("2026-11-08T11:30:00Z"), now), "30m");
  assert.equal(ageLabel(new Date("2026-11-08T07:00:00Z"), now), "5h");
  assert.equal(ageLabel(new Date("2026-11-05T12:00:00Z"), now), "3d");
  assert.equal(ageLabel(new Date("2026-11-09T12:00:00Z"), now), "0m"); // clock skew never goes negative
});

test("parseReceiverChoice only accepts exactly dept|user", () => {
  assert.deepEqual(parseReceiverChoice("d1|u1"), { toDepartmentId: "d1", receiverId: "u1" });
  for (const bad of ["", "d1", "d1|", "|u1", "d1|u1|x"]) assert.equal(parseReceiverChoice(bad), null, bad);
});
