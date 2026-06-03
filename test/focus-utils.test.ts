import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeCategoriesByName,
  isUuid,
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
