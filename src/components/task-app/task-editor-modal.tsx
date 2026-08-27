"use client";

import type { User } from "@supabase/supabase-js";
import { CalendarDays, Clock, Footprints, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ModalShell } from "../modal-shell";
import type { TaskEditorLinkedNote } from "@/lib/task-notes";
import { isTaskFinishedStatusValue } from "@/lib/task-buckets";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { Task, TaskEnergy, TaskRepeatFrequency, TaskStatus } from "@/lib/database.types";
import { getSelectableTaskStatusesForTask } from "@/lib/task-complete";
import { buildTaskPriorityUpdate, formatTaskPriorityMenuLabel, getSelectedTaskPriorityToneClass, getTaskPriorityToneClass, TASK_PRIORITY_LEVEL_OPTIONS } from "@/lib/task-priority";

import {
  applyTaskEditorDraftOverrides,
  buildDraftSubtasksFromLines,
  createTaskEditorDraft,
  emptyToNull,
  formatEstimatedMinutesLabel,
  mergeDraftSubtasksWithLines,
  parseDayOfMonth,
  parsePositiveInteger,
  serializeTaskEditorDraft,
  type TaskDraft,
  type TaskEditorDraft,
  type TaskEditorMode,
  type TaskSubtaskDraft,
  type VerticalScrollIndicator,
} from "./task-editor-model";
import {
  CompactDateTimeField,
  CompactSelectField,
  EditorCollapsibleSection,
  LabeledInput,
  Pill,
  TagChipInput,
  ToggleField,
} from "./task-editor-fields";
import { TaskDelayPicker } from "./task-delay-picker";
import { TASK_STATUS_CHIP_STYLES, formatTaskStatusLabel, renderTaskStatusChip, renderTaskStatusCircle, renderTaskStatusGlyph } from "./task-status-ui";
import { CompactRepeatCadenceControls } from "@/components/ui/task-table-primitives";
import {
  formatRepeatFrequencyLabel,
  REPEAT_MONTHLY_MODE_OPTIONS,
  REPEAT_MONTHLY_ORDINAL_OPTIONS,
  REPEAT_WEEKDAY_FULL_LABELS,
} from "@/lib/task-repeat";
import { shiftDateKey } from "@/lib/task-grid-layout";
import { todayISO } from "@/lib/utils";

const energyOptions: TaskEnergy[] = ["none", "low", "medium", "high"];
const repeatFrequencyOptions: TaskRepeatFrequency[] = ["none", "daily", "daily_until_complete", "weekly", "monthly", "custom"];
const repeatWeekdayOptions = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
] as const;
const repeatMonthlyWeekdayOptions = REPEAT_WEEKDAY_FULL_LABELS.map((label, value) => ({ label, value }));

function newSubtaskDraft(): TaskSubtaskDraft {
  return { id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title: "", status: "pending", children: [] };
}

function updateSubtaskTree(items: TaskSubtaskDraft[], id: string, updater: (s: TaskSubtaskDraft) => TaskSubtaskDraft): TaskSubtaskDraft[] {
  return items.map((s) => s.id === id ? updater(s) : { ...s, children: updateSubtaskTree(s.children, id, updater) });
}

function removeSubtaskFromTree(items: TaskSubtaskDraft[], id: string): TaskSubtaskDraft[] {
  return items.filter((s) => s.id !== id).map((s) => ({ ...s, children: removeSubtaskFromTree(s.children, id) }));
}

function addChildToSubtask(items: TaskSubtaskDraft[], parentId: string): TaskSubtaskDraft[] {
  const index = items.findIndex((subtask) => subtask.id === parentId);
  if (index !== -1) {
    const next = [...items];
    next[index] = {
      ...next[index],
      children: [...next[index].children, newSubtaskDraft()],
    };
    return next;
  }

  return items.map((subtask) => ({ ...subtask, children: addChildToSubtask(subtask.children, parentId) }));
}

function SubtaskRow({ depth, onAddChild, onRemove, onUpdate, subtask }: {
  depth: number;
  onAddChild: (parentId: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updater: (s: TaskSubtaskDraft) => TaskSubtaskDraft) => void;
  subtask: TaskSubtaskDraft;
}) {
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const indent = depth * 20;
  const subtaskStatusOptions: Array<{ label: string; status: TaskStatus }> = [
    { label: "Pending", status: "pending" },
    { label: "In Progress", status: "in_progress" },
    { label: "Done", status: "done" },
    { label: "Missed", status: "missed" },
    { label: "Did My Best", status: "did_my_best" },
    { label: "Upcoming", status: "upcoming" },
    { label: "Not Due", status: "not_due" },
  ];

  function renderSubtaskStatusIcon(status: TaskStatus) {
    return renderTaskStatusCircle(status, "sm");
  }

  return (
    <div style={{ marginLeft: indent }}>
      <div className={`relative flex items-center gap-2 rounded-[1rem] border px-3 py-2.5 border-[#ece8f8] bg-white dark:border-white/10 dark:bg-white/[0.04]`}>
        <div className="relative shrink-0">
          <button
            aria-label="Change subtask status"
            className="transition"
            onClick={() => setIsStatusMenuOpen((current) => !current)}
            title="Change status"
            type="button"
          >
            {renderSubtaskStatusIcon(subtask.status)}
          </button>
          {isStatusMenuOpen ? (
            <div className="absolute left-0 top-full z-20 mt-2 min-w-[180px] overflow-hidden rounded-[0.9rem] border border-[#ece8f8] bg-white p-2 shadow-lg dark:border-white/10 dark:bg-[#1a1230]">
              {subtaskStatusOptions.map((option) => (
                <button
                  className={`mb-1 flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm font-semibold transition last:mb-0 ${TASK_STATUS_CHIP_STYLES[option.status as TaskStatus]} hover:opacity-90`}
                  key={option.status}
                  onClick={() => {
                    onUpdate(subtask.id, (current) => ({ ...current, status: option.status }));
                    setIsStatusMenuOpen(false);
                  }}
                  type="button"
                >
                  {renderTaskStatusCircle(option.status, "sm")}
                  <span>{formatTaskStatusLabel(option.status)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <input
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${isClosedSubtaskStatus(subtask.status) ? "line-through opacity-50" : ""} text-[#1f2642] dark:text-white`}
          onChange={(e) => onUpdate(subtask.id, (s) => ({ ...s, title: e.target.value }))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
            }
          }}
          placeholder="Step…"
          value={subtask.title}
        />
        <button
          className={`shrink-0 rounded-full p-2 bg-[#f2edff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]`}
          onClick={() => onAddChild(subtask.id)}
          title="Add child step"
          type="button"
        >
          <Footprints className="h-3.5 w-3.5" />
        </button>
        <button
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-[#fff1f3] text-[#f05566] dark:bg-[#44232f] dark:text-[#ff9eaf]`}
          onClick={() => onRemove(subtask.id)}
          type="button"
        >✕</button>
      </div>
      {subtask.children.length > 0 ? (
        <div className="mt-1.5 space-y-1.5">
          {subtask.children.map((child) => (
            <SubtaskRow depth={depth + 1} key={child.id} onAddChild={onAddChild} onRemove={onRemove} onUpdate={onUpdate} subtask={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NoteLinkPicker({
  allNotes,
  selectedNoteIds,
  onToggle,
}: {
  allNotes: TaskEditorLinkedNote[];
  selectedNoteIds: string[];
  onToggle: (noteId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const linkedNotes = allNotes.filter((note) => selectedNoteIds.includes(note.id));

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          className={isOpen ? "ui-pill-button-strong-light" : "ui-pill-button-light"}
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          Link Notes
        </button>
        {linkedNotes.map((note) => (
          <button
            className="ui-pill-button-light"
            key={note.id}
            onClick={() => onToggle(note.id)}
            type="button"
          >
            {note.title.trim() || "Untitled note"} ✕
          </button>
        ))}
      </div>
      {isOpen ? (
        <div className="adhdice-scrollbar max-h-56 overflow-y-auto rounded-[1rem] border border-[#ece8f8] bg-[#fcfbff] p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/40">Notes</p>
          <div className="space-y-2">
            {allNotes.length === 0 ? (
              <span className="text-sm text-[#8d97b0] dark:text-white/45">No saved notes yet.</span>
            ) : (
              allNotes.map((note) => {
                const selected = selectedNoteIds.includes(note.id);
                const preview = note.body.trim().slice(0, 80);
                return (
                  <button
                    className={`flex w-full items-start justify-between gap-3 rounded-[0.9rem] px-3 py-3 text-left transition ${selected
                      ? "bg-[#ede8ff] text-[#1f2642] dark:bg-[#22193f] dark:text-white"
                      : "bg-white text-[#1f2642] hover:bg-[#f7f5ff] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/8"}`}
                    key={note.id}
                    onClick={() => onToggle(note.id)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{note.title.trim() || "Untitled note"}</p>
                      {preview ? <p className="mt-1 text-xs text-[#7d88a1] dark:text-white/50">{preview}</p> : null}
                    </div>
                    <span className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${selected ? "bg-[#6f57f6] dark:bg-[#cabfff]" : "bg-[#d8d0ee] dark:bg-white/20"}`} />
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TaskEditorModal({
  allTags,
  client,
  currentUser,
  focusedToday,
  mode,
  initialDraftOverride,
  onClose,
  onOpenHistory,
  onSave,
  statusResetSignal,
  subtasks,
  task,
  todayDateKey,
}: {
  allTags: string[];
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  currentUser: User;
  focusedToday: string[];
  mode: TaskEditorMode;
  initialDraftOverride?: Partial<TaskEditorDraft> | null;
  onClose: () => void;
  onOpenHistory?: () => void;
  onSave: (draft: { values: TaskDraft; focusToday: boolean; linkedNoteIds: string[]; subtasks: TaskSubtaskDraft[] }) => Promise<void>;
  statusResetSignal?: { status: TaskStatus; taskId: string; token: number } | null;
  subtasks: Task[];
  task: Task | null;
  todayDateKey?: string;
}) {
  const [draft, setDraft] = useState<TaskEditorDraft>(() => applyTaskEditorDraftOverrides(
    createTaskEditorDraft(task, task ? focusedToday.includes(task.id) : false, subtasks),
    mode === "create" ? initialDraftOverride : null,
  ));
  const [availableNotes, setAvailableNotes] = useState<TaskEditorLinkedNote[]>([]);
  const [subtaskMultiAdd, setSubtaskMultiAdd] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isEstimatedTimeMenuOpen, setIsEstimatedTimeMenuOpen] = useState(false);
  const [editorScrollIndicator, setEditorScrollIndicator] = useState<VerticalScrollIndicator>({
    active: false,
    height: 0,
    scrollable: false,
    top: 0,
  });
  const saveInFlightRef = useRef(false);
  const isEditing = mode === "edit" && task !== null;
  const draftRef = useRef<TaskEditorDraft>(applyTaskEditorDraftOverrides(
    createTaskEditorDraft(task, task ? focusedToday.includes(task.id) : false, subtasks),
    mode === "create" ? initialDraftOverride : null,
  ));
  const editorScrollContentRef = useRef<HTMLDivElement | null>(null);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const editorScrollIdleTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const nextDraft = applyTaskEditorDraftOverrides(
      createTaskEditorDraft(task, task ? focusedToday.includes(task.id) : false, subtasks),
      mode === "create" ? initialDraftOverride : null,
    );
    draftRef.current = nextDraft;

    const frame = window.requestAnimationFrame(() => {
      setDraft(nextDraft);
      setSubtaskMultiAdd("");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [task, mode, focusedToday, initialDraftOverride, subtasks]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!statusResetSignal || !task || statusResetSignal.taskId !== task.id) {
      return;
    }

    setDraft((current) => ({ ...current, status: statusResetSignal.status }));
  }, [statusResetSignal, task]);

  useEffect(() => () => {
    if (editorScrollIdleTimeoutRef.current) {
      window.clearTimeout(editorScrollIdleTimeoutRef.current);
    }
  }, []);

  function updateEditorScrollIndicator(active = false) {
    const scrollElement = editorScrollRef.current;
    if (!scrollElement) {
      return;
    }

    const { clientHeight, scrollHeight, scrollTop } = scrollElement;
    const scrollable = scrollHeight > clientHeight + 1;
    const height = scrollable ? Math.max(56, (clientHeight / scrollHeight) * clientHeight) : 0;
    const maxTop = Math.max(0, clientHeight - height);
    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    const top = scrollable ? (scrollTop / maxScroll) * maxTop : 0;

    setEditorScrollIndicator({
      active,
      height,
      scrollable,
      top,
    });
  }

  function handleEditorScroll() {
    updateEditorScrollIndicator(true);

    if (editorScrollIdleTimeoutRef.current) {
      window.clearTimeout(editorScrollIdleTimeoutRef.current);
    }

    editorScrollIdleTimeoutRef.current = window.setTimeout(() => {
      updateEditorScrollIndicator(false);
    }, 900);
  }

  useEffect(() => {
    const scrollElement = editorScrollRef.current;
    if (!scrollElement) {
      return;
    }

    const measure = () => updateEditorScrollIndicator(false);
    measure();
    const frame = window.requestAnimationFrame(measure);
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(scrollElement);

    if (editorScrollContentRef.current) {
      resizeObserver.observe(editorScrollContentRef.current);
    }

    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [availableNotes.length, draft, isEstimatedTimeMenuOpen, subtaskMultiAdd, task]);

  useEffect(() => {
    let cancelled = false;

    void client
      .from("adhdice_notes")
      .select("id,title,body,linked_task_ids,updated_at")
      .eq("user_id", currentUser.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data) {
          return;
        }

        const notes = data as TaskEditorLinkedNote[];
        setAvailableNotes(notes);
        if (!task) {
          return;
        }

        const linkedNoteIds = notes
          .filter((note) => note.linked_task_ids.includes(task.id))
          .map((note) => note.id);

        setDraft((current) => ({ ...current, linkedNoteIds }));
      });

    return () => {
      cancelled = true;
    };
  }, [client, currentUser.id, task]);

  const trimmedTitle = draft.title.trim();
  const normalizedUrl = draft.externalLinkUrl.trim();
  const hasUrlError = normalizedUrl.length > 0 && !isProbablyValidUrl(normalizedUrl);
  const initialDraft = useMemo(
    () => applyTaskEditorDraftOverrides(
      createTaskEditorDraft(task, task ? focusedToday.includes(task.id) : false, subtasks),
      mode === "create" ? initialDraftOverride : null,
    ),
    [focusedToday, initialDraftOverride, mode, subtasks, task],
  );
  const linkedNoteIdsFromRecord = useMemo(
    () => task
      ? availableNotes.filter((note) => note.linked_task_ids.includes(task.id)).map((note) => note.id).sort()
      : [],
    [availableNotes, task],
  );
  const pendingSubtaskLines = useMemo(() => buildDraftSubtasksFromLines(subtaskMultiAdd), [subtaskMultiAdd]);
  const combinedSubtasksForSave = useMemo(
    () => mergeDraftSubtasksWithLines(draft.subtasks, subtaskMultiAdd),
    [draft.subtasks, subtaskMultiAdd],
  );
  const isDirty = serializeTaskEditorDraft(draft) !== serializeTaskEditorDraft({
    ...initialDraft,
    linkedNoteIds: linkedNoteIdsFromRecord,
  }) || pendingSubtaskLines.length > 0;

  const estimatedTimePresets = [
    { label: "5m", minutes: "5" },
    { label: "10m", minutes: "10" },
    { label: "15m", minutes: "15" },
    { label: "30m", minutes: "30" },
    { label: "45m", minutes: "45" },
    { label: "1h", minutes: "60" },
  ];
  const selectedEstimatedTimeLabel = estimatedTimePresets.find((preset) => preset.minutes === draft.estimatedMinutes)?.label
    ?? formatEstimatedMinutesLabel(draft.estimatedMinutes);
  const hasPresetEstimatedTime = estimatedTimePresets.some((preset) => preset.minutes === draft.estimatedMinutes);
  const customEstimatedMinutes = hasPresetEstimatedTime
    ? null
    : parsePositiveInteger(draft.estimatedMinutes);
  const customEstimatedHoursValue = customEstimatedMinutes === null ? "" : String(Math.floor(customEstimatedMinutes / 60));
  const customEstimatedMinuteValue = customEstimatedMinutes === null ? "" : String(customEstimatedMinutes % 60);
  const logicalTodayDateKey = todayDateKey ?? todayISO();
  const delayAnchorDateKey = task?.due_on && task.due_on > logicalTodayDateKey ? task.due_on : logicalTodayDateKey;
  const requiresDelayedDueDate = draft.status === "delayed" && Boolean(task?.due_on);

  function updateEstimatedTimeParts(hoursPart: string, minutesPart: string) {
    const normalizedHours = hoursPart.replace(/[^\d]/g, "");
    const normalizedMinutes = minutesPart.replace(/[^\d]/g, "");
    const hours = normalizedHours ? Number.parseInt(normalizedHours, 10) : 0;
    const minutes = normalizedMinutes ? Number.parseInt(normalizedMinutes, 10) : 0;
    const safeHours = Number.isFinite(hours) ? Math.max(0, hours) : 0;
    const safeMinutes = Number.isFinite(minutes) ? Math.min(59, Math.max(0, minutes)) : 0;
    const totalMinutes = safeHours * 60 + safeMinutes;

    setDraft((current) => ({
      ...current,
      estimatedMinutes: totalMinutes > 0 ? String(totalMinutes) : "",
    }));
  }

  const visibleStatusOptions: TaskStatus[] = task
    ? getSelectableTaskStatusesForTask({ dueOn: task.due_on, repeatFrequency: task.repeat_frequency, status: task.status })
    : getSelectableTaskStatusesForTask({ dueOn: draft.dueOn, repeatFrequency: draft.repeatFrequency, status: draft.status }).filter((status) => status !== "complete");
  const compactRepeatOptions = repeatFrequencyOptions;
  const compactRepeatLabel = formatRepeatFrequencyLabel(
    draft.repeatFrequency,
    Math.max(1, parsePositiveInteger(draft.repeatInterval) ?? 1),
    draft.repeatDaysOfWeek,
    draft.repeatMonthlyMode,
    draft.repeatMonthlyOrdinal,
    draft.repeatMonthlyWeekday,
  );

  return (
    <ModalShell className={`relative w-full max-w-[42rem] max-h-[92vh] overflow-hidden rounded-[2rem] border border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]`} label="Task editor" mobileFocused={isEditing} onClose={onClose}>
      <div
        className="adhdice-scrollbar-overlay max-h-[92vh] overflow-y-auto"
        onScroll={handleEditorScroll}
        ref={editorScrollRef}
      >
        <div ref={editorScrollContentRef}>
      {/* Header */}
      <div className={`sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-white border-b border-[#ece8f8] dark:bg-[#171328] dark:border-b dark:border-white/10`}>
        <span className={`flex-1 text-sm font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]`}>{isEditing ? "Edit Task" : "New Task"}</span>
        <button
          className={draft.oneStepAtATime ? "ui-pill-button-strong-light" : "ui-pill-button-light"}
          onClick={() => setDraft((c) => ({ ...c, oneStepAtATime: !c.oneStepAtATime }))}
          type="button"
        >
          <Footprints className="mr-1 inline h-3 w-3" />
          ONE STEP AT A TIME
        </button>
        {isEditing && onOpenHistory ? (
          <button
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f0ff] text-[#6f57f6] dark:bg-white/8 dark:text-white/70`}
            onClick={onOpenHistory}
            title="Task history"
            type="button"
          >
            <CalendarDays className="h-4 w-4" />
          </button>
        ) : null}
        {isEditing ? (
          <button
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff1f3] text-[#f05566]"
            onClick={() => onSave({ focusToday: draft.focusToday, linkedNoteIds: [], subtasks: [], values: { title: draft.title, notes: null, status: "trashed" as TaskStatus, ...buildTaskPriorityUpdate(Number.parseInt(draft.priorityLevel, 10) as 0 | 1 | 2 | 3 | 4 | 5), energy: draft.energy, due_on: null, due_time: null, estimated_minutes: null, tags: [], external_link_label: null, external_link_url: null, one_step_at_a_time: false, subtasks_auto_reset: false, repeat_frequency: "none", repeat_interval: 1, repeat_days_of_week: [], repeat_day_of_month: null, repeat_monthly_mode: "day_of_month", repeat_monthly_ordinal: null, repeat_monthly_weekday: null, completed_at: null, trashed_at: new Date().toISOString() } })}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <form
        className="space-y-6 px-5 pb-6 pt-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (saveInFlightRef.current) return;
          const draftSnapshot = draftRef.current;
          const trimmedSnapshotTitle = draftSnapshot.title.trim();
          if (!trimmedSnapshotTitle || hasUrlError) return;
          saveInFlightRef.current = true;
          setIsSaving(true);
          try {
            await onSave({
              focusToday: draftSnapshot.focusToday,
              linkedNoteIds: draftSnapshot.linkedNoteIds,
              subtasks: mergeDraftSubtasksWithLines(draftSnapshot.subtasks, subtaskMultiAdd),
              values: {
                title: trimmedSnapshotTitle,
                notes: emptyToNull(draftSnapshot.notes),
                status: draftSnapshot.status,
                ...buildTaskPriorityUpdate(Number.parseInt(draftSnapshot.priorityLevel, 10) as 0 | 1 | 2 | 3 | 4 | 5),
                energy: draftSnapshot.energy,
                due_on: emptyToNull(draftSnapshot.dueOn),
                due_time: emptyToNull(draftSnapshot.dueTime),
                estimated_minutes: parsePositiveInteger(draftSnapshot.estimatedMinutes),
                tags: draftSnapshot.tags,
                external_link_label: emptyToNull(draftSnapshot.externalLinkLabel),
                external_link_url: emptyToNull(normalizedUrl),
                one_step_at_a_time: draftSnapshot.oneStepAtATime,
                subtasks_auto_reset: draftSnapshot.subtasksAutoReset,
                repeat_frequency: draftSnapshot.repeatFrequency,
                repeat_interval: Math.max(1, parsePositiveInteger(draftSnapshot.repeatInterval) ?? 1),
                repeat_days_of_week: draftSnapshot.repeatFrequency === "weekly" || draftSnapshot.repeatFrequency === "custom"
                  ? [...draftSnapshot.repeatDaysOfWeek].sort((a, b) => a - b)
                  : [],
                repeat_day_of_month: draftSnapshot.repeatFrequency === "monthly" || draftSnapshot.repeatFrequency === "custom"
                  ? (draftSnapshot.repeatMonthlyMode === "ordinal_weekday" ? null : parseDayOfMonth(draftSnapshot.repeatDayOfMonth))
                  : null,
                repeat_monthly_mode: draftSnapshot.repeatFrequency === "monthly"
                  ? draftSnapshot.repeatMonthlyMode
                  : "day_of_month",
                repeat_monthly_ordinal: draftSnapshot.repeatFrequency === "monthly" && draftSnapshot.repeatMonthlyMode === "ordinal_weekday"
                  ? draftSnapshot.repeatMonthlyOrdinal ?? "first"
                  : null,
                repeat_monthly_weekday: draftSnapshot.repeatFrequency === "monthly" && draftSnapshot.repeatMonthlyMode === "ordinal_weekday"
                  ? draftSnapshot.repeatMonthlyWeekday ?? 1
                  : null,
                completed_at: isTaskFinishedStatusValue(draftSnapshot.status)
                  ? task?.completed_at ?? new Date().toISOString()
                  : null,
              },
            });
          } finally {
            saveInFlightRef.current = false;
            setIsSaving(false);
          }
        }}
      >
        {/* Title */}
        <label className="block rounded-[1.35rem] border border-[#e5def8] bg-[#fbfaff] px-4 py-4 shadow-[0_14px_34px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/[0.04]">
          <input
            className="ui-display-font w-full bg-transparent text-[15px] font-black uppercase tracking-[0.18em] text-[#7a63f7] leading-none outline-none placeholder:text-[#b5a9ef] dark:text-[#c9bbff] dark:placeholder:text-white/25"
            onChange={(e) => setDraft((c) => ({ ...c, title: e.target.value }))}
            placeholder="Name the task"
            style={{ WebkitFontSmoothing: "antialiased", fontWeight: 900, textRendering: "geometricPrecision" }}
            value={draft.title}
          />
        </label>

        <EditorCollapsibleSection
          defaultOpen
          summary={`${formatOptionLabel(draft.status)} · ${formatOptionLabel(draft.energy)} energy${draft.repeatFrequency !== "none" ? ` · ${compactRepeatLabel}` : ""}`}
          title="Metadata"
        >
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CompactSelectField
                label="Status"
                onChange={(value) => setDraft((current) => ({
                  ...current,
                  dueOn: value === "delayed" && (!current.dueOn || current.dueOn <= delayAnchorDateKey)
                    ? shiftDateKey(delayAnchorDateKey, 1)
                    : current.dueOn,
                  status: value,
                }))}
                optionButtonClassName={(status, selected) => `${TASK_STATUS_CHIP_STYLES[status as TaskStatus]} ${selected ? "" : "hover:opacity-90"}`}
                options={visibleStatusOptions}
                renderOption={(status) => renderTaskStatusChip(status as TaskStatus, { size: "sm" })}
                renderValueNode={(status) => renderTaskStatusChip(status as TaskStatus, { size: "sm" })}
                triggerClassName={(status) => `${TASK_STATUS_CHIP_STYLES[status as TaskStatus]} hover:opacity-95`}
                value={draft.status}
              />
              <CompactSelectField
                label="Priority"
                onChange={(value) => setDraft((current) => ({ ...current, priorityLevel: value }))}
                optionButtonClassName={(value, selected) => selected ? getSelectedTaskPriorityToneClass(value) : getTaskPriorityToneClass(value)}
                options={TASK_PRIORITY_LEVEL_OPTIONS}
                renderValueLabel={formatTaskPriorityMenuLabel}
                triggerClassName={(value) => getTaskPriorityToneClass(value)}
                value={draft.priorityLevel}
              />
              <CompactSelectField label="Energy" onChange={(value) => setDraft((c) => ({ ...c, energy: value }))} options={energyOptions} value={draft.energy} />
              <CompactSelectField
                label="Repeat"
                onChange={(value) => setDraft((current) => ({
                  ...current,
                  repeatDayOfMonth: value === "daily_until_complete" ? "" : current.repeatDayOfMonth,
                  repeatDaysOfWeek: value === "daily_until_complete" ? [] : current.repeatDaysOfWeek,
                  repeatMonthlyMode: value === "monthly" ? current.repeatMonthlyMode : "day_of_month",
                  repeatMonthlyOrdinal: value === "monthly" && current.repeatMonthlyMode === "ordinal_weekday"
                    ? (current.repeatMonthlyOrdinal ?? "first")
                    : null,
                  repeatMonthlyWeekday: value === "monthly" && current.repeatMonthlyMode === "ordinal_weekday"
                    ? (current.repeatMonthlyWeekday ?? 1)
                    : null,
                  repeatFrequency: value,
                  repeatInterval: current.repeatInterval,
                }))}
                options={compactRepeatOptions}
                renderValueLabel={(value) => value === draft.repeatFrequency ? compactRepeatLabel : formatOptionLabel(value)}
                value={draft.repeatFrequency}
              />
            </div>

            {requiresDelayedDueDate ? (
              <div className="rounded-[1.15rem] border border-[#e7defc] bg-[#fcfbff] p-4 dark:border-[#41306c] dark:bg-[#18112d]">
                <p className="mb-2 text-sm font-semibold text-[#392f66] dark:text-white">Delayed until</p>
                <TaskDelayPicker
                  anchorDateKey={delayAnchorDateKey}
                  description="Choose a future date to keep this task visibly Delayed until it becomes due again."
                  inputClassName="h-11 rounded-[0.9rem] border border-[#ded6f2] bg-white px-3 text-sm text-[#27304c] outline-none transition focus:border-[#b39eff] dark:border-white/12 dark:bg-[#22193f] dark:text-white dark:focus:border-[#6d56d6]"
                  onSave={async (nextDueOn) => {
                    setDraft((current) => ({ ...current, dueOn: nextDueOn, status: "delayed" }));
                    return true;
                  }}
                  primaryToneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]"
                  saveLabel="Use delay date"
                />
              </div>
            ) : null}

            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-[max-content_max-content] sm:justify-start sm:gap-6">
                <div className="flex items-center gap-3">
                  <span className="ui-field-label dark:text-white/40">Estimated Time</span>
                  <div className="relative">
                    <button
                      aria-expanded={isEstimatedTimeMenuOpen}
                      className={`flex h-12 w-12 items-center justify-center rounded-full border text-[11px] font-bold shadow-[0_10px_24px_rgba(111,87,246,0.08)] transition ${draft.estimatedMinutes
                        ? "border-transparent bg-[#6f57f6] text-white dark:bg-[#cabfff] dark:text-[#1a1431]"
                        : "border-[#e5e0f5] bg-white text-[#66718e] hover:border-[#c4b8ff] dark:border-white/15 dark:bg-white/8 dark:text-white/70 dark:hover:border-white/30"}`}
                      onClick={() => setIsEstimatedTimeMenuOpen((current) => !current)}
                      type="button"
                    >
                      <span className="sr-only">Estimated time</span>
                      {draft.estimatedMinutes ? (
                        <span>{selectedEstimatedTimeLabel}</span>
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                    </button>
                    {isEstimatedTimeMenuOpen ? (
                      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-[min(21rem,calc(100vw-3rem))] rounded-[1.2rem] border border-[#ddd6fb] bg-white p-3 shadow-[0_22px_60px_rgba(56,42,116,0.18)] dark:border-white/10 dark:bg-[#241d3f]">
                        <div className="flex flex-wrap gap-2">
                          {estimatedTimePresets.map((preset) => (
                            <button
                              className={draft.estimatedMinutes === preset.minutes ? "ui-pill-button-strong-light" : "ui-pill-button-light"}
                              key={preset.label}
                              onClick={() => {
                                setDraft((c) => ({ ...c, estimatedMinutes: c.estimatedMinutes === preset.minutes ? "" : preset.minutes }));
                                setIsEstimatedTimeMenuOpen(false);
                              }}
                              type="button"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 flex gap-4">
                          <label className="grid justify-items-center gap-2">
                            <span className="ui-field-label mb-1 block dark:text-white/40">Hours</span>
                            <input
                              className="h-16 w-16 rounded-full border border-[#e5e0f5] bg-[#fbfaff] px-0 text-center text-lg outline-none placeholder:text-[#b0aac8] focus:border-[#9d8cff] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/30"
                              inputMode="numeric"
                              onChange={(e) => updateEstimatedTimeParts(e.target.value, customEstimatedMinuteValue)}
                              placeholder="0"
                              type="text"
                              value={customEstimatedHoursValue}
                            />
                          </label>
                          <label className="grid justify-items-center gap-2">
                            <span className="ui-field-label mb-1 block dark:text-white/40">Minutes</span>
                            <input
                              className="h-16 w-16 rounded-full border border-[#e5e0f5] bg-[#fbfaff] px-0 text-center text-lg outline-none placeholder:text-[#b0aac8] focus:border-[#9d8cff] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/30"
                              inputMode="numeric"
                              onChange={(e) => updateEstimatedTimeParts(customEstimatedHoursValue, e.target.value)}
                              placeholder="0"
                              type="text"
                              value={customEstimatedMinuteValue}
                            />
                          </label>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="ui-field-label dark:text-white/40">Actual Time</span>
                  <button
                    aria-label="Add manual time"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-[#e5e0f5] bg-white text-[#1f2846] shadow-[0_10px_24px_rgba(111,87,246,0.08)] transition hover:border-[#c4b8ff] dark:border-white/15 dark:bg-white/8 dark:text-white/80 dark:hover:border-white/30"
                    onClick={() => setShowActualTimeModal(true)}
                    title="Add manual time"
                    type="button"
                  >
                    <Clock className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {([
                  { key: "focusToday", label: "Focus Today", activeClass: "bg-[#6f57f6] text-white border-[#6f57f6] dark:bg-[#cabfff] dark:text-[#1a1431] dark:border-[#cabfff]", idleClass: "border-[#d9d0ff] text-[#6f57f6] dark:border-[#4b3b8f] dark:text-[#cabfff]" },
                ] as const).map(({ key, label, activeClass, idleClass }) => {
                  const checked = draft[key] as boolean;
                  return (
                    <button
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${checked ? activeClass : idleClass}`}
                      key={key}
                      onClick={() => setDraft((c) => ({ ...c, [key]: !checked }))}
                      type="button"
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </EditorCollapsibleSection>

        {/* REPEAT FREQUENCY */}
        <div className="hidden">
          <p className={`mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40`}>Repeat Frequency</p>
          <div className="flex flex-wrap gap-2">
            {(["none", "daily", "weekly", "monthly", "custom"] as const).map((freq) => (
              <button
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${draft.repeatFrequency === freq
                  ? "border-transparent bg-[#6f57f6] text-white dark:border-transparent dark:bg-[#cabfff] dark:text-[#1a1431]"
                  : "border-[#e5e0f5] text-[#5a607a] hover:border-[#c4b8ff] dark:border-white/15 dark:text-white/70 dark:hover:border-white/30"}`}
                key={freq}
                onClick={() => setDraft((c) => ({ ...c, repeatFrequency: freq }))}
                type="button"
              >
                {freq === "none" ? "None" : freq === "daily" ? "Daily" : freq === "weekly" ? "Weekly" : freq === "monthly" ? "Monthly" : "Days After"}
              </button>
            ))}
          </div>
          {draft.repeatFrequency !== "none" && draft.repeatFrequency !== "daily" ? (
            <div className="mt-3">
              <LabeledInput label="Interval" onChange={(v) => setDraft((c) => ({ ...c, repeatInterval: v }))} placeholder="1" type="number" value={draft.repeatInterval} />
            </div>
          ) : null}
          {draft.repeatFrequency === "weekly" || draft.repeatFrequency === "custom" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {repeatWeekdayOptions.map((option) => {
                const selected = draft.repeatDaysOfWeek.includes(option.value);
                return (
                  <Pill key={option.value} onClick={() => setDraft((c) => ({ ...c, repeatDaysOfWeek: selected ? c.repeatDaysOfWeek.filter((v) => v !== option.value) : [...c.repeatDaysOfWeek, option.value] }))} selected={selected}>
                    {option.label}
                  </Pill>
                );
              })}
            </div>
          ) : null}
          {draft.repeatFrequency === "monthly" || draft.repeatFrequency === "custom" ? (
            <div className="mt-3">
              <LabeledInput label="Day of month" onChange={(v) => setDraft((c) => ({ ...c, repeatDayOfMonth: v }))} placeholder="15" type="number" value={draft.repeatDayOfMonth} />
            </div>
          ) : null}
        </div>

        {/* ENERGY LEVEL */}
        <div className="hidden">
          <p className={`mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40`}>Energy Level</p>
          <div className="flex flex-wrap gap-2">
            {(["none", "low", "medium", "high"] as const).map((e) => {
              const active = draft.energy === e;
              const colors = e === "none"
                ? active ? "bg-[#94a3b8] text-white border-transparent" : "border-[#e5e0f5] text-[#5a607a] dark:border-white/15 dark:text-white/70"
                : e === "low"
                ? active ? "bg-[#12b76a] text-white border-transparent" : "border-[#e5e0f5] text-[#5a607a] dark:border-white/15 dark:text-white/70"
                : e === "medium"
                  ? active ? "bg-[#6f57f6] text-white border-transparent" : "border-[#e5e0f5] text-[#5a607a] dark:border-white/15 dark:text-white/70"
                  : active ? "bg-[#f79009] text-white border-transparent" : "border-[#e5e0f5] text-[#5a607a] dark:border-white/15 dark:text-white/70";
              return (
                <button className={`rounded-full border px-5 py-2 text-sm font-semibold capitalize transition-colors ${colors}`} key={e} onClick={() => setDraft((c) => ({ ...c, energy: e }))} type="button">
                  {formatOptionLabel(e)}
                </button>
              );
            })}
          </div>
        </div>

        {/* ESTIMATED TIME */}
        <div className="hidden">
          <p className={`mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40`}>Estimated Time</p>
          <div className="flex flex-wrap gap-2">
            {estimatedTimePresets.map((preset) => (
              <button
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${draft.estimatedMinutes === preset.minutes
                  ? "border-transparent bg-[#6f57f6] text-white dark:border-transparent dark:bg-[#cabfff] dark:text-[#1a1431]"
                  : "border-[#e5e0f5] text-[#5a607a] hover:border-[#c4b8ff] dark:border-white/15 dark:text-white/70 dark:hover:border-white/30"}`}
                key={preset.label}
                onClick={() => setDraft((c) => ({ ...c, estimatedMinutes: c.estimatedMinutes === preset.minutes ? "" : preset.minutes }))}
                type="button"
              >
                {preset.label}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input
                className={`h-9 w-20 rounded-full border px-3 text-sm outline-none border-[#e5e0f5] bg-white text-[#1e2540] placeholder:text-[#b0aac8] dark:border-white/15 dark:bg-white/8 dark:text-white dark:placeholder:text-white/30`}
                min="1"
                onChange={(e) => setDraft((c) => ({ ...c, estimatedMinutes: e.target.value }))}
                placeholder="min"
                type="number"
                value={estimatedTimePresets.some((p) => p.minutes === draft.estimatedMinutes) ? "" : draft.estimatedMinutes}
              />
            </div>
          </div>
        </div>

        <EditorCollapsibleSection defaultOpen summary={draft.dueOn || draft.repeatFrequency !== "none" ? `${draft.dueOn ? `Due ${draft.dueOn}` : "No due date"}${draft.repeatFrequency !== "none" ? ` · ${compactRepeatLabel}` : ""}` : "No due date or repeat set yet."} title="Schedule">
          <div className="grid gap-4 sm:grid-cols-2">
            <CompactDateTimeField clearLabel="Clear due date" label="Due date" onChange={(value) => setDraft((c) => ({ ...c, dueOn: value }))} onClear={() => setDraft((c) => ({ ...c, dueOn: "" }))} type="date" value={draft.dueOn} />
            <CompactDateTimeField clearLabel="Clear due time" label="Due time" onChange={(value) => setDraft((c) => ({ ...c, dueTime: value }))} onClear={() => setDraft((c) => ({ ...c, dueTime: "" }))} type="time" value={draft.dueTime} />
          </div>
          {draft.repeatFrequency !== "none" ? (
            <div className="grid gap-3 rounded-[1.15rem] border border-[#e7e0fb] bg-white/70 p-3 dark:border-white/10 dark:bg-black/10">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[#392f66] dark:text-white">Repeat details</p>
                <span className="rounded-full bg-[#f2edff] px-3 py-1 text-xs font-semibold text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]">
                  {compactRepeatLabel}
                </span>
              </div>
              {draft.repeatFrequency !== "daily" && draft.repeatFrequency !== "daily_until_complete" ? (
                <div className="sm:max-w-[10rem]">
                  <LabeledInput label="Interval" onChange={(v) => setDraft((c) => ({ ...c, repeatInterval: v }))} placeholder="1" type="number" value={draft.repeatInterval} />
                </div>
              ) : null}
              <CompactRepeatCadenceControls
                activeToneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]"
                dayInputProps={{
                  inputMode: "numeric",
                  max: 31,
                  min: 1,
                  onChange: (event) => setDraft((current) => ({ ...current, repeatDayOfMonth: event.target.value.replace(/[^\d]/g, "").slice(0, 2) })),
                  type: "text",
                  value: draft.repeatDayOfMonth,
                }}
                inactiveToneClassName="border-[#e5e0f5] bg-white text-[#5a607a] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/70"
                intervalInputProps={{
                  inputMode: "numeric",
                  min: 1,
                  onChange: (event) => setDraft((current) => ({ ...current, repeatInterval: event.target.value.replace(/[^\d]/g, "") })),
                  type: "text",
                  value: draft.repeatInterval,
                }}
                monthlyMode={draft.repeatMonthlyMode}
                monthlyModeOptions={REPEAT_MONTHLY_MODE_OPTIONS}
                monthlyOrdinal={draft.repeatMonthlyOrdinal}
                monthlyOrdinalOptions={REPEAT_MONTHLY_ORDINAL_OPTIONS}
                monthlyWeekday={draft.repeatMonthlyWeekday}
                onMonthlyModeClick={(value) => setDraft((current) => ({
                  ...current,
                  repeatMonthlyMode: value,
                  repeatMonthlyOrdinal: value === "ordinal_weekday" ? (current.repeatMonthlyOrdinal ?? "first") : null,
                  repeatMonthlyWeekday: value === "ordinal_weekday" ? (current.repeatMonthlyWeekday ?? 1) : null,
                }))}
                onMonthlyOrdinalClick={(value) => setDraft((current) => ({
                  ...current,
                  repeatMonthlyMode: "ordinal_weekday",
                  repeatMonthlyOrdinal: value,
                  repeatMonthlyWeekday: current.repeatMonthlyWeekday ?? 1,
                }))}
                onMonthlyWeekdayClick={(value) => setDraft((current) => ({
                  ...current,
                  repeatMonthlyMode: "ordinal_weekday",
                  repeatMonthlyOrdinal: current.repeatMonthlyOrdinal ?? "first",
                  repeatMonthlyWeekday: value,
                }))}
                onRepeatUnitClick={(repeatUnit) => setDraft((current) => ({ ...current, repeatFrequency: repeatUnit }))}
                onWeekdayClick={(weekday) => setDraft((current) => ({
                  ...current,
                  repeatDaysOfWeek: current.repeatDaysOfWeek.includes(weekday)
                    ? current.repeatDaysOfWeek.filter((entry) => entry !== weekday)
                    : [...current.repeatDaysOfWeek, weekday].sort((left, right) => left - right),
                }))}
                repeat={draft.repeatFrequency}
                repeatDaysOfWeek={draft.repeatDaysOfWeek}
                repeatUnits={[
                  { label: "Days", value: "daily" },
                  { label: "Weeks", value: "weekly" },
                  { label: "Months", value: "monthly" },
                ]}
                showInterval
                showMonthDay={(draft.repeatFrequency === "monthly" || draft.repeatFrequency === "custom") && draft.repeatMonthlyMode !== "ordinal_weekday"}
                showMonthlyMode={draft.repeatFrequency === "monthly" || draft.repeatFrequency === "custom"}
                showMonthlyOrdinals={(draft.repeatFrequency === "monthly" || draft.repeatFrequency === "custom") && draft.repeatMonthlyMode === "ordinal_weekday"}
                showMonthlyWeekdays={(draft.repeatFrequency === "monthly" || draft.repeatFrequency === "custom") && draft.repeatMonthlyMode === "ordinal_weekday"}
                showWeekdays={draft.repeatFrequency === "weekly" || draft.repeatFrequency === "custom"}
                weekdayOptions={(draft.repeatFrequency === "monthly" || draft.repeatFrequency === "custom") && draft.repeatMonthlyMode === "ordinal_weekday"
                  ? repeatMonthlyWeekdayOptions
                  : repeatWeekdayOptions}
              />
            </div>
          ) : (
            <p className="text-sm text-[#7d88a1] dark:text-white/50">Set repeat to daily, weekly, monthly, or custom if this task should come back automatically.</p>
          )}
        </EditorCollapsibleSection>

        <EditorCollapsibleSection defaultOpen summary={`${draft.notes.trim() ? "Notes added" : "No notes yet."}${draft.linkedNoteIds.length ? ` · ${draft.linkedNoteIds.length} linked note${draft.linkedNoteIds.length === 1 ? "" : "s"}` : ""}`} title="Notes & Links">
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Notes</span>
              <NoteLinkPicker
                allNotes={availableNotes}
                onToggle={(noteId) =>
                  setDraft((current) => ({
                    ...current,
                    linkedNoteIds: current.linkedNoteIds.includes(noteId)
                      ? current.linkedNoteIds.filter((id) => id !== noteId)
                      : [...current.linkedNoteIds, noteId],
                  }))}
                selectedNoteIds={draft.linkedNoteIds}
              />
            </div>
            <textarea
              className={`min-h-24 rounded-[1rem] px-4 py-3 text-sm outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30`}
              onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))}
              placeholder="Create a new note or link an existing note."
              value={draft.notes}
            />
          </div>
          <label className="grid gap-2">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/40">Tags</span>
            <TagChipInput allTags={allTags} onChange={(tags) => setDraft((c) => ({ ...c, tags }))} values={draft.tags} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <LabeledInput label="External link label" onChange={(v) => setDraft((c) => ({ ...c, externalLinkLabel: v }))} placeholder="Reference" value={draft.externalLinkLabel} />
          </div>
          <div>
            <LabeledInput label="External link URL" onChange={(v) => setDraft((c) => ({ ...c, externalLinkUrl: v }))} placeholder="https://..." value={draft.externalLinkUrl} />
            {hasUrlError ? <p className="mt-1 text-sm text-[#d94e67]">Use a full URL like `https://example.com`.</p> : null}
          </div>
        </EditorCollapsibleSection>

        <EditorCollapsibleSection
          defaultOpen={combinedSubtasksForSave.length > 0}
          headerAccessory={<ToggleField checked={draft.subtasksAutoReset} compact label="Auto Reset" onChange={(checked) => setDraft((c) => ({ ...c, subtasksAutoReset: checked }))} />}
          summary={combinedSubtasksForSave.length === 0 ? "No steps yet." : `${combinedSubtasksForSave.length} top-level step${combinedSubtasksForSave.length === 1 ? "" : "s"}`}
          title="Steps"
        >
          <div className="space-y-2">
            {combinedSubtasksForSave.length === 0 ? <EmptyTaskState text="No steps yet." /> : null}
            {draft.subtasks.map((subtask) => (
              <SubtaskRow
                depth={0}
                key={subtask.id}
                onAddChild={(parentId) => setDraft((c) => ({ ...c, subtasks: addChildToSubtask(c.subtasks, parentId) }))}
                onRemove={(id) => setDraft((c) => ({ ...c, subtasks: removeSubtaskFromTree(c.subtasks, id) }))}
                onUpdate={(id, updater) => setDraft((c) => ({ ...c, subtasks: updateSubtaskTree(c.subtasks, id, updater) }))}
                subtask={subtask}
              />
            ))}
          </div>
          <div className="grid gap-2">
            <textarea
              className={`min-h-28 rounded-[1rem] px-4 py-4 text-sm outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30`}
              onChange={(e) => setSubtaskMultiAdd(e.target.value)}
              placeholder={"Parent step\n  Child step\nAnother parent step"}
              value={subtaskMultiAdd}
            />
            <button
              className="ui-pill-button-strong-light self-end"
              onClick={() => {
                const next = pendingSubtaskLines;
                if (!next.length) return;
                const nextDraft = {
                  ...draftRef.current,
                  subtasks: [...draftRef.current.subtasks, ...next],
                };
                draftRef.current = nextDraft;
                setDraft(nextDraft);
                setSubtaskMultiAdd("");
              }}
              type="button"
            >
              Add Steps
            </button>
          </div>
        </EditorCollapsibleSection>

        {/* Due date / time / notes / tags / link */}
        <div className="hidden grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2">
            <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>Due date</span>
            <div className="relative">
              <input
                className={`w-full rounded-[1rem] px-4 py-3 text-sm outline-none ${draft.dueOn ? "text-[#1f2642] dark:text-white" : "text-[#9b9fba] dark:text-white/30"} bg-[#f7f5ff] dark:bg-white/8`}
                onChange={(e) => setDraft((c) => ({ ...c, dueOn: e.target.value }))}
                type="date"
                value={draft.dueOn}
              />
              {draft.dueOn ? (
                <button
                  className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-xs text-[#9b9fba] hover:text-[#f05566] dark:text-white/30 dark:hover:text-[#ff9eaf]`}
                  onClick={() => setDraft((c) => ({ ...c, dueOn: "" }))}
                  type="button"
                >✕</button>
              ) : null}
            </div>
          </label>
          <label className="grid gap-2">
            <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>Due time</span>
            <div className="relative">
              <input
                className={`w-full rounded-[1rem] px-4 py-3 text-sm outline-none ${draft.dueTime ? "text-[#1f2642] dark:text-white" : "text-[#9b9fba] dark:text-white/30"} bg-[#f7f5ff] dark:bg-white/8`}
                onChange={(e) => setDraft((c) => ({ ...c, dueTime: e.target.value }))}
                type="time"
                value={draft.dueTime}
              />
              {draft.dueTime ? (
                <button
                  className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-xs text-[#9b9fba] hover:text-[#f05566] dark:text-white/30 dark:hover:text-[#ff9eaf]`}
                  onClick={() => setDraft((c) => ({ ...c, dueTime: "" }))}
                  type="button"
                >✕</button>
              ) : null}
            </div>
          </label>
        </div>

        <div className="hidden grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>Notes</span>
            <NoteLinkPicker
              allNotes={availableNotes}
              onToggle={(noteId) =>
                setDraft((current) => ({
                  ...current,
                  linkedNoteIds: current.linkedNoteIds.includes(noteId)
                    ? current.linkedNoteIds.filter((id) => id !== noteId)
                    : [...current.linkedNoteIds, noteId],
                }))}
              selectedNoteIds={draft.linkedNoteIds}
            />
          </div>
          <textarea
            className={`min-h-24 rounded-[1rem] px-4 py-3 text-sm outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30`}
            onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))}
            placeholder="Create a new note or link an existing note."
            value={draft.notes}
          />
        </div>

        <label className="hidden grid gap-2">
          <span className={`text-sm font-semibold text-[#5f6983] dark:text-white/65`}>Tags</span>
          <TagChipInput allTags={allTags} onChange={(tags) => setDraft((c) => ({ ...c, tags }))} values={draft.tags} />
        </label>
        <div className="hidden grid gap-4 sm:grid-cols-2">
          <LabeledInput label="External link label" onChange={(v) => setDraft((c) => ({ ...c, externalLinkLabel: v }))} placeholder="Reference" value={draft.externalLinkLabel} />
        </div>
        <div className="hidden">
          <LabeledInput label="External link URL" onChange={(v) => setDraft((c) => ({ ...c, externalLinkUrl: v }))} placeholder="https://..." value={draft.externalLinkUrl} />
          {hasUrlError ? <p className="mt-1 text-sm text-[#d94e67]">Use a full URL like `https://example.com`.</p> : null}
        </div>

        {isDirty ? (
          <div className="sticky bottom-4 z-20 flex justify-end pt-2">
            <button
              className={`rounded-full px-6 py-3 text-base font-bold bg-[#6f57f6] text-white shadow-[0_18px_40px_rgba(111,87,246,0.28)] dark:bg-[#cabfff] dark:text-[#1a1431] disabled:opacity-50`}
              disabled={!trimmedTitle || hasUrlError || isSaving}
              type="submit"
            >
              {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Create Task"}
            </button>
          </div>
        ) : null}
      </form>
        </div>
      </div>
      {editorScrollIndicator.scrollable ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute right-1 top-0 h-full w-1.5 overflow-hidden rounded-full bg-[#efeaff] transition-opacity duration-200 dark:bg-white/10 ${editorScrollIndicator.active ? "opacity-100" : "opacity-85"}`}
        >
          <span
            className="absolute left-0 top-0 block w-full rounded-full bg-[#8d78ff] shadow-[0_0_12px_rgba(124,92,255,0.38)]"
            style={{
              height: `${editorScrollIndicator.height}px`,
              transform: `translateY(${editorScrollIndicator.top}px)`,
            }}
          />
        </div>
      ) : null}
    </ModalShell>
  );
}


function EmptyTaskState({
  text,
}: {
  text: string;
}) {
  return (
    <div className={`rounded-[1.25rem] border border-dashed px-4 py-5 text-sm border-[#ddd6f9] bg-[#faf8ff] text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55`}>
      {text}
    </div>
  );
}

function isClosedSubtaskStatus(status: TaskStatus) {
  return status === "done" || status === "did_my_best";
}

function isProbablyValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatOptionLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
