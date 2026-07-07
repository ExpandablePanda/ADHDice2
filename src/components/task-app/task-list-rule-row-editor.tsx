"use client";

import { Trash2 } from "lucide-react";
import { TaskTableChipButton, TASK_TABLE_INACTIVE_CHIP_CLASS, TASK_TABLE_TAG_CHIP_CLASS } from "@/components/ui/task-table-primitives";
import type { TaskEnergy, TaskStatus } from "@/lib/database.types";
import { TASK_HISTORY_STREAK_PRESETS, TASK_HISTORY_WINDOW_PRESETS } from "@/lib/task-history";
import { formatOptionLabel } from "@/lib/task-label-format";
import { getSelectedTaskPriorityToneClass, getTaskPriorityToneClass } from "@/lib/task-priority";
import {
  formatTaskListRule,
  getTaskListRuleOperator,
  normalizeTaskListRuleValues,
  taskListRuleNeedsValue,
  type TaskListRuleField,
  type TaskListRuleRowOperator,
  updateTaskListRuleField,
  updateTaskListRuleOperator,
  updateTaskListRuleValue,
} from "@/lib/task-list-rule-editor";
import type { TaskListId, TaskListRule } from "@/lib/task-lists";

function RuleChipGroup({
  multiSelect = false,
  optionToneClassName,
  options,
  onSelect,
  selectedValue,
  selectedValues,
}: {
  multiSelect?: boolean;
  onSelect: (value: string) => void;
  optionToneClassName?: (value: string, active: boolean) => string;
  options: Array<{ label: string; value: string }>;
  selectedValue?: string;
  selectedValues?: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = multiSelect
          ? (selectedValues ?? []).includes(option.value)
          : option.value === selectedValue;
        return (
          <TaskTableChipButton
            className="transition"
            key={option.value}
            onClick={() => onSelect(option.value)}
            toneClassName={optionToneClassName ? optionToneClassName(option.value, active) : active ? TASK_TABLE_TAG_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}
          >
            {option.label}
          </TaskTableChipButton>
        );
      })}
    </div>
  );
}

export function TaskListRuleRowEditor({
  energyOptions,
  fieldOptions,
  listLabelById,
  listOptions,
  onChange,
  onRemove,
  operatorOptionsByField,
  rule,
  taskStatusOptions,
}: {
  energyOptions: TaskEnergy[];
  fieldOptions: Array<{ label: string; value: TaskListRuleField }>;
  listLabelById?: Partial<Record<TaskListId, string>>;
  listOptions: Array<{ label: string; value: TaskListId }>;
  onChange: (rule: TaskListRule) => void;
  onRemove: () => void;
  operatorOptionsByField: Record<TaskListRuleField, Array<{ label: string; value: TaskListRuleRowOperator }>>;
  rule: TaskListRule;
  taskStatusOptions: TaskStatus[];
}) {
  const operatorOptions = operatorOptionsByField[rule.field];
  const valueOptions = rule.field === "status"
    ? taskStatusOptions.map((option) => ({
      label: formatOptionLabel(option),
      value: option,
    }))
    : rule.field === "list"
      ? listOptions
    : rule.field === "energy"
      ? energyOptions.map((option) => ({
        label: formatOptionLabel(option),
        value: option,
      }))
      : rule.field === "priority_level"
        ? ["1", "2", "3", "4", "5"].map((option) => ({
          label: option,
          value: option,
        }))
      : rule.field === "history_status"
        ? [
          { label: "Done Today", value: "done_today" },
          { label: "Did My Best Today", value: "did_my_best_today" },
          { label: "Missed Today", value: "missed_today" },
          { label: "Handled", value: "handled_today" },
        ]
      : rule.field === "completed_history" || rule.field === "missed_history"
        ? TASK_HISTORY_WINDOW_PRESETS.map((preset) => ({
          label: `${preset} day${preset === "1" ? "" : "s"}`,
          value: preset,
        }))
        : rule.field === "completed_streak" || rule.field === "missed_streak"
          ? TASK_HISTORY_STREAK_PRESETS.map((preset) => ({
            label: preset,
            value: preset,
          }))
      : [
        { label: "0", value: "0" },
        { label: "Over 0", value: "over_0" },
        { label: "Over 7", value: "over_7" },
        { label: "Over 14", value: "over_14" },
        { label: "Over 30", value: "over_30" },
      ];
  const isMultiSelectValueRule = rule.field === "status" || rule.field === "energy" || rule.field === "priority_level";

  return (
    <div className="space-y-3 rounded-[1rem] border border-[#ece8f8] bg-[#faf8ff] p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <RuleChipGroup
            onSelect={(value) => onChange(updateTaskListRuleField(rule, value as TaskListRuleField))}
            options={fieldOptions}
            selectedValue={rule.field}
          />
          <RuleChipGroup
            onSelect={(value) => onChange(updateTaskListRuleOperator(rule, value as TaskListRuleRowOperator))}
            options={operatorOptions}
            selectedValue={getTaskListRuleOperator(rule)}
          />
          {taskListRuleNeedsValue(rule) ? (
            <RuleChipGroup
              multiSelect={isMultiSelectValueRule}
              onSelect={(value) => onChange(updateTaskListRuleValue(rule, value))}
              optionToneClassName={rule.field === "priority_level"
                ? (value, active) => active ? getSelectedTaskPriorityToneClass(value as "1" | "2" | "3" | "4" | "5") : getTaskPriorityToneClass(value as "1" | "2" | "3" | "4" | "5")
                : undefined}
              options={valueOptions}
              selectedValue={
                rule.field === "streak"
                  || rule.field === "list"
                  || rule.field === "priority_level"
                  || rule.field === "history_status"
                  || rule.field === "completed_history"
                  || rule.field === "missed_history"
                  || rule.field === "completed_streak"
                  || rule.field === "missed_streak"
                  ? rule.value
                  : undefined
              }
              selectedValues={isMultiSelectValueRule ? normalizeTaskListRuleValues(rule.value) : undefined}
            />
          ) : (
            <div className="rounded-[0.85rem] border border-[#ece8f8] bg-white px-3 py-2 text-sm text-[#68738f] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/55">
              {formatTaskListRule(rule, (listId) => listLabelById?.[listId] ?? "")}
            </div>
          )}
        </div>
        <TaskTableChipButton
          aria-label="Remove rule"
          className="h-8 w-8 p-0 transition"
          onClick={onRemove}
          toneClassName="border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]"
        >
          <Trash2 className="h-4 w-4" />
        </TaskTableChipButton>
      </div>
    </div>
  );
}
