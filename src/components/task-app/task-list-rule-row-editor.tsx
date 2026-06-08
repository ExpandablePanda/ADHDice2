"use client";

import { Trash2 } from "lucide-react";
import { TaskTableChipButton, TASK_TABLE_INACTIVE_CHIP_CLASS, TASK_TABLE_TAG_CHIP_CLASS } from "@/components/ui/task-table-primitives";
import type { TaskEnergy, TaskStatus } from "@/lib/database.types";
import { formatOptionLabel } from "@/lib/task-label-format";
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
  options,
  onSelect,
  selectedValue,
  selectedValues,
}: {
  multiSelect?: boolean;
  onSelect: (value: string) => void;
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
            toneClassName={active ? TASK_TABLE_TAG_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}
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
      : [
        { label: "0", value: "0" },
        { label: "Over 0", value: "over_0" },
        { label: "Over 7", value: "over_7" },
        { label: "Over 14", value: "over_14" },
        { label: "Over 30", value: "over_30" },
      ];
  const isMultiSelectValueRule = rule.field === "status" || rule.field === "energy";

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
              options={valueOptions}
              selectedValue={rule.field === "streak" || rule.field === "list" ? rule.value : undefined}
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
