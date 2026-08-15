import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getTaskRepeatCategory, isWeekdaysRepeatSelection } from "../src/lib/task-repeat.ts";

test("exact Weekdays is its own structured Repeat category", () => {
  assert.equal(isWeekdaysRepeatSelection("weekly", [1, 2, 3, 4, 5], 1), true);
  assert.equal(getTaskRepeatCategory("weekly", [1, 2, 3, 4, 5], 1), "weekdays");
  assert.equal(getTaskRepeatCategory("weekly", [1, 2, 3, 4, 5, 6], 1), "weekly");
  assert.equal(getTaskRepeatCategory("weekly", [1, 2, 3, 4, 5], 2), "weekly");
});
test("Repeat has normal Weekdays category controls and no dedicated Weekdays-first sort", () => {
  const source = readFileSync(new URL("../src/components/ui/task-management-table-v2.tsx", import.meta.url), "utf8");
  assert.match(source, /value: "weekdays"/);
  assert.match(source, /structuredFilters\.repeat\.includes\(getTaskRepeatCategory/);
  assert.doesNotMatch(source, /repeat_weekdays_first|Weekdays first/);
});
