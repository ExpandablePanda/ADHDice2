"use client";

import { useState } from "react";
import {
  buildCustomCadenceMutation,
  createTaskRepeatEditorDraft,
  getTaskRepeatCategory,
  normalizePresetRepeatSelection,
  REPEAT_MONTHLY_MODE_OPTIONS,
  REPEAT_MONTHLY_ORDINAL_OPTIONS,
  REPEAT_WEEKDAY_FULL_LABELS,
  REPEAT_WEEKDAY_LABELS,
  type TaskRepeatCategory,
  type TaskRepeatEditorDraft,
  type TaskRepeatEditorUnit,
  type TaskRepeatEditorValue,
  type TaskRepeatSelection,
} from "@/lib/task-repeat";
import {
  TASK_TABLE_COMPACT_CADENCE_INPUT_CLASS,
  TASK_TABLE_COMPACT_CADENCE_LABEL_CLASS,
  TaskTableChipButton,
} from "./task-table-primitives";

const REPEAT_PRESETS: ReadonlyArray<{ label: string; value: TaskRepeatSelection }> = [
  { label: "No Repeat", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Daily Until Complete", value: "daily_until_complete" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Custom", value: "custom" },
];
const REPEAT_UNITS: ReadonlyArray<{ label: string; value: TaskRepeatEditorUnit }> = [
  { label: "Days", value: "daily" },
  { label: "Weeks", value: "weekly" },
  { label: "Months", value: "monthly" },
];

function valueSignature(value: TaskRepeatEditorValue) {
  return JSON.stringify([
    value.repeatFrequency,
    value.repeatInterval,
    value.repeatDaysOfWeek,
    value.repeatDayOfMonth,
    value.repeatMonthlyMode,
    value.repeatMonthlyOrdinal,
    value.repeatMonthlyWeekday,
  ]);
}

function editorCategory(value: TaskRepeatEditorValue): TaskRepeatCategory {
  return getTaskRepeatCategory(value.repeatFrequency, value.repeatDaysOfWeek, value.repeatInterval);
}

function selectedTone(active: boolean, activeToneClassName: string, inactiveToneClassName: string) {
  return active ? activeToneClassName : inactiveToneClassName;
}

export function TaskRepeatEditor({
  activeToneClassName,
  className,
  dueOn,
  inactiveToneClassName,
  onChange,
  onPresetApplied,
  value,
}: {
  activeToneClassName: string;
  className?: string;
  dueOn?: string | null;
  inactiveToneClassName: string;
  onChange: (value: TaskRepeatEditorValue) => void;
  onPresetApplied?: (selection: TaskRepeatSelection, value: TaskRepeatEditorValue) => void;
  value: TaskRepeatEditorValue;
}) {
  const [localEditorMode, setLocalEditorMode] = useState<TaskRepeatCategory>(() => editorCategory(value));
  const [localDraft, setLocalDraft] = useState<TaskRepeatEditorDraft>(() => createTaskRepeatEditorDraft(value));
  const [localIntervalInput, setLocalIntervalInput] = useState(() => String(Math.max(1, value.repeatInterval)));
  const [localDayOfMonthInput, setLocalDayOfMonthInput] = useState(() => value.repeatDayOfMonth ? String(value.repeatDayOfMonth) : "");
  const [localSessionSignature, setLocalSessionSignature] = useState(() => valueSignature(value));
  const currentValueSignature = valueSignature(value);

  const hasLocalSession = localSessionSignature === currentValueSignature;
  const draft = hasLocalSession ? localDraft : createTaskRepeatEditorDraft(value);
  const editorMode = hasLocalSession ? localEditorMode : editorCategory(value);
  const intervalInput = hasLocalSession ? localIntervalInput : String(draft.repeatInterval);
  const dayOfMonthInput = hasLocalSession ? localDayOfMonthInput : (draft.repeatDayOfMonth ? String(draft.repeatDayOfMonth) : "");

  const emit = (nextValue: TaskRepeatEditorValue, nextMode: TaskRepeatCategory, nextDraft?: TaskRepeatEditorDraft) => {
    const normalizedDraft = nextDraft ?? createTaskRepeatEditorDraft(nextValue);
    setLocalDraft(normalizedDraft);
    setLocalEditorMode(nextMode);
    setLocalIntervalInput(String(normalizedDraft.repeatInterval));
    setLocalDayOfMonthInput(normalizedDraft.repeatDayOfMonth ? String(normalizedDraft.repeatDayOfMonth) : "");
    setLocalSessionSignature(valueSignature(nextValue));
    onChange(nextValue);
  };

  const withPendingInterval = (nextDraft: TaskRepeatEditorDraft) => {
    const parsed = Number.parseInt(intervalInput, 10);
    return {
      ...nextDraft,
      repeatInterval: Number.isFinite(parsed) && parsed > 0 ? parsed : nextDraft.repeatInterval,
    };
  };

  const commitCustomDraft = (nextDraft: TaskRepeatEditorDraft) => {
    const nextValue = buildCustomCadenceMutation(withPendingInterval(nextDraft), { dueOn });
    emit(nextValue, "custom", {
      ...createTaskRepeatEditorDraft(nextValue),
      completionMode: nextDraft.completionMode,
      unit: nextDraft.unit,
    });
  };

  const handlePresetClick = (selection: TaskRepeatSelection) => {
    if (selection === "custom") {
      const nextDraft = createTaskRepeatEditorDraft(value);
      commitCustomDraft(nextDraft);
      return;
    }
    const nextValue = normalizePresetRepeatSelection(selection, draft, { dueOn });
    emit(nextValue, selection);
    onPresetApplied?.(selection, nextValue);
  };

  const activeCategory = editorMode;
  const commitInterval = () => {
    commitCustomDraft(withPendingInterval(draft));
  };
  const commitDayOfMonth = () => {
    const parsed = Number.parseInt(dayOfMonthInput, 10);
    commitCustomDraft({
      ...draft,
      repeatDayOfMonth: Number.isFinite(parsed) && parsed >= 1 && parsed <= 31 ? parsed : draft.repeatDayOfMonth,
    });
  };
  const toggleWeekday = (weekday: number) => {
    const nextDays = draft.repeatDaysOfWeek.includes(weekday)
      ? draft.repeatDaysOfWeek.filter((day) => day !== weekday)
      : [...draft.repeatDaysOfWeek, weekday].sort((left, right) => left - right);
    commitCustomDraft(withPendingInterval({ ...draft, repeatDaysOfWeek: nextDays }));
  };

  const renderWeekdayChips = (fullLabels = false) => (
    <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1">
      {REPEAT_WEEKDAY_LABELS.map((label, weekday) => (
        <TaskTableChipButton
          key={`repeat-weekday-${weekday}`}
          onClick={() => toggleWeekday(weekday)}
          toneClassName={selectedTone(draft.repeatDaysOfWeek.includes(weekday), activeToneClassName, inactiveToneClassName)}
        >
          {fullLabels ? REPEAT_WEEKDAY_FULL_LABELS[weekday] : label}
        </TaskTableChipButton>
      ))}
    </div>
  );

  const renderMonthlyControls = (isCustom: boolean) => (
    <div className="grid gap-1.5" data-repeat-editor-monthly-controls="true">
      <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5" data-repeat-editor-monthly-mode="true">
        {REPEAT_MONTHLY_MODE_OPTIONS.map((option) => (
          <TaskTableChipButton
            key={`repeat-monthly-mode-${option.value}`}
            onClick={() => {
              const nextMode = option.value;
              const nextDraft: TaskRepeatEditorDraft = {
                ...draft,
                repeatMonthlyMode: nextMode,
                repeatMonthlyOrdinal: nextMode === "ordinal_weekday" ? (draft.repeatMonthlyOrdinal ?? "first") : null,
                repeatMonthlyWeekday: nextMode === "ordinal_weekday" ? (draft.repeatMonthlyWeekday ?? 1) : null,
                repeatDayOfMonth: nextMode === "day_of_month" ? (draft.repeatDayOfMonth ?? 1) : null,
              };
              if (isCustom) {
                commitCustomDraft(nextDraft);
              } else {
                const nextValue = normalizePresetRepeatSelection("monthly", nextDraft, { dueOn });
                emit(nextValue, "monthly");
              }
            }}
            toneClassName={selectedTone(draft.repeatMonthlyMode === option.value, activeToneClassName, inactiveToneClassName)}
          >
            {option.label}
          </TaskTableChipButton>
        ))}
      </div>
      {draft.repeatMonthlyMode === "day_of_month" ? (
        <div className="flex flex-nowrap items-center gap-1.5">
          <span className={TASK_TABLE_COMPACT_CADENCE_LABEL_CLASS}>Day of month</span>
          <input
            className={TASK_TABLE_COMPACT_CADENCE_INPUT_CLASS}
            inputMode="numeric"
            max={31}
            min={1}
            onBlur={isCustom ? commitDayOfMonth : undefined}
            onChange={(event) => {
              const nextInput = event.target.value.replace(/[^\d]/g, "").slice(0, 2);
              setLocalSessionSignature(currentValueSignature);
              setLocalDayOfMonthInput(nextInput);
              if (!isCustom) {
                const parsed = Number.parseInt(nextInput, 10);
                if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 31) {
                  const nextValue = normalizePresetRepeatSelection("monthly", { ...draft, repeatDayOfMonth: parsed }, { dueOn });
                  emit(nextValue, "monthly");
                }
              }
            }}
            type="text"
            value={dayOfMonthInput}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5" data-repeat-editor-monthly-ordinal="true">
            {REPEAT_MONTHLY_ORDINAL_OPTIONS.map((option) => (
              <TaskTableChipButton
                key={`repeat-monthly-ordinal-${option.value}`}
                onClick={() => {
                  const nextDraft = { ...draft, repeatMonthlyMode: "ordinal_weekday" as const, repeatMonthlyOrdinal: option.value, repeatMonthlyWeekday: draft.repeatMonthlyWeekday ?? 1 };
                  if (isCustom) {
                    commitCustomDraft(nextDraft);
                  } else {
                    emit(normalizePresetRepeatSelection("monthly", nextDraft, { dueOn }), "monthly");
                  }
                }}
                toneClassName={selectedTone(draft.repeatMonthlyOrdinal === option.value, activeToneClassName, inactiveToneClassName)}
              >
                {option.label}
              </TaskTableChipButton>
            ))}
          </div>
          <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5" data-repeat-editor-monthly-weekday="true">
            {REPEAT_WEEKDAY_FULL_LABELS.map((label, weekday) => (
              <TaskTableChipButton
                key={`repeat-monthly-weekday-${weekday}`}
                onClick={() => {
                  const nextDraft = { ...draft, repeatMonthlyMode: "ordinal_weekday" as const, repeatMonthlyOrdinal: draft.repeatMonthlyOrdinal ?? "first", repeatMonthlyWeekday: weekday };
                  if (isCustom) {
                    commitCustomDraft(nextDraft);
                  } else {
                    emit(normalizePresetRepeatSelection("monthly", nextDraft, { dueOn }), "monthly");
                  }
                }}
                toneClassName={selectedTone(draft.repeatMonthlyWeekday === weekday, activeToneClassName, inactiveToneClassName)}
              >
                {label}
              </TaskTableChipButton>
            ))}
          </div>
          {!draft.repeatMonthlyOrdinal || draft.repeatMonthlyWeekday === null ? <span className={TASK_TABLE_COMPACT_CADENCE_LABEL_CLASS}>Choose an ordinal weekday</span> : null}
        </>
      )}
    </div>
  );

  return (
    <div className={className ?? "space-y-2"} data-repeat-editor="true">
      <div className="flex flex-wrap gap-2">
        {REPEAT_PRESETS.map((option) => (
          <TaskTableChipButton
            key={option.value}
            onClick={() => handlePresetClick(option.value)}
            toneClassName={selectedTone(activeCategory === option.value, activeToneClassName, inactiveToneClassName)}
          >
            {option.label}
          </TaskTableChipButton>
        ))}
        <TaskTableChipButton
          onClick={() => handlePresetClick("weekdays")}
          toneClassName={selectedTone(activeCategory === "weekdays", activeToneClassName, inactiveToneClassName)}
        >
          Weekdays
        </TaskTableChipButton>
      </div>

      {activeCategory === "weekly" ? renderWeekdayChips() : null}
      {activeCategory === "monthly" ? renderMonthlyControls(false) : null}
      {activeCategory === "custom" ? (
        <div className="grid gap-2 rounded-[1rem] border border-[#ece7f5] bg-[#fbfaff] p-3 dark:border-white/10 dark:bg-white/[0.04]" data-repeat-editor-custom="true">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#9b92be] dark:text-white/35">Custom</p>
          <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5" data-repeat-editor-completion="true">
            <span className={TASK_TABLE_COMPACT_CADENCE_LABEL_CLASS}>Completion</span>
            {([
              ["keep_repeating", "Keep repeating"],
              ["until_complete", "Until complete"],
            ] as const).map(([mode, label]) => (
              <TaskTableChipButton
                key={mode}
                onClick={() => {
                  const nextDraft = {
                    ...draft,
                    completionMode: mode,
                    unit: mode === "until_complete" ? "daily" as const : draft.unit,
                  };
                  commitCustomDraft(nextDraft);
                }}
                toneClassName={selectedTone(draft.completionMode === mode, activeToneClassName, inactiveToneClassName)}
              >
                {label}
              </TaskTableChipButton>
            ))}
          </div>
          <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5" data-repeat-editor-cadence="true">
            <span className={TASK_TABLE_COMPACT_CADENCE_LABEL_CLASS}>Every</span>
            <input
              className={TASK_TABLE_COMPACT_CADENCE_INPUT_CLASS}
              inputMode="numeric"
              min={1}
              onBlur={commitInterval}
              onChange={(event) => {
                setLocalSessionSignature(currentValueSignature);
                setLocalIntervalInput(event.target.value.replace(/[^\d]/g, ""));
              }}
              type="text"
              value={intervalInput}
            />
            {REPEAT_UNITS.filter((unit) => draft.completionMode !== "until_complete" || unit.value === "daily").map((unit) => (
              <TaskTableChipButton
                key={unit.value}
                onClick={() => {
                  const nextDraft = withPendingInterval({ ...draft, unit: unit.value });
                  commitCustomDraft(nextDraft);
                }}
                toneClassName={selectedTone(draft.unit === unit.value, activeToneClassName, inactiveToneClassName)}
              >
                {unit.label}
              </TaskTableChipButton>
            ))}
          </div>
          {draft.unit === "weekly" ? renderWeekdayChips() : null}
          {draft.unit === "monthly" ? renderMonthlyControls(true) : null}
        </div>
      ) : null}
    </div>
  );
}
