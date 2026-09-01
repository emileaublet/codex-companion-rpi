import test from "node:test";
import assert from "node:assert/strict";
import { exactlyThreeThreadCards, newestThreadCards, sanitizeText, statusType, toThreadCard } from "../packages/thread-view.mjs";

test("statusType maps approval requests to waiting", () => {
  assert.equal(statusType({ type: "active", activeFlags: ["waitingOnApproval"] }), "waiting");
  assert.equal(statusType({ type: "active", activeFlags: ["waitingOnUserInput"] }), "waiting");
});

test("toThreadCard prefers the user-facing name and limits private payload", () => {
  assert.deepEqual(toThreadCard({
    id: "thr_1",
    name: "Fix the updater",
    preview: "Review atomic release switching",
    updatedAt: 42,
    status: { type: "idle" },
    turns: [{ secret: "must not leak" }]
  }), {
    id: "thr_1",
    title: "Fix the updater",
    summary: "Review atomic release switching",
    updatedAt: 42,
    status: "idle"
  });
});

test("newestThreadCards sorts by activity and returns only the requested count", () => {
  const cards = newestThreadCards([
    { id: "old", preview: "Old", updatedAt: 1 },
    { id: "new", preview: "New", updatedAt: 3 },
    { id: "mid", preview: "Mid", updatedAt: 2 }
  ], 2);
  assert.deepEqual(cards.map((card) => card.id), ["new", "mid"]);
});

test("sanitization removes terminal escapes, paths, tags, and credential-shaped values", () => {
  const value = "\u001b[31m<em>/Users/emile/private.txt</em> token=secret-value\u001b[0m";
  const safe = sanitizeText(value, 240);
  assert.equal(safe, "[path] [redacted]");
  assert.doesNotMatch(safe, /\u001b|<|\/Users|secret-value/);
});

test("exactlyThreeThreadCards pads a short result with safe empty cards", () => {
  const cards = exactlyThreeThreadCards([{ id: "one", name: "One", updatedAt: 2 }]);
  assert.equal(cards.length, 3);
  assert.equal(cards[0].id, "one");
  assert.equal(cards[1].status, "empty");
  assert.equal(cards[2].status, "empty");
});
