import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION,
  getTaskTypeSurfaceClassName,
  getTaskTypeTableRowSurfaceClassName,
  normalizeTaskTypePresentation,
  resolveTaskTypeRowPresentation,
  STANDARD_TASK_TYPE_PRESENTATION,
} from "../src/lib/task-type-presentation.ts";
import { updateCustomBehaviorRulesetPresentation } from "../src/lib/custom-behavior-rulesets.ts";
import { buildTaskTypeSelectionOptions, resolveTaskTypeSelectionOption } from "../src/lib/task-type.ts";

const ruleset = {
  accent_key: "blue",
  description: "Hands-on hobbies",
  highlight_task_rows: false,
  icon_key: "toy-brick",
  id: "hobbies",
  name: "Hobbies",
  task_type: "custom" as const,
};

test("legacy and new Custom Task Type presentation defaults highlight rows", () => {
  assert.equal(normalizeTaskTypePresentation(undefined).highlightTaskRows, true);
  assert.equal(normalizeTaskTypePresentation({ highlightTaskRows: null }).highlightTaskRows, true);
  assert.equal(DEFAULT_CUSTOM_TASK_TYPE_PRESENTATION.highlightTaskRows, true);
  assert.equal(STANDARD_TASK_TYPE_PRESENTATION.highlightTaskRows, true);
  assert.equal(buildTaskTypeSelectionOptions([{ ...ruleset, highlight_task_rows: undefined }])[1]?.highlightTaskRows, true);
});

test("persisted false survives Task Type identity normalization without changing accent or icon", () => {
  const option = buildTaskTypeSelectionOptions([ruleset])[1];
  assert.equal(option?.label, "Hobbies");
  assert.equal(option?.highlightTaskRows, false);
  assert.equal(option?.accentKey, "blue");
  assert.equal(option?.iconKey, "toy-brick");
});

test("presentation update toggles true to false to true while preserving the accent", async () => {
  let persistedHighlightTaskRows = true;
  const updates: boolean[] = [];
  const client = {
    from(table: string) {
      assert.equal(table, "adhdice_custom_behavior_rulesets");
      return {
        update(values: { highlight_task_rows: boolean }) {
          persistedHighlightTaskRows = values.highlight_task_rows;
          updates.push(values.highlight_task_rows);
          return {
            eq() { return this; },
            select: async () => ({ data: [{ ...ruleset, highlight_task_rows: persistedHighlightTaskRows, user_id: "owner-1", deleted_at: null, created_at: "2026-09-21T00:00:00.000Z", updated_at: "2026-09-21T00:00:00.000Z" }], error: null }),
          };
        },
      };
    },
  };
  const loaded = [{ ...ruleset, highlight_task_rows: true }];
  const off = await updateCustomBehaviorRulesetPresentation(client as never, "owner-1", "hobbies", { highlightTaskRows: false }, loaded);
  const on = await updateCustomBehaviorRulesetPresentation(client as never, "owner-1", "hobbies", { highlightTaskRows: true }, [{ ...ruleset, highlight_task_rows: false }]);
  assert.deepEqual(updates, [false, true]);
  assert.equal(off.data?.highlight_task_rows, false);
  assert.equal(on.data?.highlight_task_rows, true);
  assert.equal(on.data?.accent_key, "blue");
});

test("highlight OFF uses the normal row surface and exposes the named accent icon", () => {
  const row = resolveTaskTypeRowPresentation(resolveTaskTypeSelectionOption("custom", "hobbies", [ruleset]));
  assert.equal(row.shouldHighlightRow, false);
  assert.equal(row.tableRowSurfaceClassName, getTaskTypeTableRowSurfaceClassName("neutral"));
  assert.equal(row.surfaceClassName, getTaskTypeSurfaceClassName("neutral"));
  assert.deepEqual(row.titleIcon, { accentKey: "blue", iconKey: "toy-brick", label: "Hobbies" });
});

test("highlight ON retains the current colored row and does not add a redundant title icon", () => {
  const option = resolveTaskTypeSelectionOption("custom", "hobbies", [{ ...ruleset, highlight_task_rows: true }]);
  const row = resolveTaskTypeRowPresentation(option);
  assert.equal(row.shouldHighlightRow, true);
  assert.equal(row.tableRowSurfaceClassName, getTaskTypeTableRowSurfaceClassName("blue"));
  assert.equal(row.surfaceClassName, getTaskTypeSurfaceClassName("blue"));
  assert.equal(row.titleIcon, null);
});

test("missing and deleted Custom Task Types fall back to neutral presentation", () => {
  const missing = resolveTaskTypeSelectionOption("custom", "missing", [ruleset]);
  const deleted = resolveTaskTypeSelectionOption("custom", "hobbies", [{ ...ruleset, deleted_at: "2026-09-21T00:00:00.000Z" }]);
  assert.deepEqual(missing, { ...STANDARD_TASK_TYPE_PRESENTATION, label: "Custom Task Type (legacy)", value: "custom" });
  assert.equal(deleted.accentKey, "neutral");
  assert.equal(deleted.highlightTaskRows, true);
  assert.equal(resolveTaskTypeRowPresentation(deleted).titleIcon, null);
});

test("Task Type settings and Table/List title paths use the shared presentation choice", () => {
  const settings = readFileSync("src/components/task-app/task-type-behavior-settings.tsx", "utf8");
  const table = readFileSync("src/components/ui/task-management-table-v2.tsx", "utf8");
  const list = readFileSync("src/components/task-app/tasks-list-adapter.tsx", "utf8");
  assert.match(settings, /Highlight task rows/);
  assert.match(settings, /highlightTaskRows: false/);
  assert.match(table, /resolveTaskTypeRowPresentation/);
  assert.match(table, /<TaskTypeTitleIcon/);
  assert.match(list, /resolveTaskTypeRowPresentation/);
  assert.match(list, /<TaskTypeTitleIcon/);
});
