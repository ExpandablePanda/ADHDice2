"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type JSX, type ReactNode } from "react";
import { ModalShell } from "../modal-shell";
import { BottomDockComponent } from "./bottom-dock";
import { FilterRowsComponent } from "./task-filter-rows";
import { FocusPlannerModalComponent } from "./focus-planner-modal";
import { Select } from "./task-status-select";
import { TaskDelayPicker } from "./task-delay-picker";
import { formatTaskStatusLabel, renderTaskStatusCircle, TASK_STATUS_CHIP_STYLES, TASK_STATUS_INVERTED_CHIP_STYLES } from "./task-status-ui";
import {
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";
import { TaskGridViewComponent } from "./task-grid-view";
import {
  buildTaskHistoryCalendarDueDateSet,
  computeTaskSpecificHistoryStats,
  buildTaskHistoryRowProjections,
  deduplicateTaskHistoryByLogicalDate,
  formatTaskHistoryEntryLabel,
  getTaskHistoryLastDone,
  getTaskHistoryCalendarVirtualState,
  type TaskHistoryStats,
} from "@/lib/task-history";
import {
  TaskCardGalleryComponent,
  TaskComposerCardComponent,
  TaskLaneComponent,
  TaskMatrixViewComponent,
} from "./task-secondary-views";
import { UrgentTasksPanelComponent } from "./task-grid-widgets";
import type { TaskDraft } from "./task-editor-model";
import { shiftDateKey } from "@/lib/task-grid-layout";
import {
  getComfortableTaskHistoryScrollOffset,
  getTaskHistoryInitialFocusDateKey,
} from "@/lib/task-history-calendar-focus";
import type { AppPage } from "@/lib/task-ui-state";
import type { ImportTasksResult } from "@/hooks/useTaskCrudActions";
import { getTaskHistoryCalendarOverrideActions, getTaskHistoryCalendarVisibleActionStatuses } from "@/lib/task-complete";
import { resolveTaskHistoryCalendarActionStatuses, resolveTaskHistoryCalendarRead } from "@/lib/task-state-engine";
import { computeTaskEffectiveTimelineStreaks, taskEffectiveTimelineDaysFromStates } from "@/lib/task-state-engine/effective-timeline";
import type { TaskCalendarOverride } from "@/lib/task-state-engine/types";
import type {
  Task,
  TaskHistory as DbTaskHistory,
  TaskStatus,
  TaskSubtask as DbTaskSubtask,
  TaskSubtaskStatus,
} from "@/lib/database.types";

type Message = {
  text: string;
  tone: "neutral" | "good" | "warn";
};

type FocusPlannerStep = 0 | 1 | 2;

type SelectProps<T extends string> = {
  label: string;
  onChange: (value: T) => void;
  options: T[];
  showLabel?: boolean;
  value: T;
};

type GridItem = {
  h: number;
  id: string;
  type: string;
  w: number;
  x: number;
  y: number;
};

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

const HISTORY_STATUS_CHIP_BASE = "inline-flex items-center justify-center rounded-full border px-2 py-1 text-[13px] font-medium leading-none whitespace-nowrap";
function statusTone(status: TaskStatus) {
  return TASK_STATUS_CHIP_STYLES[status] ?? TASK_TABLE_INACTIVE_CHIP_CLASS;
}

function FocusStatsCard({
  activeCount,
  doneCount,
  overdueCount,
  taskHistoryStats,
}: {
  activeCount: number;
  doneCount: number;
  overdueCount: number;
  taskHistoryStats: TaskHistoryStats;
}) {
  const stats = [
    { label: "Active", meter: Math.min(100, 28 + activeCount * 4), value: String(activeCount) },
    { label: "Completed", meter: Math.min(100, 28 + doneCount * 4), value: String(doneCount) },
    { label: "Overdue", meter: Math.min(100, 28 + overdueCount * 4), value: String(overdueCount) },
    { label: "Current Streak", meter: Math.min(100, 28 + taskHistoryStats.currentStreak * 6), value: String(taskHistoryStats.currentStreak) },
    { label: "Best Streak", meter: Math.min(100, 28 + taskHistoryStats.bestStreak * 6), value: String(taskHistoryStats.bestStreak) },
    { label: "Done Rate", meter: taskHistoryStats.doneRate, value: `${taskHistoryStats.doneRate}%` },
  ];

  return (
    <section className="w-full overflow-hidden rounded-[2rem] border p-5 flex flex-col items-center text-center transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6">
      <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">
        Focus Stats
      </h2>
      <div className="mt-4 grid w-full gap-3 sm:grid-cols-2">
        {stats.map((stat, index) => (
          <div className="rounded-[1.25rem] p-4 flex flex-col items-center bg-[#f8f5ff] dark:bg-white/8" key={stat.label}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">{stat.label}</p>
            <p className="mt-2 text-3xl font-black text-[#1f2746] dark:text-white">{stat.value}</p>
            <div className="mt-2 h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-[#ded7f7] dark:bg-white/10">
              <div
                className={`h-full rounded-full ${index === 2 ? "bg-[#f05566] dark:bg-[#ff9eaf]" : "bg-[#6f57f6] dark:bg-[#cabfff]"}`}
                style={{ width: `${stat.meter}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FilterRowsAdapter(props: ComponentProps<typeof FilterRowsComponent>) {
  return <FilterRowsComponent {...props} />;
}

export function UrgentTasksPanelAdapter(props: ComponentProps<typeof UrgentTasksPanelComponent>) {
  return <UrgentTasksPanelComponent {...props} />;
}

export function TaskComposerCardAdapter({
  onAdd,
}: {
  onAdd: (draft: { focusToday: boolean; values: TaskDraft }) => Promise<void>;
}) {
  return <TaskComposerCardComponent onAdd={onAdd} SelectComponent={Select as <T extends string>(props: SelectProps<T>) => JSX.Element} />;
}

export function ImportWidgetCardAdapter({
  embeddedInModal = false,
  message,
  onImport,
}: {
  embeddedInModal?: boolean;
  message: Message | null;
  onImport: (lines: string[]) => Promise<ImportTasksResult | void>;
}) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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
          setIsSubmitting(true);
          const result = await onImport(lines);
          if (result && result.importedCount > 0 && result.warningCount === 0 && result.errorCount === 0) {
            setText("");
          }
          setIsSubmitting(false);
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
      </form>

      <div className={`mt-3 whitespace-pre-wrap text-sm ${messageToneClassName}`}>
        {message?.text}
      </div>
    </section>
  );
}

export function TaskLaneAdapter(props: ComponentProps<typeof TaskLaneComponent>) {
  return <TaskLaneComponent {...props} />;
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

export function TaskGridViewAdapter<TWidgetType extends string>({
  activeCount,
  currentColumns,
  doneCount,
  draggedWidgetId,
  focusedTaskIds,
  gridAutoRowHeight,
  gridLayout,
  isEditMode,
  labelsByWidgetType,
  maxColumns,
  maxDisplayRows,
  message,
  onAddTask,
  onEditTask,
  onSetStatus,
  onSetSubtaskStatus,
  onAddWidget,
  onImportTasks,
  onMoveWidget,
  onRemoveWidget,
  onReorderWidget,
  onResetLayout,
  onResizeWidget,
  onSelectWidget,
  onSetDraggedWidget,
  onToggleEditMode,
  overdueCount,
  selectedWidgetId,
  subtasksByTaskId,
  taskHistoryStats,
  tasksByWidget,
}: {
  activeCount: number;
  currentColumns: number;
  doneCount: number;
  draggedWidgetId: string | null;
  focusedTaskIds: string[];
  gridAutoRowHeight: number;
  gridLayout: GridItem[];
  isEditMode: boolean;
  labelsByWidgetType: Record<TWidgetType, string>;
  maxColumns: number;
  maxDisplayRows: number;
  message: Message | null;
  onAddTask: (draft: { focusToday: boolean; values: TaskDraft }) => Promise<void>;
  onEditTask: (task: Task) => void;
  onSetStatus: (task: Task, status: TaskStatus) => void;
  onSetSubtaskStatus: (subtaskId: string, status: TaskSubtaskStatus) => void;
  onAddWidget: (widgetType: TWidgetType) => void;
  onImportTasks: (lines: string[]) => Promise<ImportTasksResult | void>;
  onMoveWidget: (widgetId: string, direction: "up" | "down") => void;
  onRemoveWidget: (widgetId: string) => void;
  onReorderWidget: (targetWidgetId: string) => void;
  onResetLayout: () => void;
  onResizeWidget: (widgetId: string, nextWidth: number, nextHeight: number) => void;
  onSelectWidget: (widgetId: string | null) => void;
  onSetDraggedWidget: (widgetId: string | null) => void;
  onToggleEditMode: () => void;
  overdueCount: number;
  selectedWidgetId: string | null;
  subtasksByTaskId: Record<string, DbTaskSubtask[]>;
  taskHistoryStats: TaskHistoryStats;
  tasksByWidget: {
    activeQueue: Task[];
    completed: Task[];
    dueToday: Task[];
    focusToday: Task[];
    urgent: Task[];
  };
}) {
  return (
    <TaskGridViewComponent
      currentColumns={currentColumns}
      draggedWidgetId={draggedWidgetId}
      gridAutoRowHeight={gridAutoRowHeight}
      gridLayout={gridLayout}
      isEditMode={isEditMode}
      labelsByWidgetType={labelsByWidgetType}
      maxColumns={maxColumns}
      maxDisplayRows={maxDisplayRows}
      onAddWidget={(widgetType) => onAddWidget(widgetType as TWidgetType)}
      onMoveWidget={onMoveWidget}
      onRemoveWidget={onRemoveWidget}
      onReorderWidget={onReorderWidget}
      onResetLayout={onResetLayout}
      onResizeWidget={onResizeWidget}
      onSelectWidget={onSelectWidget}
      onSetDraggedWidget={onSetDraggedWidget}
      onToggleEditMode={onToggleEditMode}
      renderWidget={(widgetType) => {
        if (widgetType === "urgent") {
          return (
            <UrgentTasksPanelAdapter
              focusedTaskIds={focusedTaskIds}
              onEditTask={onEditTask}
              onSetStatus={onSetStatus}
              onSetSubtaskStatus={onSetSubtaskStatus}
              subtasksByTaskId={subtasksByTaskId}
              tasks={tasksByWidget.urgent}
            />
          );
        }
        if (widgetType === "focus_today") {
          return (
            <TaskLaneAdapter
              count={tasksByWidget.focusToday.length}
              defaultExpanded
              onEditTask={onEditTask}
              subtasksByTaskId={subtasksByTaskId}
              tasks={tasksByWidget.focusToday}
              title="Focus"
              tone="purple"
            />
          );
        }
        if (widgetType === "due_today") {
          return (
            <TaskLaneAdapter
              count={tasksByWidget.dueToday.length}
              onEditTask={onEditTask}
              subtasksByTaskId={subtasksByTaskId}
              tasks={tasksByWidget.dueToday}
              title="Due Today"
              tone="purple"
            />
          );
        }
        if (widgetType === "active_queue") {
          return (
            <TaskLaneAdapter
              count={tasksByWidget.activeQueue.length}
              onEditTask={onEditTask}
              subtasksByTaskId={subtasksByTaskId}
              tasks={tasksByWidget.activeQueue}
              title="Active Queue"
              tone="soft"
            />
          );
        }
        if (widgetType === "completed") {
          return (
            <TaskLaneAdapter
              count={tasksByWidget.completed.length}
              onEditTask={onEditTask}
              subtasksByTaskId={subtasksByTaskId}
              tasks={tasksByWidget.completed}
              title="Completed"
              tone="soft"
            />
          );
        }
        if (widgetType === "quick_capture") {
          return (
            <div id="task-composer-card">
              <TaskComposerCardAdapter onAdd={onAddTask} />
            </div>
          );
        }
        if (widgetType === "import") {
          return (
            <div id="task-import-panel">
              <ImportWidgetCardAdapter message={message} onImport={onImportTasks} />
            </div>
          );
        }
        return (
          <FocusStatsCard
            activeCount={activeCount}
            doneCount={doneCount}
            overdueCount={overdueCount}
            taskHistoryStats={taskHistoryStats}
          />
        );
      }}
      selectedWidgetId={selectedWidgetId}
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
  onRetryTaskHistoryLoad,
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
  calendarOverrides,
}: {
  onClose: () => void;
  onRetryTaskHistoryLoad?: () => Promise<boolean> | void;
  onSetStatuses: (entryDates: string[], status: "clear" | "complete" | "did_my_best" | "done" | "missed") => Promise<void>;
  onSetDelayedStatus?: (entryDate: string, nextDueOn: string) => Promise<void>;
  onSetCalendarOverride?: (logicalDate: string, overrideState: "not_due" | "due_open") => Promise<void>;
  task: Task;
  taskHistory: DbTaskHistory[];
  taskHistoryLoadError?: string | null;
  taskHistoryLoadStatus?: "error" | "loading" | "ready";
  taskTitle: string;
  todayDateKey: string;
  initialDateKey?: string | null;
  stateEngineContext?: { logicalDayRollover: string; now: Date | string; timezone: string };
  calendarOverrides?: TaskCalendarOverride[];
}) {
  const today = todayDateKey;
  const pastDayCount = 140;
  const futureDayCount = 42;
  const totalDays = pastDayCount + futureDayCount;
  const days = Array.from({ length: totalDays }, (_, index) => shiftDateKey(today, index - (pastDayCount - 1)));
  const normalizedTaskHistory = deduplicateTaskHistoryByLogicalDate(taskHistory);
  const historyByDate = new Map(normalizedTaskHistory.map((historyEntry) => [historyEntry.entry_date, historyEntry]));
  const [initialFocusDate] = useState(() => getTaskHistoryInitialFocusDateKey({ initialDateKey, todayDateKey }));
  const initialSelectedDate = initialFocusDate;
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const [selectedDates, setSelectedDates] = useState<string[]>([initialSelectedDate]);
  const [mobileSection, setMobileSection] = useState<"calendar" | "history" | "stats">("calendar");
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDelayEditor, setShowDelayEditor] = useState(false);
  const desktopCalendarViewportRef = useRef<HTMLDivElement>(null);
  const mobileCalendarViewportRef = useRef<HTMLDivElement>(null);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const weeks: string[][] = [];
  const dueDates = buildTaskHistoryCalendarDueDateSet(task, days[0] ?? today, days.at(-1) ?? today, today, normalizedTaskHistory);
  const calendarRead = stateEngineContext
    ? resolveTaskHistoryCalendarRead({
      ...stateEngineContext,
      calendarEnd: days.at(-1) ?? today,
      calendarStart: days[0] ?? today,
      history: normalizedTaskHistory,
      calendarOverrides,
      task,
    })
    : null;
  const sortedDueDates = [...dueDates].sort();
  const getNextDueDateKey = (dateKey: string) => sortedDueDates.find((dueDateKey) => dueDateKey >= dateKey) ?? null;
  const savedHistoryStats = computeTaskSpecificHistoryStats(task, normalizedTaskHistory, today, days[0] ?? today);
  const resolvedTimelineDays = calendarRead?.timeline?.days
    ?? (calendarRead ? taskEffectiveTimelineDaysFromStates(calendarRead.states) : null);
  const resolvedStreaks = resolvedTimelineDays
    ? computeTaskEffectiveTimelineStreaks(resolvedTimelineDays, today)
    : null;
  const stats = resolvedStreaks
    ? {
      ...savedHistoryStats,
      currentStreak: resolvedStreaks.currentCompletedStreak,
      missedStreak: resolvedStreaks.currentMissedStreak,
      longestMissedStreak: resolvedStreaks.longestMissedStreak,
    }
    : { ...savedHistoryStats, longestMissedStreak: 0 };
  const lastDone = getTaskHistoryLastDone(normalizedTaskHistory, today);
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
  const selectedIsDue = selectedTimelineDay
    ? selectedTimelineDay.obligation === "due" || selectedTimelineDay.obligation === "overdue"
    : dueDates.has(selectedDate);
  const selectedVirtualState = calendarRead?.states[selectedDate] ?? (!calendarRead ? getTaskHistoryCalendarVirtualState({
    dateKey: selectedDate,
    delayedUntilDateKey: task.status === "delayed" ? task.due_on : null,
    hasHistoryEntry: selectedEntry !== null,
    isDue: selectedIsDue,
    nextDueDateKey: getNextDueDateKey(selectedDate),
    projectsUndatedDelayed: task.status === "delayed" && task.due_on === null,
    todayDateKey: today,
  }) : null);
  const engineCalendarActionStatuses = stateEngineContext
    ? resolveTaskHistoryCalendarActionStatuses({ ...stateEngineContext, history: normalizedTaskHistory, historicalOverride: true, logicalDate: selectedDate, task })
    : null;
  const calendarActionStatuses = getTaskHistoryCalendarVisibleActionStatuses({
    engineStatuses: engineCalendarActionStatuses,
    historicalOverride: true,
    isMultiSelect,
    task,
  });
  const calendarOverrideActions = onSetCalendarOverride
    ? getTaskHistoryCalendarOverrideActions({ isMultiSelect, selectedDate, task, todayDateKey: today })
    : [];
  const canDelaySelectedDate = !isMultiSelect
    && !selectedIsFuture
    && Boolean(onSetDelayedStatus)
    && task.status !== "complete"
    && task.status !== "archived"
    && task.status !== "trashed";
  const canClearSelectedDate = !isMultiSelect
    && !selectedIsFuture
    && Boolean(selectedEntry)
    && task.status !== "complete"
    && task.status !== "archived"
    && task.status !== "trashed"
    && selectedEntry?.status !== "complete"
    && selectedEntry?.status !== "delayed"
    && (selectedEntry?.status === "done" || selectedEntry?.status === "did_my_best" || selectedEntry?.status === "missed");
  type CalendarActionStatus = "clear" | "complete" | "delayed" | "did_my_best" | "done" | "missed";
  const visibleCalendarActionStatuses: CalendarActionStatus[] = canClearSelectedDate
    ? ["clear", ...calendarActionStatuses as CalendarActionStatus[]]
    : calendarActionStatuses as CalendarActionStatus[];

  for (let weekIndex = 0; weekIndex < Math.ceil(totalDays / 7); weekIndex += 1) {
    weeks.push(days.slice(weekIndex * 7, weekIndex * 7 + 7));
  }

  function cellTone(dateKey: string) {
    const entry = historyByDate.get(dateKey);
    if (!entry) {
      const virtualState = calendarRead?.states[dateKey] ?? (!calendarRead ? getTaskHistoryCalendarVirtualState({
        dateKey,
        delayedUntilDateKey: task.status === "delayed" ? task.due_on : null,
        hasHistoryEntry: false,
        isDue: dueDates.has(dateKey),
        nextDueDateKey: getNextDueDateKey(dateKey),
        projectsUndatedDelayed: task.status === "delayed" && task.due_on === null,
        todayDateKey: today,
      }) : null);
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

  function selectDate(dateKey: string) {
    setShowDelayEditor(false);
    if (!isMultiSelect) {
      setSelectedDate(dateKey);
      setSelectedDates([dateKey]);
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
    const editableDates = selectedDates.filter((dateKey) => dateKey <= today);
    if (editableDates.length === 0 || (status === "complete" && editableDates.length > 1)) {
      return;
    }
    setIsSaving(true);
    try {
      await onSetStatuses(editableDates, status);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveDelayedStatus(nextDueOn: string) {
    if (!onSetDelayedStatus) {
      return;
    }
    setIsSaving(true);
    try {
      await onSetDelayedStatus(selectedDate, nextDueOn);
      setShowDelayEditor(false);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSetCalendarOverride(overrideState: "not_due" | "due_open") {
    if (!onSetCalendarOverride || isMultiSelect || selectedIsFuture) return;
    setIsSaving(true);
    try {
      await onSetCalendarOverride(selectedDate, overrideState);
    } finally {
      setIsSaving(false);
    }
  }

  function renderOfficialStatusChip(status: TaskStatus, label?: string) {
    return (
      <span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${statusTone(status)} gap-2`}>
        {renderTaskStatusCircle(status, "sm")}
        <span>{label ?? formatTaskStatusLabel(status)}</span>
      </span>
    );
  }

  function renderStatusPill(entry: DbTaskHistory | null, virtualState: "delayed" | "due" | "not_due" | "in_progress" | "missed" | "done" | "did_my_best" | "complete" | null = null) {
    if (!entry) {
      if (virtualState === "delayed") {
        return <span className={`${HISTORY_STATUS_CHIP_BASE} border-[#d8c0ff] bg-[#f6efff] text-[#7d54d1] dark:border-[#4d377f] dark:bg-[#27193f] dark:text-[#d5c2ff]`}>Delayed</span>;
      }
      if (virtualState === "due") {
        return <span className={`${HISTORY_STATUS_CHIP_BASE} border-[#f6be96] bg-[#fff4eb] text-[#d96b1c] dark:border-[#7a4527] dark:bg-[#3a2418] dark:text-[#ffb47c]`}>Due</span>;
      }
      if (virtualState === "in_progress") {
        return <span className={`${HISTORY_STATUS_CHIP_BASE} border-[#a9c2ff] bg-[#eef3ff] text-[#4473df] dark:border-[#36559d] dark:bg-[#1d2a4a] dark:text-[#b4c7ff]`}>In Progress</span>;
      }
      if (virtualState === "missed") {
        return <span className={`${HISTORY_STATUS_CHIP_BASE} border-[#f7bbc3] bg-[#fff1f3] text-[#d64b5f] dark:border-[#6c3140] dark:bg-[#43212c] dark:text-[#ffb0bd]`}>Missed</span>;
      }
      if (virtualState === "not_due") {
        return <span className={`${HISTORY_STATUS_CHIP_BASE} border-[#a9daf7] bg-[#eef8ff] text-[#3388c9] dark:border-[#315f7c] dark:bg-[#173044] dark:text-[#8ed0f6]`}>Not Due</span>;
      }
      return <span className={`${HISTORY_STATUS_CHIP_BASE} border-[#e4deef] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60`}>No Entry</span>;
    }
    if (entry.status === "complete" && entry.event_type === "completed_permanently") {
      return renderOfficialStatusChip("complete", formatTaskHistoryEntryLabel(entry));
    }

    return renderOfficialStatusChip(entry.status, formatTaskHistoryEntryLabel(entry));
  }

  function isSelectedStatus(status: TaskStatus) {
    return isMultiSelect
      ? selectedEntries.length > 0 && selectedEntries.every((entry) => entry?.status === status)
      : selectedEntry?.status === status;
  }

  useEffect(() => {
    if (taskHistoryLoadStatus !== "ready") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const isMobile = window.matchMedia("(max-width: 1023px)").matches;
      const container = isMobile ? mobileCalendarViewportRef.current : desktopCalendarViewportRef.current;
      const target = container?.querySelector<HTMLElement>(`[data-history-date="${initialFocusDate}"]`);
      if (!container || !target) return;

      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      if (isMobile) {
        container.scrollTo({
          top: getComfortableTaskHistoryScrollOffset({
            containerSize: container.clientHeight,
            targetOffset: container.scrollTop + targetRect.top - containerRect.top,
            targetSize: targetRect.height,
          }),
          behavior: "auto",
        });
        return;
      }

      container.scrollTo({
        left: getComfortableTaskHistoryScrollOffset({
          containerSize: container.clientWidth,
          targetOffset: container.scrollLeft + targetRect.left - containerRect.left,
          targetSize: targetRect.width,
        }),
        behavior: "auto",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialFocusDate, task.id, taskHistoryLoadStatus]);

  if (taskHistoryLoadStatus !== "ready") {
    const isLoadError = taskHistoryLoadStatus === "error";
    return (
      <ModalShell className="w-full max-w-xl rounded-[2.4rem] border border-[#ece8f8] bg-white p-6 shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label="Task history" onClose={onClose}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]">Task History</p>
            <h2 className="mt-2 truncate text-2xl font-black text-[#1f2746] dark:text-white">{taskTitle}</h2>
          </div>
          <button aria-label="Close task history" className="shrink-0 p-2 text-2xl leading-none text-[#8e97af] dark:text-white/55" onClick={onClose} type="button">×</button>
        </div>
        <div aria-live="polite" aria-busy={!isLoadError} className="mt-6 rounded-[1.5rem] border border-dashed border-[#ddd6f9] bg-[#faf8ff] px-5 py-6 text-sm text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">
          {isLoadError ? (
            <>
              <p>{taskHistoryLoadError ?? "Could not load task history."}</p>
              {onRetryTaskHistoryLoad ? <button className="mt-4 rounded-full border border-[#ddd2ff] bg-[#f1ecff] px-4 py-2 text-sm font-semibold text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]" onClick={() => { void onRetryTaskHistoryLoad(); }} type="button">Retry History</button> : null}
            </>
          ) : "Loading full task history…"}
        </div>
      </ModalShell>
    );
  }

  const calendarButton = (dateKey: string) => (
    <button aria-pressed={selectedDateSet.has(dateKey)} className={`flex h-9 w-9 items-center justify-center rounded-[0.85rem] border text-[10px] font-black tabular-nums transition ${cellTone(dateKey)} ${selectedDateSet.has(dateKey) ? "ring-2 ring-[#6f57f6] ring-offset-2 ring-offset-white dark:ring-[#cabfff] dark:ring-offset-[#171328]" : ""} ${isMultiSelect && dateKey > today ? "cursor-not-allowed opacity-45" : ""}`} data-history-date={dateKey} key={dateKey} onClick={() => selectDate(dateKey)} title={dateKey} type="button">{dateKey.slice(-2)}</button>
  );
  const calendarControls = <div className="mt-2 flex flex-wrap gap-2"><TaskTableChipButton onClick={toggleMultiSelect} toneClassName={isMultiSelect ? "border-[#ddd2ff] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff] dark:text-white" : TASK_TABLE_INACTIVE_CHIP_CLASS}>{isMultiSelect ? `${selectedDates.length} Selected` : "Select Multiple"}</TaskTableChipButton>{isMultiSelect && selectedDates.length > 1 ? <TaskTableChipButton onClick={() => setSelectedDates([selectedDate])}>Keep Current Only</TaskTableChipButton> : null}</div>;
  const calendarLegend = <div className="flex flex-wrap items-center gap-2 text-xs">{renderOfficialStatusChip("done", "Done")}{renderOfficialStatusChip("complete", "Marked Complete")}{renderOfficialStatusChip("delayed", "Delayed")}{renderOfficialStatusChip("did_my_best", "Did My Best")}{renderOfficialStatusChip("missed", "Missed")}<span className="text-[#d96b1c] dark:text-[#ffb47c]">Due</span><span className="text-[#3388c9] dark:text-[#8ed0f6]">Not Due</span></div>;
  const selectedDetailsSection = (
    <section className="rounded-[2rem] border border-[#ece8f8] bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">{isMultiSelect ? "Edit Selected Dates" : "Edit Selected Date"}</p>
                <h3 className="mt-1 text-xl font-black text-[#1f2746] dark:text-white">{isMultiSelect ? `${selectedDates.length} dates selected` : formatCalendarDate(selectedDate)}</h3>
                <p className="mt-2 text-sm text-[#7d88a1] dark:text-white/50">
                  {isMultiSelect
                    ? "The selected result will be saved to every selected date in one update."
                    : selectedIsFuture
                    ? "Future dates cannot be edited yet."
                    : selectedIsDue
                      ? "This date is part of the task's due schedule."
                      : "This date is outside the inferred due schedule and will be treated as a manual history entry."}
                </p>
                {!isMultiSelect && selectedEntry ? (
                  <p className="mt-2 text-xs text-[#8d87a7] dark:text-white/45">
                    {[
                      `Credited for ${formatCalendarDate(selectedEntry.entry_date)}`,
                      formatTaskHistoryLoggedLine(selectedEntry) ?? "Logged time unavailable",
                      formatTaskHistoryEditedLine(selectedEntry),
                    ].filter((value): value is string => Boolean(value)).join(" • ")}
                  </p>
                ) : null}
              </div>
              {isMultiSelect
                ? <span className={`${HISTORY_STATUS_CHIP_BASE} border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]`}>{selectedDates.length} Selected</span>
                : renderStatusPill(selectedEntry, selectedVirtualState)}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {visibleCalendarActionStatuses.map((status) => (
                <TaskTableChipButton
                  className="gap-2"
                  disabled={isSaving || selectedDates.length === 0 || (!isMultiSelect && (selectedIsFuture || (status === "delayed" && !canDelaySelectedDate)))}
                  key={status}
                  onClick={() => {
                    if (status === "delayed") {
                      if (!canDelaySelectedDate) {
                        return;
                      }
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
            {showDelayEditor && canDelaySelectedDate ? (
              <div className="mt-4 rounded-[1.25rem] border border-[#efe9ff] bg-[#fbfaff] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <TaskDelayPicker
                  anchorDateKey={selectedDate === today ? today : selectedDate}
                  description={selectedDate === today
                    ? "Delay today’s live task without changing past rewards or completion history."
                    : "Correct this saved occurrence to Delayed using the app’s existing history semantics without double-counting rewards."}
                  inputClassName="h-10 rounded-[0.9rem] border border-[#ded6f2] bg-white px-3 text-sm text-[#27304c] outline-none transition focus:border-[#b39eff] dark:border-white/12 dark:bg-[#22193f] dark:text-white dark:focus:border-[#6d56d6]"
                  onCancel={() => setShowDelayEditor(false)}
                  onSave={(nextDueOn) => handleSaveDelayedStatus(nextDueOn)}
                  primaryToneClassName="border-[#ddd2ff] bg-[#f1ecff] text-[#6f57f6] dark:border-[#42306f] dark:bg-[#22193f] dark:text-[#cabfff]"
                  saveLabel="Save delayed status"
                />
              </div>
            ) : null}
            <p className="mt-4 text-xs text-[#8d87a7] dark:text-white/40">
              Calendar edits update saved task history, streaks, and the live task status when the active unresolved state changes. They do not change past rewards or economy.
            </p>
    </section>
  );
  const historySection = (
    <section className="rounded-[2rem] border border-[#ece8f8] bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">Task Status History</p><p className="mt-1 text-sm text-[#7d88a1] dark:text-white/50">Effective results for this task.</p></div><span className="text-xs font-semibold text-[#8d87a7] dark:text-white/40">{historyRows.length} entries</span></div>
      <div className="space-y-2">{historyRows.length === 0 ? <EmptyTaskState text="No task history entries yet." /> : null}{historyRows.map((row) => <button className={`flex w-full items-center justify-between rounded-[1.25rem] border px-4 py-3 text-left transition ${selectedDateSet.has(row.logicalDate) ? "border-[#cfc3ff] bg-[#f8f5ff] dark:border-[#6f57f6] dark:bg-[#22193d]" : "border-[#efebfb] bg-[#fcfbff] hover:border-[#ddd3ff] dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"}`} key={row.logicalDate} onClick={() => selectDate(row.logicalDate)} type="button"><div><p className="text-sm font-semibold text-[#27304c] dark:text-white">{formatCalendarDate(row.logicalDate)}</p><p className="mt-1 text-xs text-[#8d87a7] dark:text-white/45">{row.calendarOverride ? "Manual schedule override" : row.isDueOpportunity ? "Due opportunity" : "Manual history entry"}</p>{row.calendarOverride ? <p className="mt-1 text-xs text-[#8d87a7] dark:text-white/45">Changed to Not Due</p> : null}{row.calendarOverride && formatTaskCalendarOverrideChangedLine(row.calendarOverride) ? <p className="mt-1 text-xs text-[#8d87a7] dark:text-white/45">{formatTaskCalendarOverrideChangedLine(row.calendarOverride)}</p> : null}{row.entry && formatTaskHistoryLoggedLine(row.entry) ? <p className="mt-1 text-xs text-[#8d87a7] dark:text-white/45">{formatTaskHistoryLoggedLine(row.entry)}</p> : null}{row.entry && formatTaskHistoryEditedLine(row.entry) ? <p className="mt-1 text-xs text-[#8d87a7] dark:text-white/45">{formatTaskHistoryEditedLine(row.entry)}</p> : null}{row.isCalculated ? <p className="mt-1 text-xs text-[#8d87a7] dark:text-white/45">Calculated from task timeline</p> : null}</div>{renderStatusPill(row.entry, row.status)}</button>)}</div>
    </section>
  );
  const statsSection = (
    <section className="rounded-[2rem] border border-[#ece8f8] bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">Stats</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {[
                { label: "Last Done", value: lastDone ? (lastDone.timestamp ? formatHistoryDateTime(lastDone.timestamp) : formatCalendarDate(lastDone.dateKey)) : "None", detail: "latest Done or Did My Best" },
                { label: "Current Streak", value: stats.currentStreak, detail: "completed due dates in a row" },
                { label: "Best Streak", value: stats.bestStreak, detail: "best completion streak" },
                { label: "Current Missed Streak", value: stats.missedStreak, detail: "missed due dates in a row" },
                { label: "Longest Missed Streak", value: stats.longestMissedStreak, detail: "longest missed run in range" },
                { label: "Completion Rate", value: `${stats.completionRate}%`, detail: task.repeat_frequency === "none" ? "based on logged history" : `${stats.dueDays} due dates in range` },
              ].map((stat) => (
                <div className="rounded-[1.25rem] bg-[#f8f5ff] px-4 py-4 dark:bg-white/[0.05]" key={stat.label}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">{stat.label}</p>
                  <p className="mt-2 text-3xl font-black text-[#1f2746] dark:text-white">{stat.value}</p>
                  <p className="mt-1 text-xs text-[#7d88a1] dark:text-white/45">{stat.detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Completed", value: stats.completedDays },
                { label: "Missed", value: stats.missedDays },
                { label: "Logged", value: stats.loggedDays },
              ].map((stat) => (
                <div className="rounded-[1.1rem] border border-[#ece8f8] bg-[#fcfbff] px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]" key={stat.label}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">{stat.label}</p>
                  <p className="mt-1 text-xl font-black text-[#27304c] dark:text-white">{stat.value}</p>
                </div>
              ))}
            </div>
    </section>
  );

  return (
    <ModalShell className="flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden rounded-none border border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)] sm:h-auto sm:max-h-[calc(100vh-2rem)] sm:rounded-[2.4rem] sm:p-6 dark:border-white/10 dark:bg-[#171328]" label="Task history" onClose={onClose}>
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#efebfb] bg-white px-4 py-3 dark:border-white/10 dark:bg-[#171328] sm:static sm:px-0 sm:pb-5">
        <div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]">Task History</p><h2 className="mt-1 truncate text-xl font-black text-[#1f2746] dark:text-white sm:mt-2 sm:text-3xl">{taskTitle}</h2><p className="mt-1 hidden text-sm text-[#7d88a1] dark:text-white/50 sm:block">Edit task history by date without changing past rewards or economy.</p></div>
        <button aria-label="Close task history" className="shrink-0 p-2 text-2xl leading-none text-[#8e97af] dark:text-white/55" onClick={onClose} type="button">×</button>
      </div>
      <div className="sticky top-0 z-20 lg:hidden"><div className="mx-4 mt-3 flex w-fit items-center gap-1 rounded-full border border-[#ece8f8] bg-white/88 p-1 shadow-[0_12px_28px_rgba(81,61,168,0.06)] dark:border-white/10 dark:bg-white/[0.04]">{(["calendar", "history", "stats"] as const).map((section) => <TaskTableChipButton aria-pressed={mobileSection === section} key={section} onClick={() => setMobileSection(section)} toneClassName={mobileSection === section ? "border-[#6f57f6] bg-[#6f57f6] text-white dark:border-[#c9bbff] dark:bg-[#c9bbff] dark:text-[#1a1431]" : TASK_TABLE_INACTIVE_CHIP_CLASS}>{section[0].toUpperCase() + section.slice(1)}</TaskTableChipButton>)}</div></div>
      <div className="adhdice-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:mt-6 sm:px-0 sm:py-0" ref={mobileScrollRef}>
        <div className="space-y-5 lg:hidden">
          {mobileSection === "calendar" ? <><section className="rounded-[1.5rem] border border-[#ece8f8] bg-[#fcfbff] p-4 dark:border-white/10 dark:bg-white/[0.03]"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">Calendar</p><p className="mt-1 text-sm text-[#7d88a1] dark:text-white/50">{isMultiSelect ? "Tap past or current dates to add or remove them." : "Tap a day to inspect or update it."}</p>{calendarControls}<div className="mt-3">{calendarLegend}</div><div className="adhdice-scrollbar mt-4 h-[7.5rem] overflow-y-auto overscroll-contain touch-pan-y" ref={mobileCalendarViewportRef}><div className="grid grid-cols-7 gap-1.5">{days.map(calendarButton)}</div></div></section>{selectedDetailsSection}</> : null}
          {mobileSection === "history" ? historySection : null}
          {mobileSection === "stats" ? statsSection : null}
        </div>
        <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] gap-6 lg:grid"><div className="space-y-6"><section className="rounded-[2rem] border border-[#ece8f8] bg-[#fcfbff] p-5 dark:border-white/10 dark:bg-white/[0.03]"><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">Calendar</p><p className="mt-1 text-sm text-[#7d88a1] dark:text-white/50">{isMultiSelect ? "Tap past or current dates to add or remove them." : "Tap a square to inspect or update that date."}</p>{calendarControls}</div><div className="max-w-sm">{calendarLegend}</div></div><div className="adhdice-scrollbar -mx-2 overflow-x-auto px-2 pb-2" ref={desktopCalendarViewportRef}><div className="inline-flex w-max gap-1.5 pr-2">{weeks.map((week, weekIndex) => <div className="flex flex-col gap-1.5" key={weekIndex}>{week.map(calendarButton)}</div>)}</div></div></section>{historySection}</div><div className="space-y-6">{selectedDetailsSection}{statsSection}</div></div>
      </div>
    </ModalShell>
  );
}

export function BottomDockAdapter({
  activePage,
  dockIcons,
  dockItems,
  onNavigate,
  renderIcon,
}: {
  activePage: AppPage;
  dockIcons: Record<AppPage, string>;
  dockItems: AppPage[];
  onNavigate: (page: AppPage) => void;
  renderIcon: (name: string) => ReactNode;
}) {
  return (
    <BottomDockComponent
      activePage={activePage}
      dockIcons={dockIcons}
      dockItems={dockItems}
      onNavigate={onNavigate}
      renderIcon={renderIcon}
    />
  );
}
