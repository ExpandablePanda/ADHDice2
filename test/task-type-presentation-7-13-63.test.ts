import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  getTaskTypeSurfaceClassName,
  resolveTaskTypeAccent,
  resolveTaskTypeIcon,
  searchTaskTypeIcons,
  TASK_TYPE_ICON_OPTIONS,
} from "../src/lib/task-type-presentation.ts";
import { resolveTaskTypeSelectionOption } from "../src/lib/task-type.ts";

const identitySource = readFileSync("src/components/task-app/task-type-identity.tsx", "utf8");
const settingsSource = readFileSync("src/components/task-app/task-type-behavior-settings.tsx", "utf8");
const tableSource = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
const listSource = readFileSync("src/components/task-app/tasks-list-adapter.tsx", "utf8");
const secondarySource = readFileSync("src/components/task-app/task-secondary-views.tsx", "utf8");
const gridSource = readFileSync("src/components/task-app/task-grid-widgets.tsx", "utf8");
const pathsSource = readFileSync("src/components/task-app/paths-workspace.tsx", "utf8");
const taskAppSource = readFileSync("src/components/task-app.tsx", "utf8");

const customRulesets = [
  { id: "yellow-type", name: "Home", task_type: "custom" as const, icon_key: "house", accent_key: "yellow", description: "Home tasks" },
  { id: "blue-type", name: "Work", task_type: "custom" as const, icon_key: "briefcase", accent_key: "blue", description: "Work tasks" },
];

test("compact TaskTypeIdentity inherits parent foreground and selected Behavior Settings tabs pass selected state", () => {
  assert.match(identitySource, /\$\{compact \? "text-inherit"/);
  assert.doesNotMatch(identitySource, /compact \? "text-\[#4b4469\]/);
  assert.match(settingsSource, /<TaskTypeIdentity compact option=\{option\} selected=\{activeSelection === option\.value\} \/>/);
  assert.match(settingsSource, /<AdhdChip[\s\S]*selected=\{activeSelection === option\.value\}/);
});

test("unselected Task Type tabs retain the normal readable chip treatment", () => {
  assert.match(settingsSource, /<AdhdChip[\s\S]*selected=\{activeSelection === option\.value\}/);
  assert.match(identitySource, /selected \? "bg-white\/15 text-white" : accent\.iconClassName/);
  assert.match(identitySource, /compact \? "text-inherit"/);
});

test("Standard Task resolves to the neutral default surface", () => {
  const option = resolveTaskTypeSelectionOption("task", null, customRulesets);
  const surface = getTaskTypeSurfaceClassName(option.accentKey);
  assert.equal(option.accentKey, "neutral");
  assert.match(surface, /bg-white/);
  assert.doesNotMatch(surface, /fffdf5|f1ecff|f7f5fb/);
});

test("Table and List production containers use the shared named Task Type surface authority", () => {
  assert.match(tableSource, /getTaskTypeSurfaceClassName\(taskTypeOption\.accentKey\)/);
  assert.match(tableSource, /data-task-table-parent-grid=\{task\.id\}/);
  assert.match(listSource, /getTaskTypeSurfaceClassName\(taskTypeOption\.accentKey\)/);
  assert.match(listSource, /<article[\s\S]*\$\{taskSurface\}/);
});

test("Table and List selected, hover, open, and highlighted states preserve surface and selection visibility", () => {
  assert.match(tableSource, /\$\{taskSurface\}[\s\S]*selectedTaskIdSet\.has\(task\.id\)/);
  assert.match(tableSource, /rowContextMenu\?\.taskId === task\.id/);
  assert.match(tableSource, /getTaskTypeSurfaceClassName/);
  assert.match(listSource, /\$\{taskSurface\}[\s\S]*selectedTaskIdSet\.has\(task\.id\)/);
  assert.match(listSource, /isQuickPanelOpen/);
  assert.match(listSource, /getHighlightedListRowClassName/);
});

test("child Tasks resolve their own accent instead of inheriting the parent", () => {
  const parent = resolveTaskTypeSelectionOption("custom", "yellow-type", customRulesets);
  const child = resolveTaskTypeSelectionOption("custom", "blue-type", customRulesets);
  assert.notEqual(parent.accentKey, child.accentKey);
  assert.notEqual(getTaskTypeSurfaceClassName(parent.accentKey), getTaskTypeSurfaceClassName(child.accentKey));
  assert.match(tableSource, /resolveTaskTypeSelectionOption\(item\.taskType, item\.customRulesetId/);
  assert.match(listSource, /resolveTaskTypeSelectionOption\(item\.taskType, item\.customRulesetId/);
});

test("secondary Task cards, Grid widgets, and Paths nodes reuse the shared surface helper", () => {
  assert.match(secondarySource, /getTaskTypeSurfaceClassName\(option\.accentKey\)/);
  assert.match(gridSource, /getTaskTypeSurfaceClassName\(option\.accentKey\)/);
  assert.match(pathsSource, /getTaskTypeSurfaceClassName\(taskTypeOption\.accentKey\)/);
  assert.match(taskAppSource, /customBehaviorRulesets=\{customBehaviorRulesets\}[\s\S]*tasksByWidget/);
});

test("surface presentation does not alter Task behavior or status values", () => {
  const task = { status: "pending", task_type: "custom", custom_ruleset_id: "yellow-type" };
  const before = task.status;
  const surface = getTaskTypeSurfaceClassName(resolveTaskTypeSelectionOption(task.task_type, task.custom_ruleset_id, customRulesets).accentKey);
  assert.equal(task.status, before);
  assert.match(surface, /bg-/);
  assert.doesNotMatch(surface, /status|complete|missed|pending/);
});

test("the icon registry is substantially larger than the previous 14 choices and keys are unique", () => {
  assert.ok(TASK_TYPE_ICON_OPTIONS.length >= 50);
  assert.equal(new Set(TASK_TYPE_ICON_OPTIONS.map((option) => option.key)).size, TASK_TYPE_ICON_OPTIONS.length);
  assert.ok(TASK_TYPE_ICON_OPTIONS.every((option) => option.key && option.label && option.icon && Array.isArray(option.keywords)));
});

test("icon search matches labels, keywords, synonyms, and case-insensitively", () => {
  assert.ok(searchTaskTypeIcons("phone").some((option) => option.key === "phone"));
  assert.ok(searchTaskTypeIcons("phone").some((option) => option.key === "smartphone"));
  assert.ok(searchTaskTypeIcons("MUSIC").some((option) => option.key === "guitar"));
  assert.ok(searchTaskTypeIcons("practice").some((option) => option.key === "music"));
  assert.ok(searchTaskTypeIcons("learning").some((option) => option.key === "book-open"));
});

test("clearing icon search restores every icon", () => {
  assert.strictEqual(searchTaskTypeIcons(""), TASK_TYPE_ICON_OPTIONS);
  assert.strictEqual(searchTaskTypeIcons("   "), TASK_TYPE_ICON_OPTIONS);
  assert.ok(searchTaskTypeIcons("not-a-real-icon").length === 0);
  assert.match(settingsSource, /value=\{iconQuery\}/);
});

test("unknown icon and accent keys use safe fallbacks", () => {
  assert.equal(resolveTaskTypeIcon("unknown-icon"), resolveTaskTypeIcon("list-todo"));
  assert.equal(resolveTaskTypeAccent("unknown-accent").key, "purple");
  assert.match(getTaskTypeSurfaceClassName("unknown-accent"), /bg-\[#fcfaff\]/);
});

test("the 7.13.63 presentation patch contains no SQL, schema, or behavior-policy persistence change", () => {
  const changedFiles = execFileSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" }).split("\n").filter(Boolean);
  assert.doesNotMatch(changedFiles.join("\n"), /(^|\/)supabase\/|schema|behavior-policy|task-state/);
});
