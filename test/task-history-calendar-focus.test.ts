import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildTaskHistoryCalendarDateKeys,
  getTaskHistoryInitialFocusDateKey,
} from "../src/lib/task-history-calendar-focus.ts";
import { shiftDateKey } from "../src/lib/task-grid-layout.ts";

const modalSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const taskHistoryModalSource = modalSource.slice(modalSource.indexOf("export function TaskHistoryModal"));
const taskCompleteSource = readFileSync(new URL("../src/lib/task-complete.ts", import.meta.url), "utf8");

test("task history focus prefers an explicitly selected date and otherwise uses today", () => {
  assert.equal(getTaskHistoryInitialFocusDateKey({ initialDateKey: "2026-07-04", todayDateKey: "2026-07-12" }), "2026-07-04");
  assert.equal(getTaskHistoryInitialFocusDateKey({ initialDateKey: null, todayDateKey: "2026-07-12" }), "2026-07-12");
});

test("History Calendar covers full Monday-Sunday weeks for every today weekday", () => {
  const monday = "2026-08-17";

  for (let weekdayOffset = 0; weekdayOffset < 7; weekdayOffset += 1) {
    const today = shiftDateKey(monday, weekdayOffset);
    const dates = buildTaskHistoryCalendarDateKeys(today);
    const weekday = (dateKey: string) => new Date(`${dateKey}T00:00:00Z`).getUTCDay();
    const requestedInitialFocusDate = shiftDateKey(today, -40);

    assert.equal(weekday(dates[0]), 1, `first date should be Monday for ${today}`);
    assert.equal(weekday(dates.at(-1) ?? ""), 0, `last date should be Sunday for ${today}`);
    assert.equal(dates.length % 7, 0);
    assert.ok(dates.includes(today));
    assert.ok(dates.includes(shiftDateKey(today, -139)));
    assert.ok(dates.includes(shiftDateKey(today, 42)));
    assert.ok(dates.includes(getTaskHistoryInitialFocusDateKey({ initialDateKey: requestedInitialFocusDate, todayDateKey: today })));

    for (let rowStart = 0; rowStart < dates.length; rowStart += 7) {
      assert.equal(weekday(dates[rowStart]), 1);
      assert.equal(weekday(dates[rowStart + 6]), 0);
    }
  }
});

test("Task History opens its month calendar at the requested date", () => {
  assert.match(taskHistoryModalSource, /taskHistoryLoadStatus = "ready"/);
  assert.match(taskHistoryModalSource, /const initialSelectedDate = initialFocusDate/);
  assert.match(taskHistoryModalSource, /getTaskCalendarMonth\(new Date\(`\$\{initialSelectedDate\}T12:00:00`\)\)/);
});

test("Task History uses the shared month presentation and bounded navigation", () => {
  assert.match(taskHistoryModalSource, /<CalendarMonthPresentation/);
  assert.match(taskHistoryModalSource, /getTaskCalendarMonthGrid\(displayedMonth\)/);
  assert.match(taskHistoryModalSource, /formatTaskCalendarMonth\(displayedMonth\)/);
  assert.match(taskHistoryModalSource, /previousMonthDisabled=/);
  assert.match(taskHistoryModalSource, /nextMonthDisabled=/);
  assert.doesNotMatch(taskHistoryModalSource, /const weeks: string\[\]\[\] = \[\]/);
  assert.doesNotMatch(taskHistoryModalSource, /inline-flex w-max gap-1\.5/);
});

test("History Calendar is canonical-only and fails closed without a canonical read", () => {
  const dueDateSelection = taskHistoryModalSource.indexOf("const selectedIsDue =");
  const warningCopy = taskHistoryModalSource.indexOf("This date is outside the inferred due schedule");

  assert.ok(dueDateSelection >= 0);
  assert.ok(warningCopy > dueDateSelection);
  assert.match(taskHistoryModalSource, /const calendarRead = stateEngineContext\s*\?\s*resolveTaskHistoryCalendarRead/);
  assert.doesNotMatch(taskHistoryModalSource, /buildTaskHistoryCalendarDueDateSet|getTaskHistoryCalendarVirtualState/);
  assert.match(taskHistoryModalSource, /Calendar is unavailable until canonical Task State is ready/);
  assert.match(taskHistoryModalSource, /mobileSection === "calendar" \? calendarRead \?/);
  assert.match(taskHistoryModalSource, /calendarRead\?\.states\[dateKey\]/);
});

test("History Calendar applies multi-select Not Due sequentially and excludes future dates", () => {
  assert.match(taskHistoryModalSource, /selectedDates, task, todayDateKey: today/);
  assert.match(taskHistoryModalSource, /selectedDates\.filter\(\(dateKey\) => dateKey <= today\)/);
  assert.match(taskHistoryModalSource, /for \(const dateKey of targetDates\)/);
  assert.match(taskHistoryModalSource, /await onSetCalendarOverride\(dateKey, overrideState\)/);
  assert.match(taskHistoryModalSource, /overrideState !== "not_due"/);
  assert.match(taskCompleteSource, /configuredStatuses\.filter\(\(status\) => status !== "complete" && status !== "delayed"\)/);
  assert.match(taskHistoryModalSource, /const isSavingRef = useRef\(false\)/);
  assert.match(taskHistoryModalSource, /if \(completed === false\) break/);
});

test("TaskHistoryModal keeps the canonical projection range for month rendering", () => {
  assert.match(taskHistoryModalSource, /const days = buildTaskHistoryCalendarDateKeys\(today\);/);
  assert.match(taskHistoryModalSource, /calendarEnd: days\.at\(-1\) \?\? today/);
  assert.match(taskHistoryModalSource, /calendarStart: days\[0\] \?\? today/);
  assert.match(taskHistoryModalSource, /const knownDateKeys = new Set\(days\)/);
});
