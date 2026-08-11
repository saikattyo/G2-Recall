import assert from "node:assert/strict";
import test from "node:test";
import { DAY_MS, MINUTE_MS, normalizeReviewState, scheduleCard } from "./scheduler.js";

const NOW = Date.UTC(2026, 0, 1, 9, 0, 0);

test("new cards use short learning steps before graduating", () => {
  const firstGood = scheduleCard({}, "good", NOW);
  assert.equal(firstGood.state, "learning");
  assert.equal(firstGood.learningStep, 1);
  assert.equal(firstGood.dueAt, NOW + 10 * MINUTE_MS);

  const graduated = scheduleCard(firstGood, "good", NOW);
  assert.equal(graduated.state, "review");
  assert.equal(graduated.intervalDays, 1);
  assert.equal(graduated.dueAt, NOW + DAY_MS);
});

test("again returns a review card to relearning", () => {
  const failed = scheduleCard({
    state: "review",
    intervalDays: 20,
    ease: 2.5,
    reps: 5,
    lapses: 1
  }, "again", NOW);

  assert.equal(failed.state, "relearning");
  assert.equal(failed.intervalDays, 5);
  assert.equal(failed.lapses, 2);
  assert.equal(failed.dueAt, NOW + 10 * MINUTE_MS);

  const recovered = scheduleCard(failed, "good", NOW);
  assert.equal(recovered.state, "review");
  assert.equal(recovered.intervalDays, 5);
  assert.equal(recovered.dueAt, NOW + 5 * DAY_MS);
});

test("legacy review data remains usable", () => {
  const legacy = normalizeReviewState({
    grade: "good",
    intervalDays: 3,
    ease: 2.5,
    reps: 2
  });

  assert.equal(legacy.state, "review");
  assert.equal(legacy.learningStep, 0);
  assert.equal(scheduleCard(legacy, "good", NOW).intervalDays, 8);
});

