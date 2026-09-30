"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { TaskTypeSelect } from "./task-type-identity";
import type { TaskEnergy, TaskRepeatFrequency, TaskRepeatMonthlyMode, TaskRepeatMonthlyOrdinal } from "@/lib/database.types";
import { parseDayOfMonth, parsePositiveInteger } from "./task-editor-model";
import {
  getSelectedTaskPriorityToneClass,
  getTaskPriorityToneClass,
  TASK_PRIORITY_LEVEL_OPTIONS,
  type TaskPriorityLevel,
  type TaskPriorityLevelOption,
} from "@/lib/task-priority";
import {
  REPEAT_MONTHLY_MODE_OPTIONS,
  REPEAT_MONTHLY_ORDINAL_OPTIONS,
  REPEAT_WEEKDAY_FULL_LABELS,
  WEEKDAYS_REPEAT_DAYS,
  isWeekdaysRepeatSelection,
} from "@/lib/task-repeat";
import type { TaskTypeSelectionOption } from "@/lib/task-type";
import type { TaskChildCreationResult, TaskCreationDraft, TaskCreationMetadata, TaskCreationSubmission } from "@/lib/task-creation";
import {
  CompactRepeatCadenceControls,
  dedupeTaskTagLabels,
  formatNewTaskTagLabel,
  TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS,
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TASK_TABLE_INPUT_CLASS,
  normalizeTaskTagValue,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";

const REPEAT_OPTIONS: ReadonlyArray<{ label: string; value: TaskRepeatFrequency }> = [
  { label: "No Repeat", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Daily Until Complete", value: "daily_until_complete" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Custom Cadence", value: "custom" },
];
const REPEAT_WEEKDAY_OPTIONS = REPEAT_WEEKDAY_FULL_LABELS.map((label, value) => ({ label: label.slice(0, 3), value }));
const REPEAT_MONTHLY_WEEKDAY_OPTIONS = REPEAT_WEEKDAY_FULL_LABELS.map((label, value) => ({ label, value }));
const REPEAT_UNITS: Array<{ label: string; value: TaskRepeatFrequency }> = [
  { label: "Days", value: "daily" },
  { label: "Weeks", value: "weekly" },
  { label: "Months", value: "monthly" },
];
const ENERGY_OPTIONS: ReadonlyArray<{ label: string; value: TaskEnergy }> = [
  { label: "None", value: "none" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

function energyTone(energy: TaskEnergy) {
  if (energy === "high") return "border-[#ffd6de] bg-[#fff1f3] text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]";
  if (energy === "medium") return "border-[#f2df9b] bg-[#fff6df] text-[#b77900] dark:border-[#6b5317] dark:bg-[#44350d] dark:text-[#ffd56b]";
  if (energy === "low") return "border-[#c7eedc] bg-[#e8fbf2] text-[#119a69] dark:border-[#275443] dark:bg-[#16352c] dark:text-[#7de4b8]";
  return "border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60";
}

export function TaskCreationComposer({
  allTags,
  initialTaskTypeSelection = "task",
  onCancel,
  onCreate,
  onCreated,
  submitLabel = "Add",
  taskTypeOptions,
  titleLabel = "Task title",
}: {
  allTags: string[];
  initialTaskTypeSelection?: string;
  onCancel: () => void;
  onCreate: (draft: TaskCreationDraft) => Promise<TaskCreationSubmission>;
  onCreated?: () => void;
  submitLabel?: string;
  taskTypeOptions: ReadonlyArray<TaskTypeSelectionOption>;
  titleLabel?: string;
}) {
  const [title, setTitle] = useState("");
  const [taskTypeSelection, setTaskTypeSelection] = useState(initialTaskTypeSelection);
  const [dueOn, setDueOn] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [repeatFrequency, setRepeatFrequency] = useState<TaskRepeatFrequency>("none");
  const [repeatInterval, setRepeatInterval] = useState("1");
  const [repeatDaysOfWeek, setRepeatDaysOfWeek] = useState<number[]>([]);
  const [repeatDayOfMonth, setRepeatDayOfMonth] = useState("");
  const [repeatMonthlyMode, setRepeatMonthlyMode] = useState<TaskRepeatMonthlyMode>("day_of_month");
  const [repeatMonthlyOrdinal, setRepeatMonthlyOrdinal] = useState<TaskRepeatMonthlyOrdinal | null>(null);
  const [repeatMonthlyWeekday, setRepeatMonthlyWeekday] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [priority, setPriority] = useState<TaskPriorityLevelOption>("0");
  const [energy, setEnergy] = useState<TaskEnergy>("none");
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const normalizedTagDraft = normalizeTaskTagValue(tagDraft);
  const selectedTagSet = new Set(tags.map((tag) => normalizeTaskTagValue(tag)));
  const tagOptions = useMemo(() => dedupeTaskTagLabels(allTags), [allTags]);
  const availableTagOptions = tagOptions
    .filter((tag) => !selectedTagSet.has(normalizeTaskTagValue(tag)))
    .filter((tag) => !normalizedTagDraft || normalizeTaskTagValue(tag).includes(normalizedTagDraft));
  const exactTagMatch = tagOptions.find((tag) => normalizeTaskTagValue(tag) === normalizedTagDraft) ?? null;

  function selectRepeatFrequency(nextFrequency: TaskRepeatFrequency) {
    setRepeatFrequency(nextFrequency);
    setRepeatInterval((current) => String(parsePositiveInteger(current) ?? 1));
    if (nextFrequency !== "weekly" && nextFrequency !== "custom") setRepeatDaysOfWeek([]);
    if (nextFrequency !== "monthly") {
      setRepeatDayOfMonth("");
      setRepeatMonthlyMode("day_of_month");
      setRepeatMonthlyOrdinal(null);
      setRepeatMonthlyWeekday(null);
    }
  }

  function applyWeekdaysPreset() {
    setRepeatFrequency("weekly");
    setRepeatInterval("1");
    setRepeatDaysOfWeek([...WEEKDAYS_REPEAT_DAYS]);
    setRepeatDayOfMonth("");
    setRepeatMonthlyMode("day_of_month");
    setRepeatMonthlyOrdinal(null);
    setRepeatMonthlyWeekday(null);
  }

  function addTag(rawTag: string) {
    const normalizedTag = formatNewTaskTagLabel(rawTag);
    if (!normalizedTag) return;
    setTags((current) => dedupeTaskTagLabels([...current, normalizedTag]));
    setTagDraft("");
  }

  function removeTag(tagToRemove: string) {
    const normalizedTagToRemove = normalizeTaskTagValue(tagToRemove);
    setTags((current) => current.filter((tag) => normalizeTaskTagValue(tag) !== normalizedTagToRemove));
  }

  function buildMetadata(): TaskCreationMetadata {
    const repeatDay = repeatFrequency === "monthly" && repeatMonthlyMode === "day_of_month"
      ? parseDayOfMonth(repeatDayOfMonth)
      : null;
    const isMonthlyOrdinal = repeatFrequency === "monthly" && repeatMonthlyMode === "ordinal_weekday";
    return {
      due_on: dueOn || null,
      due_time: dueOn ? (dueTime || null) : null,
      energy,
      priority_level: Number.parseInt(priority, 10) as TaskPriorityLevel,
      repeat_day_of_month: repeatDay,
      repeat_days_of_week: repeatFrequency === "weekly" || repeatFrequency === "custom" ? [...repeatDaysOfWeek] : [],
      repeat_frequency: repeatFrequency,
      repeat_interval: parsePositiveInteger(repeatInterval) ?? 1,
      repeat_monthly_mode: repeatFrequency === "monthly" ? repeatMonthlyMode : "day_of_month",
      repeat_monthly_ordinal: isMonthlyOrdinal ? (repeatMonthlyOrdinal ?? "first") : null,
      repeat_monthly_weekday: isMonthlyOrdinal ? (repeatMonthlyWeekday ?? 1) : null,
      tags: [...tags],
    };
  }

  function resetDraft() {
    setTitle("");
    setTaskTypeSelection(initialTaskTypeSelection);
    setDueOn("");
    setDueTime("");
    setRepeatFrequency("none");
    setRepeatInterval("1");
    setRepeatDaysOfWeek([]);
    setRepeatDayOfMonth("");
    setRepeatMonthlyMode("day_of_month");
    setRepeatMonthlyOrdinal(null);
    setRepeatMonthlyWeekday(null);
    setTags([]);
    setTagDraft("");
    setPriority("0");
    setEnergy("none");
  }

  function handleCancel() {
    if (isCreating) return;
    resetDraft();
    setCreationError(null);
    onCancel();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreating || !title.trim()) return;

    setIsCreating(true);
    setCreationError(null);
    try {
      const createdTask = await onCreate({
        metadata: buildMetadata(),
        taskTypeSelection,
        title: title.trim(),
      });
      if (createdTask && "error" in createdTask) {
        if (createdTask.error || !createdTask.taskId) {
          setCreationError(createdTask.error ?? `Unable to add ${titleLabel.toLowerCase()}.`);
          return;
        }
      }
      if (createdTask) {
        resetDraft();
        setCreationError(null);
        onCreated?.();
      }
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2 bg-white dark:bg-[#181226]"
      data-task-creation-composer
      onSubmit={handleSubmit}
    >
      <label className="min-w-[min(100%,16rem)] flex-1">
        <span className="sr-only">{titleLabel}</span>
        <input
          autoComplete="off"
          className={`${TASK_TABLE_INPUT_CLASS} task-creation-input h-12`}
          disabled={isCreating}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={titleLabel}
          ref={titleInputRef}
          required
          value={title}
        />
      </label>
      <label className="w-full sm:w-44 sm:shrink-0">
        <span className="sr-only">Task Type</span>
        <TaskTypeSelect
          ariaLabel="Task Type"
          disabled={isCreating}
          label="Task Type"
          onChange={setTaskTypeSelection}
          openOnFocus
          options={taskTypeOptions}
          value={taskTypeSelection}
        />
      </label>
      <fieldset className="grid w-full min-w-0 gap-3" disabled={isCreating}>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1">
            <span className="text-[11px] font-medium text-[#9b92be] dark:text-white/35">Due date</span>
            <input
              aria-label="Due date"
              className={`${TASK_TABLE_INPUT_CLASS} task-creation-input`}
              onChange={(event) => {
                setDueOn(event.target.value);
                if (!event.target.value) setDueTime("");
              }}
              type="date"
              value={dueOn}
            />
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-[11px] font-medium text-[#9b92be] dark:text-white/35">Due time</span>
            <input aria-label="Due time" className={`${TASK_TABLE_INPUT_CLASS} task-creation-input`} onChange={(event) => setDueTime(event.target.value)} type="time" value={dueTime} />
          </label>
        </div>
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.6fr)]">
          <div className="grid min-w-0 gap-1">
            <span className="text-[11px] font-medium text-[#9b92be] dark:text-white/35">Priority</span>
            <div className="flex flex-wrap gap-2">
              {TASK_PRIORITY_LEVEL_OPTIONS.map((value) => (
                <TaskTableChipButton key={value} onClick={() => setPriority(value)} toneClassName={priority === value ? getSelectedTaskPriorityToneClass(value) : getTaskPriorityToneClass(value)}>
                  {value}
                </TaskTableChipButton>
              ))}
            </div>
          </div>
          <div className="grid min-w-0 gap-1">
            <span className="text-[11px] font-medium text-[#9b92be] dark:text-white/35">Energy</span>
            <div className="flex flex-wrap gap-2">
              {ENERGY_OPTIONS.map((option) => (
                <TaskTableChipButton key={option.value} onClick={() => setEnergy(option.value)} toneClassName={energy === option.value ? energyTone(option.value) : TASK_TABLE_INACTIVE_CHIP_CLASS}>
                  {option.label}
                </TaskTableChipButton>
              ))}
            </div>
          </div>
          <div className="grid min-w-0 gap-1">
            <span className="text-[11px] font-medium text-[#9b92be] dark:text-white/35">Repeat</span>
            <div className="flex flex-wrap gap-2">
              {REPEAT_OPTIONS.map((option) => (
                <TaskTableChipButton key={option.value} onClick={() => selectRepeatFrequency(option.value)} toneClassName={repeatFrequency === option.value && option.value !== "none" ? TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}>
                  {option.label}
                </TaskTableChipButton>
              ))}
              <TaskTableChipButton onClick={applyWeekdaysPreset} toneClassName={isWeekdaysRepeatSelection(repeatFrequency, repeatDaysOfWeek, parsePositiveInteger(repeatInterval) ?? 1) ? TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS : TASK_TABLE_INACTIVE_CHIP_CLASS}>
                Weekdays
              </TaskTableChipButton>
            </div>
            {repeatFrequency !== "none" ? (
              <div className="mt-1 space-y-2">
                <CompactRepeatCadenceControls
                  activeToneClassName={TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS}
                  dayInputProps={{
                    inputMode: "numeric",
                    max: 31,
                    min: 1,
                    onBlur: () => setRepeatDayOfMonth((current) => {
                      const parsed = parseDayOfMonth(current);
                      return parsed === null ? "" : String(parsed);
                    }),
                    onChange: (event) => setRepeatDayOfMonth(event.target.value.replace(/[^\d]/g, "").slice(0, 2)),
                    className: "task-creation-cadence-input",
                    type: "text",
                    value: repeatDayOfMonth,
                  }}
                  inactiveToneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}
                  intervalInputProps={{
                    inputMode: "numeric",
                    min: 1,
                    onBlur: () => setRepeatInterval((current) => String(parsePositiveInteger(current) ?? 1)),
                    onChange: (event) => setRepeatInterval(event.target.value.replace(/[^\d]/g, "")),
                    className: "task-creation-cadence-input",
                    type: "text",
                    value: repeatInterval,
                  }}
                  monthlyMode={repeatMonthlyMode}
                  monthlyModeOptions={REPEAT_MONTHLY_MODE_OPTIONS}
                  monthlyOrdinal={repeatMonthlyOrdinal}
                  monthlyOrdinalOptions={REPEAT_MONTHLY_ORDINAL_OPTIONS}
                  monthlyWeekday={repeatMonthlyWeekday}
                  onMonthlyModeClick={(value) => {
                    setRepeatMonthlyMode(value);
                    setRepeatMonthlyOrdinal(value === "ordinal_weekday" ? (repeatMonthlyOrdinal ?? "first") : null);
                    setRepeatMonthlyWeekday(value === "ordinal_weekday" ? (repeatMonthlyWeekday ?? 1) : null);
                  }}
                  onMonthlyOrdinalClick={(value) => {
                    setRepeatMonthlyMode("ordinal_weekday");
                    setRepeatMonthlyOrdinal(value);
                    setRepeatMonthlyWeekday(repeatMonthlyWeekday ?? 1);
                  }}
                  onMonthlyWeekdayClick={(value) => {
                    setRepeatMonthlyMode("ordinal_weekday");
                    setRepeatMonthlyOrdinal(repeatMonthlyOrdinal ?? "first");
                    setRepeatMonthlyWeekday(value);
                  }}
                  onRepeatUnitClick={selectRepeatFrequency}
                  onWeekdayClick={(weekday) => setRepeatDaysOfWeek((current) => current.includes(weekday) ? current.filter((value) => value !== weekday) : [...current, weekday].sort((left, right) => left - right))}
                  repeat={repeatFrequency}
                  repeatDaysOfWeek={repeatDaysOfWeek}
                  repeatUnits={REPEAT_UNITS}
                  showInterval
                  showMonthDay={(repeatFrequency === "monthly" || repeatFrequency === "custom") && repeatMonthlyMode !== "ordinal_weekday"}
                  showMonthlyMode={repeatFrequency === "monthly" || repeatFrequency === "custom"}
                  showMonthlyOrdinals={(repeatFrequency === "monthly" || repeatFrequency === "custom") && repeatMonthlyMode === "ordinal_weekday"}
                  showMonthlyWeekdays={(repeatFrequency === "monthly" || repeatFrequency === "custom") && repeatMonthlyMode === "ordinal_weekday"}
                  showWeekdays={repeatFrequency === "weekly" || repeatFrequency === "custom"}
                  weekdayOptions={repeatMonthlyMode === "ordinal_weekday" ? REPEAT_MONTHLY_WEEKDAY_OPTIONS : REPEAT_WEEKDAY_OPTIONS}
                />
              </div>
            ) : null}
          </div>
        </div>
        <div className="grid min-w-0 gap-2">
          <span className="text-[11px] font-medium text-[#9b92be] dark:text-white/35">Tags</span>
          <div className="flex flex-wrap gap-2">
            {tags.length > 0 ? tags.map((tag) => (
              <TaskTableChipButton key={tag} onClick={() => removeTag(tag)} toneClassName={TASK_TABLE_ACTIVE_LIST_CHIP_CLASS}>
                #{tag}
                <X className="ml-1 h-3.5 w-3.5" />
              </TaskTableChipButton>
            )) : <span className="text-sm text-[#7d7597] dark:text-white/55">No tags on this task yet.</span>}
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              aria-label="Search or add a tag"
              className={`${TASK_TABLE_INPUT_CLASS} task-creation-input min-w-[12rem] flex-1 sm:min-w-[16rem]`}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || !tagDraft.trim()) return;
                event.preventDefault();
                addTag(exactTagMatch ?? tagDraft);
              }}
              placeholder="Search or add a tag"
              type="text"
              value={tagDraft}
            />
            {exactTagMatch ? <TaskTableChipButton onClick={() => addTag(exactTagMatch)} toneClassName={TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS}>Use #{exactTagMatch}</TaskTableChipButton> : null}
            {normalizedTagDraft && !exactTagMatch ? <TaskTableChipButton onClick={() => addTag(tagDraft)} toneClassName={TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS}>{`Add "${formatNewTaskTagLabel(tagDraft)}"`}</TaskTableChipButton> : null}
          </div>
          {availableTagOptions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {availableTagOptions.map((tag) => <TaskTableChipButton key={tag} onClick={() => addTag(tag)} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>#{tag}</TaskTableChipButton>)}
            </div>
          ) : <span className="text-sm text-[#7d7597] dark:text-white/55">{normalizedTagDraft ? "No matching saved tags." : "No saved tags yet."}</span>}
        </div>
      </fieldset>
      <div className="flex shrink-0 gap-1.5">
        <AdhdChip disabled={isCreating} selected type="submit">{isCreating ? "Adding…" : submitLabel}</AdhdChip>
        <AdhdChip disabled={isCreating} onClick={handleCancel}>Cancel</AdhdChip>
      </div>
      {creationError ? <p className="w-full text-xs font-medium text-[#d94e67] dark:text-[#ff9eaf]">{creationError}</p> : null}
    </form>
  );
}

export function TaskChildCreationComposer({
  allTags,
  childLabel,
  onCancel,
  onCreateChildTask,
  onCreated,
  parentTaskId,
  taskTypeOptions,
}: {
  allTags: string[];
  childLabel: "Step" | "Substep";
  onCancel: () => void;
  onCreateChildTask: (parentTaskId: string, title: string, taskTypeSelectionValue: string, metadata: TaskCreationMetadata) => Promise<TaskChildCreationResult>;
  onCreated?: () => void;
  parentTaskId: string;
  taskTypeOptions: ReadonlyArray<TaskTypeSelectionOption>;
}) {
  return (
    <TaskCreationComposer
      allTags={allTags}
      onCancel={onCancel}
      onCreate={(draft) => onCreateChildTask(parentTaskId, draft.title, draft.taskTypeSelection, draft.metadata)}
      onCreated={onCreated}
      submitLabel={`Add ${childLabel}`}
      taskTypeOptions={taskTypeOptions}
      titleLabel={`${childLabel} title`}
    />
  );
}
