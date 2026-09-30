import assert from "node:assert/strict";
import test from "node:test";

import { buildChildTaskCreationDraft } from "../src/lib/task-child-creation.ts";
import type { TaskCreationMetadata } from "../src/lib/task-creation.ts";

test("rich Step/Substep creation preserves all selected metadata and the clicked parent", () => {
  const metadata = {
    due_on: "2026-10-04",
    due_time: "09:30",
    priority_level: 5,
    repeat_day_of_month: null,
    repeat_days_of_week: [1, 3, 5],
    repeat_frequency: "custom",
    repeat_interval: 2,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    tags: ["deep-work", "music"],
    parent_task_id: "malicious-parent",
  } as TaskCreationMetadata & { parent_task_id: string };

  const result = buildChildTaskCreationDraft({
    metadata,
    parentTaskId: "clicked-step",
    taskTypeSelection: { customRulesetId: "practice", taskType: "custom" },
    title: "  Practice scales  ",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.draft, {
    actual_seconds: 0,
    completed_at: null,
    custom_ruleset_id: "practice",
    due_on: "2026-10-04",
    due_time: "09:30",
    energy: "none",
    estimated_minutes: null,
    external_link_label: null,
    external_link_url: null,
    is_important: false,
    is_urgent: true,
    notes: null,
    one_step_at_a_time: false,
    parent_task_id: "clicked-step",
    priority: "high",
    priority_level: 5,
    repeat_day_of_month: null,
    repeat_days_of_week: [1, 3, 5],
    repeat_frequency: "custom",
    repeat_interval: 2,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    status: "pending",
    subtasks_auto_reset: false,
    tags: ["deep-work", "music"],
    task_type: "custom",
    title: "Practice scales",
    trashed_at: null,
  });
});

test("child creation still fails closed for missing, blocked, empty, and invalid parents/types", () => {
  assert.equal(buildChildTaskCreationDraft({ parentTaskId: null, title: "Step" }).error, "missing_parent");
  assert.equal(buildChildTaskCreationDraft({ blockedParentTaskIds: ["blocked"], parentTaskId: "blocked", title: "Step" }).error, "blocked_parent");
  assert.equal(buildChildTaskCreationDraft({ parentTaskId: "parent", title: "  " }).error, "empty_title");
  assert.equal(buildChildTaskCreationDraft({ parentTaskId: "parent", taskTypeSelection: null, title: "Step" }).error, "invalid_task_type");
});
