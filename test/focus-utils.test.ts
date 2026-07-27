import test from "node:test";
import assert from "node:assert/strict";
import {
  adjustActiveFocusSession,
  dedupeCategoriesByName,
  isUuid,
  normalizeFocusCategoriesForPersistence,
  preferStoredOptionalValue,
  preferStoredValue,
  sanitizeFocusLabel,
  sanitizeOptionalFocusLabel,
} from "../src/lib/focus-utils.ts";

test("focus utils sanitize and prefer values consistently", () => {
  assert.equal(sanitizeFocusLabel("  Work  ", "Fallback"), "Work");
  assert.equal(sanitizeFocusLabel("   ", "Fallback"), "Fallback");
  assert.equal(sanitizeOptionalFocusLabel("  Deep Work "), "Deep Work");
  assert.equal(sanitizeOptionalFocusLabel("   "), null);
  assert.equal(preferStoredValue("Stored", "Current"), "Current");
  assert.equal(preferStoredValue("Stored", ""), "Stored");
  assert.equal(preferStoredOptionalValue("Stored", "Current"), "Current");
  assert.equal(preferStoredOptionalValue("Stored", ""), "Stored");
});

test("focus utils dedupe categories by normalized title and validate uuids", () => {
  const categories = dedupeCategoriesByName([
    { id: "1", title: "Work", focusType: "Work", focusSubtype: null, focusSubtype2: null, color: "#000", icon: "Brain", dailyGoalSeconds: null, weeklyGoalSeconds: null },
    { id: "2", title: " work ", focusType: "Work", focusSubtype: null, focusSubtype2: null, color: "#111", icon: "Brain", dailyGoalSeconds: null, weeklyGoalSeconds: null },
    { id: "3", title: "Home", focusType: "Life", focusSubtype: null, focusSubtype2: null, color: "#222", icon: "Home", dailyGoalSeconds: null, weeklyGoalSeconds: null },
  ]);

  assert.equal(categories.length, 2);
  assert.equal(categories[0].id, "2");
  assert.equal(categories[1].id, "3");
  assert.equal(isUuid("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isUuid("not-a-uuid"), false);
});

test("new focus categories get raw UUIDs before timer persistence uses them", () => {
  const persisted = normalizeFocusCategoriesForPersistence([
    {
      id: "focus-category-4c7633f7-b279-4ffb-99cb-3d38c35b6a47",
      title: "Deep Work",
      focusType: "Work",
      focusSubtype: "Productive",
      focusSubtype2: null,
      color: "#6f57f6",
      icon: "Code",
      dailyGoalSeconds: null,
      weeklyGoalSeconds: null,
    },
  ], () => "550e8400-e29b-41d4-a716-446655440000");

  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].id, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(isUuid(persisted[0].id), true);
  assert.equal(persisted[0].id.startsWith("focus-category-"), false);

  const runtimeCreatePayload = {
    p_action: "create",
    p_category_id: persisted[0].id,
  };

  assert.equal(runtimeCreatePayload.p_category_id, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(isUuid(String(runtimeCreatePayload.p_category_id)), true);
});

test("focus timer adjustments include live elapsed time and preserve running state", () => {
  const nowMs = 100_000;
  const running = {
    categoryId: "work",
    startTime: 70_000,
    accumulatedSeconds: 120,
    isRunning: true,
  };

  const added = adjustActiveFocusSession(running, 300, nowMs);
  assert.deepEqual(added, {
    categoryId: "work",
    startTime: nowMs,
    accumulatedSeconds: 450,
    isRunning: true,
  });

  const addedAgain = adjustActiveFocusSession(added, 300, nowMs);
  assert.equal(addedAgain.accumulatedSeconds, 750);

  const subtracted = adjustActiveFocusSession(addedAgain, -600, nowMs);
  assert.equal(subtracted.accumulatedSeconds, 150);
  assert.equal(subtracted.isRunning, true);
});

test("focus timer subtraction clamps at zero and continues running", () => {
  const adjusted = adjustActiveFocusSession({
    categoryId: "work",
    startTime: 95_000,
    accumulatedSeconds: 10,
    isRunning: true,
  }, -300, 100_000);

  assert.deepEqual(adjusted, {
    categoryId: "work",
    startTime: 100_000,
    accumulatedSeconds: 0,
    isRunning: true,
  });
});
