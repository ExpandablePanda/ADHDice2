"use client";

import type { TaskList as DbTaskList, TaskListManualMembership as DbTaskListManualMembership } from "@/lib/database.types";
import { isBuiltInTaskListId, parseTaskListRules, type TaskListDefinition, type TaskListId, type TaskListManualMembership } from "@/lib/task-lists";

const LEGACY_SYSTEM_LIST_ID_MAP = {
  important: "priority_3_4",
  urgent: "priority_5",
} as const;

const TASK_BUCKET_DESCRIPTIONS: Record<string, string> = {
  priority_1_2: "Lower-friction or lower-pressure tasks with numeric priority 1 or 2.",
  priority_3_4: "Core work tracked with numeric priority 3 or 4.",
  priority_5: "Highest-pressure work tracked as numeric priority 5.",
  focus: "Deep work or growth reps that deserve protected time.",
  missed: "Tasks that slipped past their due date and need a reset.",
};

const LEGACY_SYSTEM_LIST_METADATA: Partial<Record<string, Pick<TaskListDefinition, "description" | "name" | "rules">>> = {
  priority_3_4: {
    description: TASK_BUCKET_DESCRIPTIONS.priority_3_4,
    name: "Priority 3-4",
    rules: { rules: [{ rule: { field: "priority_level", op: "is", value: ["3", "4"] } }] },
  },
  priority_5: {
    description: TASK_BUCKET_DESCRIPTIONS.priority_5,
    name: "Priority 5",
    rules: { rules: [{ rule: { field: "priority_level", op: "is", value: "5" } }] },
  },
};

export function mapTaskListRow(row: DbTaskList): TaskListDefinition | null {
  const normalizedBuiltInKey = row.built_in_key && row.built_in_key in LEGACY_SYSTEM_LIST_ID_MAP
    ? LEGACY_SYSTEM_LIST_ID_MAP[row.built_in_key as keyof typeof LEGACY_SYSTEM_LIST_ID_MAP]
    : row.built_in_key;
  const normalizedIdValue = row.id in LEGACY_SYSTEM_LIST_ID_MAP
    ? LEGACY_SYSTEM_LIST_ID_MAP[row.id as keyof typeof LEGACY_SYSTEM_LIST_ID_MAP]
    : row.id;
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

  const id = normalizedIdValue.startsWith("list:") || isBuiltInTaskListId(normalizedIdValue)
    ? normalizedIdValue as TaskListId
    : `list:${normalizedIdValue}` as TaskListId;
  const legacyMetadata = normalizedBuiltInKey ? LEGACY_SYSTEM_LIST_METADATA[normalizedBuiltInKey] : null;

  return {
    description: legacyMetadata?.description ?? (normalizedBuiltInKey ? TASK_BUCKET_DESCRIPTIONS[normalizedBuiltInKey] ?? row.name : row.name),
    id,
    isDeletable: row.is_deletable,
    isEditable: row.is_editable,
    isVisible: row.is_visible,
    membershipMode: row.membership_mode,
    name: legacyMetadata?.name ?? row.name,
    rules: legacyMetadata?.rules ?? rules,
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
