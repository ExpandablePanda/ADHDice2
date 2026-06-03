"use client";

import type { TaskList as DbTaskList, TaskListManualMembership as DbTaskListManualMembership } from "@/lib/database.types";
import { isBuiltInTaskListId, parseTaskListRules, type TaskListDefinition, type TaskListId, type TaskListManualMembership } from "@/lib/task-lists";

const TASK_BUCKET_DESCRIPTIONS: Record<string, string> = {
  urgent: "Due soon, high stakes, and likely to unblock everything else.",
  important: "Core outcomes worth protecting this week.",
  focus: "Deep work or growth reps that deserve protected time.",
  missed: "Tasks that slipped past their due date and need a reset.",
};

export function mapTaskListRow(row: DbTaskList): TaskListDefinition | null {
  let rules = null;
  if (row.rules_json) {
    try {
      rules = parseTaskListRules(JSON.parse(row.rules_json));
    } catch {
      rules = null;
    }
  }
  if (
    row.list_type !== "system"
    && row.list_type !== "smart"
    && row.list_type !== "custom"
  ) {
    return null;
  }
  if (
    row.membership_mode !== "manual"
    && row.membership_mode !== "rules"
    && row.membership_mode !== "hybrid"
  ) {
    return null;
  }

  const id = row.id.startsWith("list:") || isBuiltInTaskListId(row.id)
    ? row.id as TaskListId
    : `list:${row.id}` as TaskListId;

  return {
    description: row.built_in_key ? TASK_BUCKET_DESCRIPTIONS[row.built_in_key] ?? row.name : row.name,
    id,
    isDeletable: row.is_deletable,
    isEditable: row.is_editable,
    isVisible: row.is_visible,
    membershipMode: row.membership_mode,
    name: row.name,
    rules,
    sortOrder: row.sort_order,
    type: row.list_type,
  };
}

export function mapTaskListManualMembershipRow(row: DbTaskListManualMembership): TaskListManualMembership {
  return {
    ...row,
    list_id: (row.list_id.startsWith("list:") || isBuiltInTaskListId(row.list_id))
      ? row.list_id as TaskListId
      : `list:${row.list_id}` as TaskListId,
  };
}
