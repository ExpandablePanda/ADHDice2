"use client";

import { Trash2 } from "lucide-react";
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
import type { TaskListRule } from "@/lib/task-lists";

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
          <button
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              active
                ? "bg-[#efe9ff] text-[#6f57f6] shadow-[0_6px_18px_rgba(111,87,246,0.16)] dark:bg-[#2b214d] dark:text-[#cabfff]"
                : "bg-white text-[#68738c] hover:bg-[#ede8ff] dark:bg-white/[0.05] dark:text-white/60 dark:hover:bg-white/[0.08]"
            }`}
            key={option.value}
            onClick={() => onSelect(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function TaskListRuleRowEditor({
  energyOptions,
  fieldOptions,
  onChange,
  onRemove,
  operatorOptionsByField,
  rule,
  taskStatusOptions,
}: {
  energyOptions: TaskEnergy[];
  fieldOptions: Array<{ label: string; value: TaskListRuleField }>;
  onChange: (rule: TaskListRule) => void;
  onRemove: () => void;
  operatorOptionsByField: Record<TaskListRuleField, Array<{ label: string; value: TaskListRuleRowOperator }>>;
  rule: TaskListRule;
  taskStatusOptions: TaskStatus[];
}) {
  const operatorOptions = operatorOptionsByField[rule.field];
  const valueOptions = (rule.field === "status" ? taskStatusOptions : energyOptions).map((option) => ({
    label: formatOptionLabel(option),
    value: option,
  }));

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
              multiSelect
              onSelect={(value) => onChange(updateTaskListRuleValue(rule, value))}
              options={valueOptions}
              selectedValues={normalizeTaskListRuleValues(rule.value)}
            />
          ) : (
            <div className="rounded-[0.85rem] border border-[#ece8f8] bg-white px-3 py-2 text-sm text-[#68738f] dark:border-white/10 dark:bg-white/[0.05] dark:text-white/55">
              {formatTaskListRule(rule)}
            </div>
          )}
        </div>
        <button
          aria-label="Remove rule"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fff1f3] text-[#d94e67] transition hover:bg-[#ffe4e9] dark:bg-[#44232f] dark:text-[#ff9eaf]"
          onClick={onRemove}
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
