import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  PursuitCalendarDay,
  PursuitCalendarPresentation,
} from "../src/components/task-app/pursuit-calendar-presentation.tsx";

const calendarPresentationSource = readFileSync(new URL("../src/components/task-app/pursuit-calendar-presentation.tsx", import.meta.url), "utf8");
const pursuitSource = readFileSync(new URL("../src/components/task-app/pursuits-workspace.tsx", import.meta.url), "utf8");
const modalSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const modal = modalSource.slice(modalSource.indexOf("export function TaskHistoryModal"), modalSource.indexOf("\nexport function BottomDockAdapter"));

function renderCalendar(historyTitle: string, historyDescription: string) {
  return renderToStaticMarkup(createElement(PursuitCalendarPresentation, {
    ariaLabel: `${historyTitle} calendar`,
    description: "Calendar description",
    historyDescription,
    historyEntries: [{ key: "2026-09-08", label: "Sep 8, 2026", status: createElement("span", null, "Completed") }],
    historySummary: [{ label: "Completed days", value: "1" }],
    historyTitle,
    monthDays: [null, "2026-09-01"],
    monthLabel: "September 2026",
    onChangeMonth: () => undefined,
    renderDay: (day) => createElement(PursuitCalendarDay, { day }),
    selectedDayAction: createElement("button", { type: "button" }, "Mark Completed"),
    selectedDayLabel: "Sep 8, 2026",
    selectedDayStatus: "Completed",
  }));
}

test("shared calendar keeps the approved compact geometry and caller-owned history copy", () => {
  const taskMarkup = renderCalendar("Task History", "Chronological task outcomes, due dates, and attached notes.");
  const pursuitMarkup = renderCalendar("Pursuit History", "Chronological completed days and attached notes.");

  assert.match(taskMarkup, /min-h-10/);
  assert.match(taskMarkup, /rounded-\[0\.7rem\]/);
  assert.match(taskMarkup, /Sun/);
  assert.match(taskMarkup, /Task History/);
  assert.match(taskMarkup, /Chronological task outcomes/);
  assert.match(taskMarkup, /Mark Completed/);
  assert.match(pursuitMarkup, /Pursuit History/);
  assert.match(pursuitMarkup, /Chronological completed days/);
  assert.doesNotMatch(taskMarkup, /Pursuit History/);
});

test("Task History uses only the promoted Pursuit-style calendar presentation", () => {
  assert.match(modal, /const taskCalendarSection = calendarRead/);
  assert.match(modal, /historyRows\.map/);
  assert.match(modal, /calendarRead\.states/);
  assert.match(modal, /selectedDateSet\.has\(dateKey\)/);
  assert.match(modal, /if \(dateKey\) selectDate\(dateKey\)/);
  assert.match(modal, /<PursuitCalendarPresentation/);
  assert.match(modal, /historyTitle="Task History"/);
  assert.match(modal, /historyDescription="Chronological task outcomes/);
  assert.match(modal, /<header className="flex shrink-0/);
  assert.match(modal, /tracking-\[0\.22em\].*Task<\/p>/s);
  assert.match(modal, /text-xl font-semibold.*\{taskTitle\}/s);
  assert.doesNotMatch(modal, /CalendarMonthPresentation|Edit Selected Date|Task Status History/);
  assert.doesNotMatch(modal, /Pursuit-style Task Calendar|Exact Pursuit calendar presentation/);
});

test("shared month slots have stable keys without a visible wrapper", () => {
  const warnings: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    renderCalendar("Pursuit History", "Chronological completed days and attached notes.");
  } finally {
    console.error = originalConsoleError;
  }

  assert.match(calendarPresentationSource, /monthDays\.map\(\(day, index\) => <Fragment key=\{day \?\? `blank-\$\{index\}`\}>\{renderDay\(day, index\)\}<\/Fragment>\)/);
  assert.doesNotMatch(calendarPresentationSource, /monthDays\.map\(\(day, index\) => renderDay\(day, index\)\)/);
  assert.doesNotMatch(warnings.join("\n"), /Each child in a list should have a unique.*key/i);
});

test("Task calendar keeps Task history projections and mutation ownership separate from Pursuits", () => {
  assert.match(modal, /history: normalizedTaskHistory/);
  assert.match(modal, /onSetStatuses/);
  assert.match(modal, /onSetDelayedStatus/);
  assert.match(modal, /onSetCalendarOverride/);
  assert.match(modal, /visibleCalendarActionStatuses\.map/);
  assert.match(modal, /handleSetStatus/);
  assert.match(modal, /handleSetCalendarOverride/);
  assert.match(modal, /formatTaskStatusLabel\(status\)/);
  assert.match(modal, /calendarStateLabel/);
  assert.doesNotMatch(modal, /onMarkDoneToday|onRemoveCompletionOnLogicalDay/);
  assert.match(pursuitSource, /PursuitCalendarPresentation/);
  assert.match(pursuitSource, /historyTitle="Pursuit History"/);
  assert.match(pursuitSource, /historyDescription="Chronological completed days/);
});
