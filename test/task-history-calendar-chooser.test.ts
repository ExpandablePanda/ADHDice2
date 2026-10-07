import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modalSource = readFileSync(new URL("../src/components/task-app/task-view-adapters.tsx", import.meta.url), "utf8");
const modal = modalSource.slice(modalSource.indexOf("export function TaskHistoryModal"), modalSource.indexOf("\nexport function BottomDockAdapter"));

test("Calendar In Progress chooser uses the standard task-status chip presentation", () => {
  assert.match(modal, /overrideState === "in_progress" \? renderTaskStatusCircle\("in_progress", "sm", \{ inverted: calendarOverridesByDate\.get\(selectedDate\)\?\.overrideState === "in_progress" \}\)/);
  assert.match(modal, /TASK_STATUS_CHIP_STYLES\.in_progress/);
  assert.match(modal, /TASK_STATUS_INVERTED_CHIP_STYLES\.in_progress/);
});

test("Calendar schedule override pills remain unchanged for Blank, Not Due, and Due", () => {
  assert.match(modal, /overrideState === "not_due" \? "Not Due" : overrideState === "blank_due" \? "Blank" : overrideState === "in_progress" \? "In Progress" : "Due"/);
  assert.match(modal, /overrideState === "not_due" \? "border-\[#a9daf7\].*overrideState === "blank_due" \? "border-\[#c8c2d8\].*disabled:opacity-50`\}/s);
});
