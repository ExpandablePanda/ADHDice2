import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "../src/lib/database.types.ts";
import {
  formatTaskCalendarTime,
  getTaskCalendarMonthGrid,
  groupTasksByCalendarDate,
  parseTaskCalendarTime,
  shiftTaskCalendarMonth,
} from "../src/lib/task-calendar.ts";

type CalendarTestTask = Pick<Task, "due_on" | "due_time" | "id">;

function task(id: string, dueOn: string | null, dueTime: string | null = null): CalendarTestTask {
  return { due_on: dueOn, due_time: dueTime, id };
}

test("calendar month grids always run Monday through Sunday", () => {
  const august = getTaskCalendarMonthGrid({ month: 7, year: 2026 });
  assert.equal(august.length, 42);
  assert.deepEqual(august.slice(0, 7).map((day) => day.dateKey), [
    "2026-07-27",
    "2026-07-28",
    "2026-07-29",
    "2026-07-30",
    "2026-07-31",
    "2026-08-01",
    "2026-08-02",
  ]);
  assert.equal(august[0]?.date.getDay(), 1);
  assert.equal(august[6]?.date.getDay(), 0);

  const mondayStart = getTaskCalendarMonthGrid({ month: 5, year: 2026 });
  assert.equal(mondayStart.length, 35);
  assert.deepEqual(mondayStart.slice(0, 2).map((day) => day.dateKey), ["2026-06-01", "2026-06-02"]);

  const fiveWeekMinimum = getTaskCalendarMonthGrid({ month: 1, year: 2021 });
  assert.equal(fiveWeekMinimum.length, 35);
  assert.equal(fiveWeekMinimum[0]?.dateKey, "2021-02-01");
  assert.equal(fiveWeekMinimum.at(-1)?.dateKey, "2021-03-07");

  const sundayStart = getTaskCalendarMonthGrid({ month: 1, year: 2026 });
  assert.equal(sundayStart.length, 35);
  assert.equal(sundayStart[0]?.dateKey, "2026-01-26");
  assert.equal(sundayStart.at(-1)?.dateKey, "2026-03-01");
});

test("calendar month navigation crosses year boundaries", () => {
  assert.deepEqual(shiftTaskCalendarMonth({ month: 11, year: 2026 }, 1), { month: 0, year: 2027 });
  assert.deepEqual(shiftTaskCalendarMonth({ month: 0, year: 2027 }, -1), { month: 11, year: 2026 });
});

test("calendar groups only due dates and sorts timed tasks before untimed tasks", () => {
  const groups = groupTasksByCalendarDate([
    task("untimed-a", "2026-08-10"),
    task("late", "2026-08-10", "15:00"),
    task("early", "2026-08-10", "08:00"),
    task("same-time", "2026-08-10", "08:00"),
    task("untimed-b", "2026-08-10", ""),
    task("no-date", null, "09:00"),
  ]);

  assert.deepEqual(groups.get("2026-08-10")?.map((entry) => entry.id), [
    "early",
    "same-time",
    "late",
    "untimed-a",
    "untimed-b",
  ]);
  assert.equal(groups.has("no-date"), false);
});

test("calendar time formatting reads the stored task time", () => {
  assert.equal(parseTaskCalendarTime("14:30"), 870);
  assert.equal(parseTaskCalendarTime("14:30:00"), 870);
  assert.equal(parseTaskCalendarTime("25:00"), null);
  assert.match(formatTaskCalendarTime("14:30", "en-US") ?? "", /2:30 PM/);
  assert.equal(formatTaskCalendarTime(null), null);
});
