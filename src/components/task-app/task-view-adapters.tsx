"use client";

import { ChevronDown, X } from "lucide-react";
import { useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ModalShell } from "../modal-shell";
import { BottomDockComponent } from "./bottom-dock";
import { FilterRowsComponent } from "./task-filter-rows";
import { FocusPlannerModalComponent } from "./focus-planner-modal";
import { TaskDelayPicker } from "./task-delay-picker";
import { formatTaskStatusLabel, renderTaskStatusCircle, TASK_STATUS_CHIP_STYLES, TASK_STATUS_INVERTED_CHIP_STYLES } from "./task-status-ui";
import {
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";
import { AdhdIconButton, EditableEntityHeaderTitle } from "@/components/ui-system";
import {
  buildTaskHistoryRowProjections,
  computeTaskSpecificHistoryStats,
  deduplicateTaskHistoryByLogicalDate,
  getTaskHistoryLastDone,
} from "@/lib/task-history";
import {
  TaskCardGalleryComponent,
  TaskMatrixViewComponent,
} from "./task-secondary-views";
import { formatTaskHistoryCalendarDay, formatTaskHistoryCalendarMonth, getTaskHistoryCalendarMonthDays, TaskHistoryCalendarDay, TaskHistoryCalendarPresentation } from "./task-history-calendar-presentation";
import {
  buildTaskHistoryCalendarDateKeys,
  buildTaskHistoryCalendarDateKeysForRange,
  getTaskHistoryInitialFocusDateKey,
} from "@/lib/task-history-calendar-focus";
import { resolveTaskHistorySummaryLabels } from "@/lib/task-history-summary-labels";
import {
  getTaskCalendarMonth,
  shiftTaskCalendarMonth,
  type TaskCalendarMonth,
} from "@/lib/task-calendar";
import type { AppPage } from "@/lib/task-ui-state";
import type { NavigatorSearchTarget } from "@/lib/navigator-search";
import type { TaskSearchEntity } from "@/lib/task-search-selector";
import type { ImportTasksResult, TaskImportOptions, TaskImportProgress } from "@/hooks/useTaskCrudActions";
import { getTaskHistoryCalendarOverrideActions, getTaskHistoryCalendarVisibleActionStatuses, isTaskHistoryEntryClearable } from "@/lib/task-complete";
import { createTaskHistoryCalendarReadRevision, logicalDateForTimestamp, resolveTaskHistoryCalendarActionStatuses, resolveTaskHistoryCalendarRead } from "@/lib/task-state-engine";
import { computeTaskEffectiveTimelineStreaks, taskEffectiveTimelineDaysFromStates } from "@/lib/task-state-engine/effective-timeline";
import type { TaskCalendarOverride } from "@/lib/task-state-engine/types";
import { resolveTaskBehaviorPolicyForTask, type TaskBehaviorPolicyResolutionContext } from "@/lib/task-state-engine/behavior-policy";
import { isWorkspacePerformanceDiagnosticsEnabled } from "@/lib/workspace-performance-diagnostics";
import type {
  CustomBehaviorRuleset,
  Task,
  TaskCurrentProjection,
  TaskHistory as DbTaskHistory,
  TaskStatus,
} from "@/lib/database.types";
import { formatTaskTypeLabel } from "@/lib/task-type";
import type { TaskHistoryStreakSummary } from "@/lib/task-history-streak-summaries";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type FocusPlannerStep = 0 | 1 | 2;

function EmptyTaskState({ text }: { text: string }) {
  return (
    <div className="rounded-[1.25rem] border border-dashed px-4 py-5 text-sm border-[#ddd6f9] bg-[#faf8ff] text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">
      {text}
    </div>
  );
}

function formatCalendarDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) {
    return dateKey;
  }
  return `${Number(month)}/${Number(day)}/${year}`;
}

function formatHistoryDateTime(timestamp: string) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }
  return parsed.toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getTaskHistoryCreatedTimestamp(entry: Pick<DbTaskHistory, "created_at">) {
  return entry.created_at || null;
}

function getTaskHistoryEditedTimestamp(entry: Pick<DbTaskHistory, "created_at" | "updated_at">) {
  if (!entry.updated_at || !entry.created_at || entry.updated_at === entry.created_at) {
    return null;
  }
  return entry.updated_at;
}

function formatTaskHistoryLoggedLine(entry: Pick<DbTaskHistory, "created_at">) {
  const timestamp = getTaskHistoryCreatedTimestamp(entry);
  if (!timestamp) {
    return null;
  }
  return `Logged ${formatHistoryDateTime(timestamp)}`;
}

function formatTaskHistoryEditedLine(entry: Pick<DbTaskHistory, "created_at" | "updated_at">) {
  const timestamp = getTaskHistoryEditedTimestamp(entry);
  if (!timestamp) {
    return null;
  }
  return `Edited ${formatHistoryDateTime(timestamp)}`;
}

function formatTaskCalendarOverrideChangedLine(override: TaskCalendarOverride) {
  return override.createdAt ? `Changed ${formatHistoryDateTime(override.createdAt)}` : null;
}

function statusTone(status: TaskStatus) {
  return TASK_STATUS_CHIP_STYLES[status] ?? TASK_TABLE_INACTIVE_CHIP_CLASS;
}

export function FilterRowsAdapter(props: ComponentProps<typeof FilterRowsComponent>) {
  return <FilterRowsComponent {...props} />;
}

export function ImportWidgetCardAdapter({
  embeddedInModal = false,
  message,
  onImport,
}: {
  embeddedInModal?: boolean;
  message: Message | null;
  onImport: (lines: string[], options?: TaskImportOptions) => Promise<ImportTasksResult | void>;
}) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importProgress, setImportProgress] = useState<TaskImportProgress | null>(null);
  const lines = text.split("\n");
  const nonEmptyLineCount = lines.filter((line) => line.trim().length > 0).length;
  const messageToneClassName = message?.tone === "warn"
    ? "text-[#b44f32] dark:text-[#ffb49f]"
    : message?.tone === "good"
      ? "text-[#2c8b67] dark:text-[#8ce0bb]"
      : "text-[#8c94ac] dark:text-white/45";

  return (
    <section className={embeddedInModal
      ? "min-h-0"
      : "rounded-[2rem] border border-[#ece8f8] bg-white p-5 shadow-[0_18px_50px_rgba(81,61,168,0.07)] transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/6"}
    >
      {embeddedInModal ? null : (
        <>
          <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">
            Import List
          </h2>
          <p className="mt-2 text-sm text-[#78829c] dark:text-white/55">
            Paste a rough list and turn it into calm, structured tasks.
          </p>
        </>
      )}

      <form
        className={`${embeddedInModal ? "space-y-3" : "mt-4 space-y-3"}`}
        onSubmit={async (event) => {
          event.preventDefault();
          if (isSubmitting) return;
          setIsSubmitting(true);
          setImportProgress(null);
          try {
            const result = await onImport(lines, {
              onProgress: (progress) => setImportProgress(progress),
            });
            if (result && result.importedCount > 0 && result.warningCount === 0 && result.errorCount === 0) {
              setText("");
            }
          } finally {
            setImportProgress(null);
            setIsSubmitting(false);
          }
        }}
      >
        <textarea
          className={`w-full resize-y rounded-[1.25rem] px-4 py-4 text-base outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30 ${embeddedInModal ? "min-h-[10rem] max-h-[40vh]" : "min-h-40"}`}
          onChange={(event) => setText(event.target.value)}
          placeholder={"Clean Ears #hygiene *due-Today *repeat-Daily\nMoisturize\n-AM\n--Face\n--Feet\n-PM"}
          value={text}
        />
        <div className="rounded-[1.25rem] border border-[#ede7f7] bg-[#faf8ff] px-4 py-3 text-sm text-[#5d6784] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/65">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d87a7] dark:text-white/35">Syntax Key</p>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            <p><span className="font-semibold text-[#27304c] dark:text-white">Task title</span> = new task</p>
            <p><span className="font-semibold text-[#27304c] dark:text-white">- Step</span> = step under previous task</p>
            <p><span className="font-semibold text-[#27304c] dark:text-white">-- Substep</span> = nested substep</p>
            <p><span className="font-semibold text-[#27304c] dark:text-white">#tag</span> = add/connect tag</p>
            <p><span className="font-semibold text-[#27304c] dark:text-white">*field-value</span> = metadata</p>
          </div>
          <details className="group mt-3 rounded-[1rem] border border-[#e8e1f4] bg-white/75 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-[#27304c] dark:text-white">
              <span>Example + metadata tokens</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-[#8f7fe0] transition-transform duration-200 group-open:rotate-180 dark:text-[#cabfff]" />
            </summary>
            <div className="mt-3 grid gap-1.5 rounded-[0.9rem] bg-white/80 px-3 py-3 text-[13px] dark:bg-[#1a1431]">
              <p>Clean Ears #hygiene *due-Today *repeat-Daily</p>
              <p>Moisturize</p>
              <p>-AM</p>
              <p>--Face</p>
              <p>--Feet</p>
              <p>-PM</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
              {["*due-Today", "*due-Tomorrow", "*due-6/15/2026", "*repeat-Daily", "*status-Pending", "*energy-Low", "*estimate-10m", "*actual-5m"].map((token) => (
                <span className="rounded-full border border-[#e4deef] bg-white px-2.5 py-1 dark:border-white/10 dark:bg-white/8" key={token}>{token}</span>
              ))}
            </div>
          </details>
        </div>
        <button
          className="ui-pill-button-strong-light w-full"
          disabled={nonEmptyLineCount === 0 || isSubmitting}
          type="submit"
        >
          Import {nonEmptyLineCount || ""}
        </button>
        {isSubmitting ? (
          importProgress ? (
            <div aria-live="polite" className="rounded-[1rem] border border-[#e4def2] bg-[#faf8ff] px-3 py-2.5 text-xs text-[#5d6784] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/65">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">Importing tasks</span>
                <span>{importProgress.processed} of {importProgress.total} · {Math.round((importProgress.processed / Math.max(importProgress.total, 1)) * 100)}%</span>
              </div>
              <div aria-label={`Import progress: ${importProgress.processed} of ${importProgress.total}`} aria-valuemax={importProgress.total} aria-valuemin={0} aria-valuenow={importProgress.processed} className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e8e1f4] dark:bg-white/10" role="progressbar">
                <div className="h-full rounded-full bg-[#6f57f6] transition-[width] duration-150" style={{ width: `${Math.min(100, (importProgress.processed / Math.max(importProgress.total, 1)) * 100)}%` }} />
              </div>
            </div>
          ) : (
            <p aria-live="polite" className="text-xs text-[#7d7598] dark:text-white/50">Preparing import…</p>
          )
        ) : null}
      </form>

      <div className={`mt-3 whitespace-pre-wrap text-sm ${messageToneClassName}`}>
        {message?.text}
      </div>
    </section>
  );
}

export function TaskCardGalleryAdapter(props: ComponentProps<typeof TaskCardGalleryComponent>) {
  return <TaskCardGalleryComponent {...props} />;
}

export function TaskMatrixViewAdapter(props: ComponentProps<typeof TaskMatrixViewComponent>) {
  return <TaskMatrixViewComponent {...props} />;
}

export function FocusPlannerModalAdapter({
  draftIds,
  onClose,
  onFinish,
  onSetDraftIds,
  onStepChange,
  step,
  tasks,
  todayDateKey,
}: {
  draftIds: string[];
  onClose: () => void;
  onFinish: () => void;
  onSetDraftIds: (ids: string[]) => void;
  onStepChange: (step: FocusPlannerStep) => void;
  step: FocusPlannerStep;
  tasks: Task[];
  todayDateKey: string;
}) {
  return (
    <FocusPlannerModalComponent
      draftIds={draftIds}
      onClose={onClose}
      onFinish={onFinish}
      onSetDraftIds={onSetDraftIds}
      onStepChange={onStepChange}
      step={step}
      tasks={tasks}
      todayDateKey={todayDateKey}
    />
  );
}

export function MomentumTaskModal({
  doneTasks,
  onClose,
  remainingTasks,
  title,
}: {
  doneTasks: Task[];
  onClose: () => void;
  remainingTasks: Task[];
  title: string;
}) {
  return (
    <ModalShell className="w-full max-w-[42rem] rounded-[2rem] border p-5 border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label={title} onClose={onClose}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-[#1f2746] dark:text-white">{title}</h2>
        <button aria-label="Close" className="text-2xl text-[#8e97af] dark:text-white/55" onClick={onClose} type="button">×</button>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#0e9b74] dark:text-[#6ef0c4]">Finished</p>
          <div className="mt-3 space-y-2">
            {doneTasks.length === 0 ? <EmptyTaskState text="Nothing finished in this group yet." /> : null}
            {doneTasks.map((task) => (
              <div className="rounded-[1rem] px-4 py-3 bg-[#edf9f4] text-[#23423a] dark:bg-[#103c33] dark:text-[#d7fff2]" key={task.id}>
                {task.title}
              </div>
            ))}
          </div>
        </section>
        <section>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#f05566] dark:text-[#ff9eaf]">Remaining</p>
          <div className="mt-3 space-y-2">
            {remainingTasks.length === 0 ? <EmptyTaskState text="Everything in this group is finished." /> : null}
            {remainingTasks.map((task) => (
              <div className="rounded-[1rem] px-4 py-3 bg-[#fff4f6] text-[#7c3042] dark:bg-[#44232f] dark:text-[#ffd5dc]" key={task.id}>
                {task.title}
              </div>
            ))}
          </div>
        </section>
      </div>
    </ModalShell>
  );
}

export function TaskHistoryModal({
  onClose,
  onRenameTaskTitle,
  onRetryTaskHistoryLoad,
  onLoadOlderTaskHistory,
  onSetDelayedStatus,
  onSetCalendarOverride,
  onSetStatuses,
  task,
  taskHistory,
  taskHistoryLoadError = null,
  taskHistoryLoadStatus = "ready",
  taskTitle,
  todayDateKey,
  initialDateKey,
  stateEngineContext,
  behaviorProfiles,
  behaviorPolicyRevisions,
  namedCustomRulesetBehaviorPolicyRevisions,
  behaviorSelectionsByTaskId,
  behaviorPolicyLoading = false,
  customBehaviorRulesets = [],
  calendarOverrides,
  canLoadOlderTaskHistory = false,
  currentTaskHistorySummary = null,
  currentTaskProjection,
  completeSemanticTaskHistory,
  hasCompleteSemanticHistory = false,
  historyWindowEndDate,
  historyWindowStartDate,
}: {
  onClose: () => void;
  onRenameTaskTitle: (taskId: string, nextTitle: string) => Promise<boolean | void> | boolean | void;
  onRetryTaskHistoryLoad?: () => Promise<boolean> | void;
  onLoadOlderTaskHistory?: () => Promise<boolean> | void;
  onSetStatuses: (entryDates: string[], status: "clear" | "complete" | "did_my_best" | "done" | "missed") => Promise<boolean | void>;
  onSetDelayedStatus?: (entryDate: string, nextDueOn: string) => Promise<void>;
  onSetCalendarOverride?: (logicalDate: string, overrideState: "not_due" | "due_open") => Promise<boolean | void>;
  task: Task;
  taskHistory: DbTaskHistory[];
  taskHistoryLoadError?: string | null;
  taskHistoryLoadStatus?: "error" | "loading" | "ready";
  taskTitle: string;
  todayDateKey: string;
  initialDateKey?: string | null;
  stateEngineContext?: { logicalDayRollover: string; now: Date | string; timezone: string };
  behaviorProfiles?: TaskBehaviorPolicyResolutionContext["behaviorProfiles"];
  behaviorPolicyRevisions?: TaskBehaviorPolicyResolutionContext["behaviorPolicyRevisions"];
  namedCustomRulesetBehaviorPolicyRevisions?: TaskBehaviorPolicyResolutionContext["namedCustomRulesetBehaviorPolicyRevisions"];
  behaviorSelectionsByTaskId?: TaskBehaviorPolicyResolutionContext["behaviorSelectionsByTaskId"];
  behaviorPolicyLoading?: boolean;
  customBehaviorRulesets?: readonly Pick<CustomBehaviorRuleset, "id" | "name" | "task_type">[];
  calendarOverrides?: TaskCalendarOverride[];
  canLoadOlderTaskHistory?: boolean;
  currentTaskHistorySummary?: TaskHistoryStreakSummary | null;
  currentTaskProjection?: Pick<TaskCurrentProjection, "current_positive_streak" | "last_done_logical_date">;
  completeSemanticTaskHistory?: DbTaskHistory[];
  hasCompleteSemanticHistory?: boolean;
  historyWindowEndDate?: string;
  historyWindowStartDate?: string;
}) {
  const today = todayDateKey;
  const taskTypeLabel = formatTaskTypeLabel(task.task_type, task.custom_ruleset_id, customBehaviorRulesets);
  const taskHistoryLabel = `${taskTypeLabel} History`;
  const initialCalendarDays = buildTaskHistoryCalendarDateKeys(today);
  const days = buildTaskHistoryCalendarDateKeysForRange(
    historyWindowStartDate ?? initialCalendarDays[0] ?? today,
    historyWindowEndDate ?? initialCalendarDays.at(-1) ?? today,
  );
  const normalizedTaskHistory = useMemo(
    () => deduplicateTaskHistoryByLogicalDate(taskHistory),
    [taskHistory],
  );
  const historyByDate = new Map(normalizedTaskHistory.map((historyEntry) => [historyEntry.entry_date, historyEntry]));
  const [initialFocusDate] = useState(() => getTaskHistoryInitialFocusDateKey({ initialDateKey, todayDateKey }));
  const initialSelectedDate = initialFocusDate;
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const [selectedDates, setSelectedDates] = useState<string[]>([initialSelectedDate]);
  const [displayedMonth, setDisplayedMonth] = useState<TaskCalendarMonth>(() => getTaskCalendarMonth(new Date(`${initialSelectedDate}T12:00:00`)));
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [taskTitleDraft, setTaskTitleDraft] = useState(taskTitle);
  const isTaskTitleSaveInFlightRef = useRef(false);
  const [showDelayEditor, setShowDelayEditor] = useState(false);

  async function commitTaskTitle() {
    const nextTitle = taskTitleDraft.trim();
    if (!nextTitle || nextTitle === taskTitle) {
      setTaskTitleDraft(taskTitle);
      return true;
    }
    if (isTaskTitleSaveInFlightRef.current) return false;
    isTaskTitleSaveInFlightRef.current = true;
    try {
      const committed = await onRenameTaskTitle(task.id, nextTitle);
      if (committed === false) return false;
      setTaskTitleDraft(nextTitle);
      return true;
    } catch {
      return false;
    } finally {
      isTaskTitleSaveInFlightRef.current = false;
    }
  }

  function cancelTaskTitle() {
    setTaskTitleDraft(taskTitle);
  }
  const firstCalendarMonth = getTaskCalendarMonth(new Date(`${days[0]}T12:00:00`));
  const lastCalendarMonth = getTaskCalendarMonth(new Date(`${days.at(-1)}T12:00:00`));
  const monthValue = (month: TaskCalendarMonth) => month.year * 12 + month.month;
  const knownDateKeys = new Set(days);
  const calendarStart = days[0] ?? today;
  const calendarEnd = days.at(-1) ?? today;
  const calendarLogicalDate = stateEngineContext
    ? logicalDateForTimestamp(stateEngineContext.now, stateEngineContext.timezone, stateEngineContext.logicalDayRollover)
    : null;
  // The semantic logical date is the dependency boundary; minute-level `now`
  // identity must not rebuild the canonical Calendar read.
  const calendarReadInput = useMemo(
    () => stateEngineContext
      ? {
        ...stateEngineContext,
        calendarEnd,
        calendarStart,
        history: normalizedTaskHistory,
        calendarOverrides,
        task,
        behaviorProfiles,
        behaviorPolicyRevisions,
        namedCustomRulesetBehaviorPolicyRevisions,
        behaviorSelectionsByTaskId,
      }
      : null,
    // Semantic logical-date dependencies intentionally exclude minute-level `now`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      behaviorPolicyRevisions,
      behaviorProfiles,
      namedCustomRulesetBehaviorPolicyRevisions,
      behaviorSelectionsByTaskId,
      calendarOverrides,
      calendarLogicalDate,
      calendarEnd,
      calendarStart,
      normalizedTaskHistory,
      stateEngineContext?.logicalDayRollover,
      stateEngineContext?.timezone,
      task,
      today,
    ],
  );
  const calendarReadRevision = useMemo(
    () => calendarReadInput
      ? createTaskHistoryCalendarReadRevision(calendarReadInput)
      : "task-history-calendar:unavailable",
    [calendarReadInput],
  );
  const calendarRead = useMemo(() => {
    if (!calendarReadInput) return null;
    if (isWorkspacePerformanceDiagnosticsEnabled()) {
      console.info(`[workspace:task-history-calendar] recomputed taskId=${task.id}`);
    }
    return resolveTaskHistoryCalendarRead(calendarReadInput);
    // The semantic revision above is the dependency boundary for this pure read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarReadRevision]);
  const dueDates = new Set(Object.entries(calendarRead?.states ?? {})
    .filter(([, state]) => state === "due")
    .map(([dateKey]) => dateKey));
  const summaryHistory = hasCompleteSemanticHistory && completeSemanticTaskHistory
    ? completeSemanticTaskHistory
    : normalizedTaskHistory;
  const savedHistoryStats = computeTaskSpecificHistoryStats(task, summaryHistory, today, days[0] ?? today);
  const resolvedTimelineDays = calendarRead?.timeline?.days
    ?? (calendarRead ? taskEffectiveTimelineDaysFromStates(calendarRead.states) : null);
  const behaviorResolution = resolveTaskBehaviorPolicyForTask({
    behaviorPolicyRevisions,
    behaviorProfiles,
    behaviorSelectionsByTaskId,
    customRulesetId: task.custom_ruleset_id,
    logicalDate: today,
    namedCustomRulesetBehaviorPolicyRevisions,
    taskId: task.id,
    taskType: task.task_type ?? "task",
  });
  const resolvedStreaks = resolvedTimelineDays
    ? computeTaskEffectiveTimelineStreaks(
      resolvedTimelineDays,
      today,
      behaviorResolution.policy.unresolvedOccurrence === "blank"
        ? { currentMissedStreakStartLogicalDate: behaviorResolution.currentBehaviorPolicyEffectiveFromLogicalDate ?? undefined }
        : {},
    )
    : null;
  const stats = resolvedStreaks
    ? {
      ...savedHistoryStats,
      currentStreak: resolvedStreaks.currentCompletedStreak,
      missedStreak: resolvedStreaks.currentMissedStreak,
      longestMissedStreak: resolvedStreaks.longestMissedStreak,
    }
    : { ...savedHistoryStats, longestMissedStreak: 0 };
  const windowLastDone = getTaskHistoryLastDone(normalizedTaskHistory, today);
  const fullHistoryLastDone = hasCompleteSemanticHistory ? getTaskHistoryLastDone(summaryHistory, today) : null;
  const lastDoneDateKey = currentTaskProjection?.last_done_logical_date
    ?? fullHistoryLastDone?.dateKey
    ?? windowLastDone?.dateKey
    ?? null;
  const lastDone = lastDoneDateKey ? { dateKey: lastDoneDateKey } : null;
  const hasAuthoritativeCurrentSummary = Boolean(currentTaskProjection || currentTaskHistorySummary || hasCompleteSemanticHistory);
  const currentStreakValue = currentTaskProjection?.current_positive_streak
    ?? currentTaskHistorySummary?.currentStreak
    ?? stats.currentStreak;
  const currentStreakLabel = hasAuthoritativeCurrentSummary ? "Current streak" : "Window current streak";
  const lastDoneLabel = currentTaskProjection || fullHistoryLastDone ? "Last done" : "Window last done";
  const { bestStreakLabel, loggedDaysLabel } = resolveTaskHistorySummaryLabels({
    canLoadOlderTaskHistory,
    hasCompleteSemanticHistory,
    taskHistoryLoadStatus,
  });
  const historyRows = buildTaskHistoryRowProjections(
    normalizedTaskHistory,
    calendarRead?.timeline?.days,
    dueDates,
    calendarOverrides,
  );
  const selectedEntry = historyByDate.get(selectedDate) ?? null;
  const selectedDateSet = new Set(selectedDates);
  const selectedEntries = selectedDates.map((dateKey) => historyByDate.get(dateKey) ?? null);
  const selectedIsFuture = selectedDate > today;
  const selectedTimelineDay = calendarRead?.timeline?.days[selectedDate] ?? null;
  const selectedCalendarState = calendarRead?.states[selectedDate] ?? null;
  const selectedIsDue = selectedTimelineDay?.state === "unhandled_blank"
    ? false
    : selectedTimelineDay
    ? selectedTimelineDay.obligation === "due" || selectedTimelineDay.obligation === "overdue"
    : selectedCalendarState === "due";
  const engineCalendarActionStatuses = useMemo(
    () => calendarReadInput && calendarRead
      ? resolveTaskHistoryCalendarActionStatuses({
        behaviorPolicyRevisions,
        behaviorProfiles,
        namedCustomRulesetBehaviorPolicyRevisions,
        behaviorSelectionsByTaskId,
        policyLoading: behaviorPolicyLoading,
        history: normalizedTaskHistory,
        historicalOverride: true,
        logicalDate: selectedDate,
        logicalDates: isMultiSelect ? selectedDates : [selectedDate],
        logicalDayRollover: calendarReadInput.logicalDayRollover,
        now: calendarReadInput.now,
        task,
        timezone: calendarReadInput.timezone,
      })
      : null,
    // The calendar revision already covers these semantic inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [behaviorPolicyLoading, behaviorPolicyRevisions, behaviorProfiles, behaviorSelectionsByTaskId, calendarRead, calendarReadRevision, isMultiSelect, namedCustomRulesetBehaviorPolicyRevisions, normalizedTaskHistory, selectedDate, selectedDates, task],
  );
  const calendarActionStatuses = calendarRead
    ? getTaskHistoryCalendarVisibleActionStatuses({
      engineStatuses: engineCalendarActionStatuses,
      historicalOverride: true,
      isMultiSelect,
      task,
    })
    : [];
  const calendarOverrideActions = calendarRead && onSetCalendarOverride
    ? getTaskHistoryCalendarOverrideActions({ isMultiSelect, selectedDate, selectedDates, task, todayDateKey: today })
    : [];
  const canDelaySelectedDate = !isMultiSelect
    && !selectedIsFuture
    && Boolean(onSetDelayedStatus)
    && task.status !== "complete"
    && task.status !== "archived"
    && task.status !== "trashed"
    && calendarActionStatuses.includes("delayed");
  const canClearSelectedDate = selectedDates.length > 0
    && selectedDates.every((dateKey) => isTaskHistoryEntryClearable({
      entry: historyByDate.get(dateKey),
      entryDate: dateKey,
      task,
      todayDateKey: today,
    }));
  type CalendarActionStatus = "clear" | "complete" | "delayed" | "did_my_best" | "done" | "missed";
  const visibleCalendarActionStatuses: CalendarActionStatus[] = canClearSelectedDate
    ? ["clear", ...calendarActionStatuses as CalendarActionStatus[]]
    : calendarActionStatuses as CalendarActionStatus[];
  const taskCalendarMonthKey = `${displayedMonth.year}-${String(displayedMonth.month + 1).padStart(2, "0")}`;
  const taskCalendarMonthDays = getTaskHistoryCalendarMonthDays(taskCalendarMonthKey).map((dateKey) => dateKey && knownDateKeys.has(dateKey) ? dateKey : null);

  function cellTone(dateKey: string) {
    const entry = historyByDate.get(dateKey);
    if (!entry) {
      const virtualState = calendarRead?.states[dateKey] ?? null;
      if (virtualState === "blank") {
        return "border-transparent bg-transparent text-[#6b6681] dark:border-transparent dark:bg-transparent dark:text-white/60";
      }
      if (virtualState === "delayed") {
        return "border-[#d8c0ff] bg-[#f6efff] text-[#7d54d1] dark:border-[#4d377f] dark:bg-[#27193f] dark:text-[#d5c2ff]";
      }
      if (virtualState === "due") {
        return "border-[#f6be96] bg-[#fff4eb] text-[#d96b1c] dark:border-[#7a4527] dark:bg-[#3a2418] dark:text-[#ffb47c]";
      }
      if (virtualState === "missed") {
        return "border-[#f7bbc3] bg-[#fff1f3] text-[#d64b5f] dark:border-[#6c3140] dark:bg-[#43212c] dark:text-[#ffb0bd]";
      }
      return "border-[#a9daf7] bg-[#eef8ff] text-[#3388c9] dark:border-[#315f7c] dark:bg-[#173044] dark:text-[#8ed0f6]";
    }
    if (entry.status === "delayed") {
      return "border-[#d8c0ff] bg-[#f6efff] text-[#7d54d1] dark:border-[#4d377f] dark:bg-[#27193f] dark:text-[#d5c2ff]";
    }
    if (entry.status === "missed") return "border-[#f7bbc3] bg-[#fff1f3] text-[#d64b5f] dark:border-[#6c3140] dark:bg-[#43212c] dark:text-[#ffb0bd]";
    if (entry.status === "did_my_best") return "border-[#f2d36f] bg-[#fff7d6] text-[#b28700] dark:border-[#6c5521] dark:bg-[#3a2b05] dark:text-[#f3d38a]";
    return "border-[#bddbd0] bg-[#edf9f4] text-[#2f8a66] dark:border-[#2d5847] dark:bg-[#163429] dark:text-[#87ddb7]";
  }

  function calendarStateLabel(dateKey: string) {
    const entry = historyByDate.get(dateKey);
    const state = entry?.status ?? calendarRead?.states[dateKey] ?? "not_due";
    if (state === "blank") return "Blank";
    if (state === "complete" && entry?.event_type === "completed_permanently") return "Marked Complete";
    return formatTaskStatusLabel(state);
  }

  function selectDate(dateKey: string) {
    setShowDelayEditor(false);
    if (!isMultiSelect) {
      setSelectedDate(dateKey);
      setSelectedDates([dateKey]);
      setDisplayedMonth(getTaskCalendarMonth(new Date(`${dateKey}T12:00:00`)));
      return;
    }

    if (dateKey > today) {
      return;
    }

    if (selectedDates.includes(dateKey)) {
      if (selectedDates.length === 1) return;
      const next = selectedDates.filter((entry) => entry !== dateKey);
      setSelectedDates(next);
      if (selectedDate === dateKey) setSelectedDate(next.at(-1) ?? today);
      return;
    }

    setSelectedDate(dateKey);
    setSelectedDates([...selectedDates, dateKey].sort());
    setDisplayedMonth(getTaskCalendarMonth(new Date(`${dateKey}T12:00:00`)));
  }

  function toggleMultiSelect() {
    setShowDelayEditor(false);
    if (isMultiSelect) {
      setSelectedDates([selectedDate]);
    } else if (selectedDate > today) {
      setSelectedDate(today);
      setSelectedDates([today]);
    }
    setIsMultiSelect(!isMultiSelect);
  }

  async function handleSetStatus(status: "clear" | "complete" | "did_my_best" | "done" | "missed") {
    if (isSavingRef.current || selectedDates.length === 0 || (status === "clear" && !canClearSelectedDate) || (status === "complete" && selectedDates.length > 1)) {
      return;
    }
    const editableDates = status === "clear"
      ? selectedDates
      : selectedDates.filter((dateKey) => dateKey <= today);
    if (editableDates.length === 0) return;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await onSetStatuses(editableDates, status);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleSaveDelayedStatus(nextDueOn: string) {
    if (isSavingRef.current || !onSetDelayedStatus) {
      return;
    }
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await onSetDelayedStatus(selectedDate, nextDueOn);
      setShowDelayEditor(false);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  async function handleSetCalendarOverride(overrideState: "not_due" | "due_open") {
    if (isSavingRef.current || !onSetCalendarOverride) return;
    const targetDates = isMultiSelect
      ? selectedDates.filter((dateKey) => dateKey <= today)
      : selectedIsFuture
        ? []
        : [selectedDate];
    if (targetDates.length === 0 || (isMultiSelect && overrideState !== "not_due")) return;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      for (const dateKey of targetDates) {
        const completed = await onSetCalendarOverride(dateKey, overrideState);
        if (completed === false) break;
      }
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  function isSelectedStatus(status: TaskStatus) {
    return isMultiSelect
      ? selectedEntries.length > 0 && selectedEntries.every((entry) => entry?.status === status)
      : selectedEntry?.status === status;
  }

  function taskHistoryStatusClass(status: string) {
    if (status === "blank") return "text-slate-500 dark:text-slate-400";
    if (status === "delayed") return "text-[#7d54d1] dark:text-[#d5c2ff]";
    if (status === "missed") return "text-[#d64b5f] dark:text-[#ffb0bd]";
    if (status === "did_my_best") return "text-[#b28700] dark:text-[#f3d38a]";
    if (status === "due") return "text-[#d96b1c] dark:text-[#ffb47c]";
    if (status === "not_due") return "text-[#3388c9] dark:text-[#8ed0f6]";
    return "text-[#2f8a66] dark:text-[#87ddb7]";
  }

  const taskSelectedActions = (
    <div className="flex flex-wrap gap-2">
      <TaskTableChipButton onClick={toggleMultiSelect} toneClassName={isMultiSelect ? "border-[#ddd2ff] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff] dark:text-white" : TASK_TABLE_INACTIVE_CHIP_CLASS}>{isMultiSelect ? `${selectedDates.length} Selected` : "Select Multiple"}</TaskTableChipButton>
      {isMultiSelect && selectedDates.length > 1 ? <TaskTableChipButton onClick={() => setSelectedDates([selectedDate])}>Keep Current Only</TaskTableChipButton> : null}
      {visibleCalendarActionStatuses.map((status) => (
        <TaskTableChipButton
          className="gap-2"
          disabled={isSaving || selectedDates.length === 0 || (!isMultiSelect && (selectedIsFuture || (status === "delayed" && !canDelaySelectedDate)))}
          key={status}
          onClick={() => {
            if (status === "delayed") {
              if (!canDelaySelectedDate) return;
              setShowDelayEditor(true);
              return;
            }
            setShowDelayEditor(false);
            void handleSetStatus(status);
          }}
          toneClassName={status === "clear"
            ? `${TASK_TABLE_INACTIVE_CHIP_CLASS} disabled:opacity-50`
            : `${isSelectedStatus(status) ? TASK_STATUS_INVERTED_CHIP_STYLES[status] : `${statusTone(status)} opacity-78 hover:opacity-100`} disabled:opacity-50`}
        >
          {status === "clear" ? null : renderTaskStatusCircle(status, "sm")}
          <span>{status === "clear" ? "Clear" : formatTaskStatusLabel(status)}</span>
        </TaskTableChipButton>
      ))}
      {calendarOverrideActions.map((overrideState) => (
        <TaskTableChipButton
          className="gap-2"
          disabled={isSaving}
          key={overrideState}
          onClick={() => { void handleSetCalendarOverride(overrideState); }}
          toneClassName={`${overrideState === "not_due" ? "border-[#a9daf7] bg-[#eef8ff] text-[#3388c9] dark:border-[#315f7c] dark:bg-[#173044] dark:text-[#8ed0f6]" : "border-[#f6be96] bg-[#fff4eb] text-[#d96b1c] dark:border-[#7a4527] dark:bg-[#3a2418] dark:text-[#ffb47c]"} disabled:opacity-50`}
        >{overrideState === "not_due" ? "Not Due" : "Due"}</TaskTableChipButton>
      ))}
    </div>
  );

  const taskCalendarSection = calendarRead ? (
    <TaskHistoryCalendarPresentation
      ariaLabel={taskHistoryLabel}
      description="Review and update this task’s outcomes by date."
      historyDescription="Chronological task outcomes, due dates, and attached notes."
      historyEntries={historyRows.map((row) => ({
        detail: <>
          <p className="mt-1 text-xs text-[#827a97] dark:text-white/55">{row.calendarOverride ? "Manual schedule override" : row.isDueOpportunity ? "Due opportunity" : "Manual history entry"}</p>
          {row.calendarOverride ? <p className="mt-1 text-xs text-[#827a97] dark:text-white/55">Changed to Not Due</p> : null}
          {row.calendarOverride && formatTaskCalendarOverrideChangedLine(row.calendarOverride) ? <p className="mt-1 text-xs text-[#827a97] dark:text-white/55">{formatTaskCalendarOverrideChangedLine(row.calendarOverride)}</p> : null}
          {row.entry && formatTaskHistoryLoggedLine(row.entry) ? <p className="mt-1 text-xs text-[#827a97] dark:text-white/55">{formatTaskHistoryLoggedLine(row.entry)}</p> : null}
          {row.entry && formatTaskHistoryEditedLine(row.entry) ? <p className="mt-1 text-xs text-[#827a97] dark:text-white/55">{formatTaskHistoryEditedLine(row.entry)}</p> : null}
          {row.isCalculated ? <p className="mt-1 text-xs text-[#827a97] dark:text-white/55">Calculated from task timeline</p> : null}
        </>,
        key: row.logicalDate,
        label: formatTaskHistoryCalendarDay(row.logicalDate, stateEngineContext?.timezone ?? "UTC"),
        status: <span className={`text-xs font-semibold ${taskHistoryStatusClass(row.status)}`}>{row.status === "complete" && row.entry?.event_type === "completed_permanently" ? "Marked Complete" : formatTaskStatusLabel(row.status)}</span>,
      }))}
      historySummary={[
        { label: lastDoneLabel, value: lastDone ? formatCalendarDate(lastDone.dateKey) : "None" },
        { label: currentStreakLabel, value: String(currentStreakValue) },
        { label: bestStreakLabel, value: String(stats.bestStreak) },
        { label: loggedDaysLabel, value: String(stats.loggedDays) },
      ]}
      historyFooter={canLoadOlderTaskHistory && onLoadOlderTaskHistory ? (
        <div className="mt-3 flex justify-end">
          <button
            className="rounded-full border border-[#ddd2ff] bg-[#f1ecff] px-3 py-1.5 text-xs font-semibold text-[#6f57f6] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]"
            disabled={taskHistoryLoadStatus === "loading"}
            onClick={() => { void onLoadOlderTaskHistory(); }}
            type="button"
          >{taskHistoryLoadStatus === "loading" ? "Loading older…" : "Load older"}</button>
        </div>
      ) : null}
      historyTitle={taskHistoryLabel}
      monthDays={taskCalendarMonthDays}
      monthLabel={formatTaskHistoryCalendarMonth(taskCalendarMonthKey, stateEngineContext?.timezone ?? "UTC")}
      nextMonthDisabled={monthValue(displayedMonth) >= monthValue(lastCalendarMonth)}
      onChangeMonth={(amount) => setDisplayedMonth((current) => shiftTaskCalendarMonth(current, amount))}
      previousMonthDisabled={monthValue(displayedMonth) <= monthValue(firstCalendarMonth)}
      renderDay={(day) => {
        const dateKey = day && knownDateKeys.has(day) ? day : null;
        const stateLabel = dateKey ? calendarStateLabel(dateKey) : undefined;
        return <TaskHistoryCalendarDay ariaLabel={dateKey ? `${formatCalendarDate(dateKey)}, ${stateLabel}` : undefined} day={dateKey} onClick={() => { if (dateKey) selectDate(dateKey); }} selected={dateKey ? selectedDateSet.has(dateKey) : false} stateClassName={dateKey ? cellTone(dateKey) : undefined} title={dateKey ? `${formatCalendarDate(dateKey)} · ${stateLabel}` : undefined} />;
      }}
      selectedDayAction={taskSelectedActions}
      selectedDayContent={<div className="mt-3">
        <p className="text-xs text-[#827a97] dark:text-white/52">{isMultiSelect ? `${selectedDates.length} dates selected. The selected result will be saved to every selected date.` : selectedIsFuture ? "Future dates cannot be edited yet." : selectedIsDue ? "This date is part of the task's due schedule." : "This date is outside the inferred due schedule and will be treated as a manual history entry."}</p>
        {!isMultiSelect && selectedEntry ? <p className="mt-2 text-xs text-[#8d87a7] dark:text-white/45">{[formatTaskHistoryLoggedLine(selectedEntry) ?? "Logged time unavailable", formatTaskHistoryEditedLine(selectedEntry)].filter((value): value is string => Boolean(value)).join(" • ")}</p> : null}
        {showDelayEditor && canDelaySelectedDate ? <div className="mt-3"><TaskDelayPicker anchorDateKey={selectedDate === today ? today : selectedDate} description={selectedDate === today ? "Delay today’s live task without changing past rewards or completion history." : "Correct this saved occurrence to Delayed using the app’s existing history semantics without double-counting rewards."} inputClassName="h-10 rounded-[0.9rem] border border-[#ded6f2] bg-white px-3 text-sm text-[#27304c] outline-none transition focus:border-[#b39eff] dark:border-white/12 dark:bg-[#22193f] dark:text-white dark:focus:border-[#6d56d6]" onCancel={() => setShowDelayEditor(false)} onSave={(nextDueOn) => handleSaveDelayedStatus(nextDueOn)} primaryToneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" saveLabel="Save delayed status" /></div> : null}
      </div>}
      selectedDayLabel={formatTaskHistoryCalendarDay(selectedDate, stateEngineContext?.timezone ?? "UTC")}
      selectedDayStatus={calendarStateLabel(selectedDate)}
    />
  ) : null;

  const calendarUnavailableSection = (
    <section aria-live="polite" className="rounded-[1.5rem] border border-dashed border-[#ddd6f9] bg-[#faf8ff] px-5 py-6 text-sm text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">
      Calendar is unavailable until canonical Task State is ready.
    </section>
  );
  const isHistoryLoading = taskHistoryLoadStatus === "loading";
  const isHistoryLoadError = taskHistoryLoadStatus === "error";
  const historyLoadErrorPanel = isHistoryLoadError ? (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-white/80 p-6 backdrop-blur-sm dark:bg-[#171328]/85">
      <div aria-live="polite" className="w-full max-w-lg rounded-[1.5rem] border border-dashed border-[#ddd6f9] bg-[#faf8ff] px-5 py-6 text-sm text-[#7b84a0] shadow-[0_18px_48px_rgba(81,61,168,0.12)] dark:border-white/10 dark:bg-[#171328] dark:text-white/55" role="alert">
        <p>{taskHistoryLoadError ?? "Could not load task history."}</p>
        {onRetryTaskHistoryLoad ? <button className="mt-4 rounded-full border border-[#ddd2ff] bg-[#f1ecff] px-4 py-2 text-sm font-semibold text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" onClick={() => { void onRetryTaskHistoryLoad(); }} type="button">Retry History</button> : null}
      </div>
    </div>
  ) : null;

  return (
    <ModalShell className="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-none border border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)] sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:rounded-[2.4rem] sm:p-6 dark:border-white/10 dark:bg-[#171328]" label={`${taskHistoryLabel} calendar`} onClose={onClose}>
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[#eee9f8] pb-4 dark:border-white/10">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#9b92be] dark:text-white/35">{taskTypeLabel}</p>
          <EditableEntityHeaderTitle aria-label="Task title" onCancel={cancelTaskTitle} onChange={setTaskTitleDraft} onCommit={commitTaskTitle} placeholder="Name this Task" value={taskTitleDraft} />
        </div>
        <AdhdIconButton aria-label="Close task history" onClick={onClose} size="sm" title="Close" variant="rowToolbar"><X /></AdhdIconButton>
      </header>
      <div className="adhdice-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:mt-6 sm:px-0 sm:py-0">
        {calendarRead ? <div className="space-y-5">{taskCalendarSection}</div> : calendarUnavailableSection}
      </div>
      {historyLoadErrorPanel}
      {(isHistoryLoading || isSaving) ? (
        <div aria-busy="true" aria-live="polite" className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-white/65 p-6 backdrop-blur-[2px] dark:bg-[#171328]/70" role="status">
          <div className="flex items-center gap-3 rounded-full border border-[#ddd6f9] bg-white/92 px-5 py-3 text-sm font-semibold text-[#6f57f6] shadow-[0_18px_48px_rgba(81,61,168,0.16)] dark:border-white/10 dark:bg-[#22193f]/95 dark:text-[#cabfff]">
            <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-[#cfc3ff] border-t-[#6f57f6] dark:border-[#594d80] dark:border-t-[#cabfff]" />
            <span>{isSaving ? "Saving History…" : "Loading History…"}</span>
          </div>
        </div>
      ) : null}
    </ModalShell>
  );
}

export function BottomDockAdapter({
  activePage,
  dockIcons,
  dockItems,
  onNavigate,
  onNavigateSearchTarget,
  renderIcon,
  searchTargets,
  taskSearchEntities,
}: {
  activePage: AppPage;
  dockIcons: Record<AppPage, string>;
  dockItems: AppPage[];
  onNavigate: (page: AppPage) => void;
  onNavigateSearchTarget: (target: NavigatorSearchTarget) => void;
  renderIcon: (name: string) => ReactNode;
  searchTargets: readonly NavigatorSearchTarget[];
  taskSearchEntities: readonly TaskSearchEntity[];
}) {
  return (
    <BottomDockComponent
      activePage={activePage}
      dockIcons={dockIcons}
      dockItems={dockItems}
      onNavigate={onNavigate}
      onNavigateSearchTarget={onNavigateSearchTarget}
      renderIcon={renderIcon}
      searchTargets={searchTargets}
      taskSearchEntities={taskSearchEntities}
    />
  );
}
