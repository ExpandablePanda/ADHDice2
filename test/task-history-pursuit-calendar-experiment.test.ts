import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PursuitCalendarDay,
  PursuitCalendarPresentation,
} from "../src/components/task-app/pursuit-calendar-presentation.tsx";

const pursuitSource = readFileSync(new URL("../src/components/task-app/pursuits-workspace.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const modal = modalSource.slice(modalSource.indexOf("export function TaskHistoryModal"), modalSource.indexOf("\nexport function BottomDockAdapter"));

test("shared Pursuit presentation preserves the calendar geometry and history layout", () => {
  const markup = renderToStaticMarkup(createElement(PursuitCalendarPresentation, {
    ariaLabel: "Pursuit calendar",
    description: "Completed days and their notes in one place.",
    historyEntries: [{ key: "2026-09-08", label: "Sep 8, 2026", status: createElement("span", null, "Completed") }],
    historySummary: [{ label: "Completed days", value: "1" }],
    monthDays: [null, "2026-09-01"],
    monthLabel: "September 2026",
    onChangeMonth: () => undefined,
    renderDay: (day, index) => createElement(PursuitCalendarDay, { day, key: day ?? `blank-${index}` }),
    selectedDayAction: createElement("button", { type: "button" }, "Mark Completed"),
    selectedDayLabel: "Sep 8, 2026",
    selectedDayStatus: "Completed",
  }));

  assert.match(markup, /min-h-10/);
  assert.match(markup, /rounded-\[0\.7rem\]/);
  assert.match(markup, /Sun/);
  assert.match(markup, /Pursuit history/);
  assert.match(markup, /Completed days/);
  assert.match(markup, /Mark Completed/);
});

test("Task History uses the shared Pursuit presentation above the unchanged Task calendar", () => {
  assert.match(pursuitSource, /PursuitCalendarPresentation/);
  assert.match(modal, /const experimentalCalendarSection = calendarRead/);
  assert.match(modal, /historyRows\.map/);
  assert.match(modal, /calendarRead\.states/);
  assert.match(modal, /selectedDateSet\.has\(dateKey\)/);
  assert.match(modal, /if \(dateKey\) selectDate\(dateKey\)/);
  assert.ok(modal.includes("experimentalCalendarSection}{renderCalendarSection()"));
  assert.ok(modal.indexOf("experimentalCalendarSection") < modal.indexOf("renderCalendarSection"));
  assert.match(modal, /<CalendarMonthPresentation/);
  assert.match(modal, /Task Status History/);
  assert.doesNotMatch(modal, /onMarkCompletedOnLogicalDay/);
});

test("Task experiment keeps Task status adaptation and mutation ownership separate from Pursuits", () => {
  assert.match(modal, /Done/);
  assert.match(modal, /Did My Best/);
  assert.match(modal, /Missed/);
  assert.match(modal, /Delayed/);
  assert.match(modal, /Marked Complete/);
  assert.match(modal, /Not Due/);
  assert.match(modal, /onSetStatuses/);
  assert.match(modal, /onSetDelayedStatus/);
  assert.match(modal, /onSetCalendarOverride/);
  assert.match(modal, /history: normalizedTaskHistory/);
  assert.doesNotMatch(modal, /onMarkDoneToday|onRemoveCompletionOnLogicalDay/);
});
