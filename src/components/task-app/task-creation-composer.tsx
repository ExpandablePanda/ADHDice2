"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { TaskTypeSelect } from "./task-type-identity";
import { TaskRepeatEditor } from "@/components/ui/task-repeat-editor";
import type { TaskEnergy } from "@/lib/database.types";
import {
  getSelectedTaskPriorityToneClass,
  getTaskPriorityToneClass,
  TASK_PRIORITY_LEVEL_OPTIONS,
  type TaskPriorityLevel,
  type TaskPriorityLevelOption,
} from "@/lib/task-priority";
import { taskRepeatEditorValueToUpdate, type TaskRepeatEditorValue } from "@/lib/task-repeat";
import type { TaskTypeSelectionOption } from "@/lib/task-type";
import type { TaskChildCreationResult, TaskCreationDraft, TaskCreationMetadata, TaskCreationSubmission } from "@/lib/task-creation";
import {
  dedupeTaskTagLabels,
  formatNewTaskTagLabel,
  TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS,
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TASK_TABLE_INPUT_CLASS,
  normalizeTaskTagValue,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";

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
  initialDueOn,
  initialPriority = "0",
  initialTitle = "",
  initialTaskTypeSelection = "task",
  onCancel,
  onCreate,
  onCreated,
  submitLabel = "Add",
  taskTypeOptions,
  titleLabel = "Task title",
}: {
  allTags: string[];
  initialDueOn: string;
  initialPriority?: TaskPriorityLevelOption;
  initialTitle?: string;
  initialTaskTypeSelection?: string;
  onCancel: () => void;
  onCreate: (draft: TaskCreationDraft) => Promise<TaskCreationSubmission>;
  onCreated?: () => void;
  submitLabel?: string;
  taskTypeOptions: ReadonlyArray<TaskTypeSelectionOption>;
  titleLabel?: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [taskTypeSelection, setTaskTypeSelection] = useState(initialTaskTypeSelection);
  const [dueOn, setDueOn] = useState(initialDueOn);
  const [dueTime, setDueTime] = useState("");
  const [repeatValue, setRepeatValue] = useState<TaskRepeatEditorValue>({
    repeatFrequency: "none",
    repeatInterval: 1,
    repeatDaysOfWeek: [],
    repeatDayOfMonth: null,
    repeatMonthlyMode: "day_of_month",
    repeatMonthlyOrdinal: null,
    repeatMonthlyWeekday: null,
    repeatEndOn: null,
  });
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [priority, setPriority] = useState<TaskPriorityLevelOption>(initialPriority);
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
    const repeat = taskRepeatEditorValueToUpdate(repeatValue);
    return {
      due_on: dueOn || null,
      due_time: dueOn ? (dueTime || null) : null,
      energy,
      priority_level: Number.parseInt(priority, 10) as TaskPriorityLevel,
      ...repeat,
      tags: [...tags],
    };
  }

  function resetDraft() {
    setTitle(initialTitle);
    setTaskTypeSelection(initialTaskTypeSelection);
    setDueOn(initialDueOn);
    setDueTime("");
    setRepeatValue({
      repeatFrequency: "none",
      repeatInterval: 1,
      repeatDaysOfWeek: [],
      repeatDayOfMonth: null,
      repeatMonthlyMode: "day_of_month",
      repeatMonthlyOrdinal: null,
      repeatMonthlyWeekday: null,
      repeatEndOn: null,
    });
    setTags([]);
    setTagDraft("");
    setPriority(initialPriority);
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
            <TaskRepeatEditor
              activeToneClassName={TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS}
              dueOn={dueOn || null}
              embedded
              inactiveToneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}
              onChange={setRepeatValue}
              value={repeatValue}
            />
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
  initialDueOn,
  onCancel,
  onCreateChildTask,
  onCreated,
  parentTaskId,
  taskTypeOptions,
}: {
  allTags: string[];
  childLabel: "Step" | "Substep";
  initialDueOn: string;
  onCancel: () => void;
  onCreateChildTask: (parentTaskId: string, title: string, taskTypeSelectionValue: string, metadata: TaskCreationMetadata) => Promise<TaskChildCreationResult>;
  onCreated?: () => void;
  parentTaskId: string;
  taskTypeOptions: ReadonlyArray<TaskTypeSelectionOption>;
}) {
  return (
    <TaskCreationComposer
      allTags={allTags}
      initialDueOn={initialDueOn}
      onCancel={onCancel}
      onCreate={(draft) => onCreateChildTask(parentTaskId, draft.title, draft.taskTypeSelection, draft.metadata)}
      onCreated={onCreated}
      submitLabel={`Add ${childLabel}`}
      taskTypeOptions={taskTypeOptions}
      titleLabel={`${childLabel} title`}
    />
  );
}
