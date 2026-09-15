import type { TaskInsert } from "@/lib/database.types";
import type { TaskTypeSelection } from "@/lib/task-type";

export type ChildTaskCreationDraft = Omit<TaskInsert, "user_id">;

export type ChildTaskCreationDraftResult =
  | { draft: ChildTaskCreationDraft; error: null; ok: true }
  | { draft: null; error: "blocked_parent" | "empty_title" | "invalid_task_type" | "missing_parent"; ok: false };

type BuildChildTaskCreationDraftInput = {
  blockedParentTaskIds?: readonly string[];
  parentTaskId: string | null | undefined;
  taskTypeSelection?: TaskTypeSelection | null;
  title: string;
};

export function buildChildTaskCreationDraft({
  blockedParentTaskIds = [],
  parentTaskId,
  taskTypeSelection = { customRulesetId: null, taskType: "task" },
  title,
}: BuildChildTaskCreationDraftInput): ChildTaskCreationDraftResult {
  const trimmedTitle = title.trim();

  if (!parentTaskId) {
    return { draft: null, error: "missing_parent", ok: false };
  }

  if (blockedParentTaskIds.includes(parentTaskId)) {
    return { draft: null, error: "blocked_parent", ok: false };
  }

  if (!trimmedTitle) {
    return { draft: null, error: "empty_title", ok: false };
  }

  if (!taskTypeSelection) {
    return { draft: null, error: "invalid_task_type", ok: false };
  }

  return {
    draft: {
      actual_seconds: 0,
      completed_at: null,
      due_on: null,
      due_time: null,
      energy: "none",
      estimated_minutes: null,
      external_link_label: null,
      external_link_url: null,
      is_important: false,
      is_urgent: false,
      notes: null,
      one_step_at_a_time: false,
      parent_task_id: parentTaskId,
      priority: "normal",
      repeat_day_of_month: null,
      repeat_days_of_week: [],
      repeat_frequency: "none",
      repeat_interval: 1,
      status: "pending",
      subtasks_auto_reset: false,
      tags: [],
      custom_ruleset_id: taskTypeSelection.customRulesetId,
      task_type: taskTypeSelection.taskType,
      title: trimmedTitle,
      trashed_at: null,
    },
    error: null,
    ok: true,
  };
}
