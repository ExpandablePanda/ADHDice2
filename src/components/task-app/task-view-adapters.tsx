"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ComponentProps, type JSX, type ReactNode } from "react";
import { ModalShell } from "../modal-shell";
import { BottomDockComponent } from "./bottom-dock";
import { FilterRowsComponent } from "./task-filter-rows";
import { FocusPlannerModalComponent } from "./focus-planner-modal";
import { Select } from "./task-status-select";
import { TaskDelayPicker } from "./task-delay-picker";
import { formatTaskStatusLabel, renderTaskStatusCircle, TASK_STATUS_CHIP_STYLES } from "./task-status-ui";
import {
  TASK_TABLE_CHIP_BASE_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TaskTableChipButton,
} from "@/components/ui/task-table-primitives";
import { TaskGridViewComponent } from "./task-grid-view";
import {
  buildTaskHistoryCalendarDueDateSet,
  computeTaskSpecificHistoryStats,
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
import type { AppPage } from "@/lib/task-ui-state";
import type { ImportTasksResult } from "@/hooks/useTaskCrudActions";
import { getTaskHistoryCalendarActionStatuses } from "@/lib/task-complete";
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

const HISTORY_STATUS_CHIP_BASE = "inline-flex items-center justify-center rounded-full border px-2 py-1 text-[13px] font-medium leading-none whitespace-nowrap";
const ACTIVE_CHIP_RING_CLASS = "ring-2 ring-[#d7cbfb] ring-offset-1 dark:ring-[#6d56d6] dark:ring-offset-[#18112d]";

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
}: {
  draftIds: string[];
  onClose: () => void;
  onFinish: () => void;
  onSetDraftIds: (ids: string[]) => void;
  onStepChange: (step: FocusPlannerStep) => void;
  step: FocusPlannerStep;
  tasks: Task[];
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
  onSetDelayedStatus,
  onSetStatuses,
  task,
  taskHistory,
  taskTitle,
  todayDateKey,
}: {
  onClose: () => void;
  onSetStatuses: (entryDates: string[], status: "clear" | "complete" | "did_my_best" | "done" | "missed") => Promise<void>;
  onSetDelayedStatus?: (entryDate: string, nextDueOn: string) => Promise<void>;
  task: Task;
  taskHistory: DbTaskHistory[];
  taskTitle: string;
  todayDateKey: string;
}) {
  const today = todayDateKey;
  const pastDayCount = 140;
  const futureDayCount = 42;
  const totalDays = pastDayCount + futureDayCount;
  const days = Array.from({ length: totalDays }, (_, index) => shiftDateKey(today, index - (pastDayCount - 1)));
  const historyByDate = new Map(taskHistory.map((historyEntry) => [historyEntry.entry_date, historyEntry]));
  const initialSelectedDate = [...historyByDate.keys()].sort().at(-1) ?? today;
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const [selectedDates, setSelectedDates] = useState<string[]>([initialSelectedDate]);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDelayEditor, setShowDelayEditor] = useState(false);
  const weeks: string[][] = [];
  const dueDates = buildTaskHistoryCalendarDueDateSet(task, days[0] ?? today, days.at(-1) ?? today, today, taskHistory);
  const sortedDueDates = [...dueDates].sort();
  const getNextDueDateKey = (dateKey: string) => sortedDueDates.find((dueDateKey) => dueDateKey >= dateKey) ?? null;
  const stats = computeTaskSpecificHistoryStats(task, taskHistory, today, days[0] ?? today);
  const lastDone = getTaskHistoryLastDone(taskHistory);
  const sortedHistory = [...taskHistory].sort((left, right) => right.entry_date.localeCompare(left.entry_date));
  const selectedEntry = historyByDate.get(selectedDate) ?? null;
  const selectedDateSet = new Set(selectedDates);
  const selectedEntries = selectedDates.map((dateKey) => historyByDate.get(dateKey) ?? null);
  const selectedIsFuture = selectedDate > today;
  const selectedIsDue = dueDates.has(selectedDate);
  const selectedIsMissed = selectedEntry?.status === "missed";
  const selectedVirtualState = getTaskHistoryCalendarVirtualState({
    dateKey: selectedDate,
    delayedUntilDateKey: task.status === "delayed" ? task.due_on : null,
    hasHistoryEntry: selectedEntry !== null,
    isDue: selectedIsDue,
    nextDueDateKey: getNextDueDateKey(selectedDate),
    projectsUndatedDelayed: task.status === "delayed" && task.due_on === null,
    todayDateKey: today,
  });
  const calendarActionStatuses = getTaskHistoryCalendarActionStatuses(task);
  const canDelaySelectedDate = !isMultiSelect
    && !selectedIsFuture
    && Boolean(task.due_on)
    && Boolean(onSetDelayedStatus)
    && (selectedDate === today || selectedIsMissed || selectedVirtualState === "due");
  const visibleCalendarActionStatuses = isMultiSelect
    ? calendarActionStatuses.filter((status) => status !== "complete" && status !== "delayed")
    : calendarActionStatuses;

  for (let weekIndex = 0; weekIndex < Math.ceil(totalDays / 7); weekIndex += 1) {
    weeks.push(days.slice(weekIndex * 7, weekIndex * 7 + 7));
  }

  function cellTone(dateKey: string) {
    const entry = historyByDate.get(dateKey);
    if (!entry) {
      const virtualState = getTaskHistoryCalendarVirtualState({
        dateKey,
        delayedUntilDateKey: task.status === "delayed" ? task.due_on : null,
        hasHistoryEntry: false,
        isDue: dueDates.has(dateKey),
        nextDueDateKey: getNextDueDateKey(dateKey),
        projectsUndatedDelayed: task.status === "delayed" && task.due_on === null,
        todayDateKey: today,
      });
      if (virtualState === "delayed") {
        return "border-[#d8c0ff] bg-[#f6efff] text-[#7d54d1] dark:border-[#4d377f] dark:bg-[#27193f] dark:text-[#d5c2ff]";
      }
      if (virtualState === "upcoming") {
        return "border-[#cfd6e4] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60";
      }
      if (virtualState === "due") {
        return "border-[#f6be96] bg-[#fff4eb] text-[#d96b1c] dark:border-[#7a4527] dark:bg-[#3a2418] dark:text-[#ffb47c]";
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

  function renderOfficialStatusChip(status: TaskStatus, label?: string) {
    return (
      <span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${statusTone(status)} gap-2`}>
        {renderTaskStatusCircle(status, "sm")}
        <span>{label ?? formatTaskStatusLabel(status)}</span>
      </span>
    );
  }

  function renderStatusPill(entry: DbTaskHistory | null, virtualState: "delayed" | "due" | "not_due" | "upcoming" | null = null) {
    if (!entry) {
      if (virtualState === "delayed") {
        return <span className={`${HISTORY_STATUS_CHIP_BASE} border-[#d8c0ff] bg-[#f6efff] text-[#7d54d1] dark:border-[#4d377f] dark:bg-[#27193f] dark:text-[#d5c2ff]`}>Delayed</span>;
      }
      if (virtualState === "due") {
        return <span className={`${HISTORY_STATUS_CHIP_BASE} border-[#f6be96] bg-[#fff4eb] text-[#d96b1c] dark:border-[#7a4527] dark:bg-[#3a2418] dark:text-[#ffb47c]`}>Due</span>;
      }
      if (virtualState === "upcoming") {
        return <span className={`${HISTORY_STATUS_CHIP_BASE} border-[#cfd6e4] bg-[#f4f5f8] text-[#68738c] dark:border-white/10 dark:bg-white/8 dark:text-white/60`}>Upcoming</span>;
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

  return (
    <ModalShell className="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[2.4rem] border border-[#ece8f8] bg-white p-6 shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label="Task history" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-[#efebfb] pb-5 dark:border-white/10">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]">Task History</p>
          <h2 className="mt-2 text-3xl font-black text-[#1f2746] dark:text-white">{taskTitle}</h2>
          <p className="mt-2 text-sm text-[#7d88a1] dark:text-white/50">
            Edit task history by date without changing past rewards or economy.
          </p>
        </div>
        <button className="text-2xl leading-none text-[#8e97af] dark:text-white/55" onClick={onClose} type="button">×</button>
      </div>

      <div className="adhdice-scrollbar mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <div className="space-y-6">
          <section className="rounded-[2rem] border border-[#ece8f8] bg-[#fcfbff] p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">Calendar</p>
                <p className="mt-1 text-sm text-[#7d88a1] dark:text-white/50">{isMultiSelect ? "Tap past or current dates to add or remove them." : "Tap a square to inspect or update that date."}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <TaskTableChipButton
                    onClick={toggleMultiSelect}
                    toneClassName={isMultiSelect ? "border-[#ddd2ff] bg-[#6f57f6] text-white dark:border-[#7f67ff] dark:bg-[#7f67ff] dark:text-white" : TASK_TABLE_INACTIVE_CHIP_CLASS}
                  >
                    {isMultiSelect ? `${selectedDates.length} Selected` : "Select Multiple"}
                  </TaskTableChipButton>
                  {isMultiSelect && selectedDates.length > 1 ? (
                    <TaskTableChipButton onClick={() => setSelectedDates([selectedDate])}>Keep Current Only</TaskTableChipButton>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                {renderOfficialStatusChip("done", "Done")}
                {renderOfficialStatusChip("complete", "Marked Complete")}
                {renderOfficialStatusChip("delayed", "Delayed")}
                {renderOfficialStatusChip("did_my_best", "Did My Best")}
                {renderOfficialStatusChip("missed", "Missed")}
                <span className="flex items-center gap-1.5 text-[#d96b1c] dark:text-[#ffb47c]"><span className="inline-block h-3 w-3 rounded-sm border border-[#f6be96] bg-[#fff4eb] dark:border-[#7a4527] dark:bg-[#3a2418]" />Due</span>
                <span className="flex items-center gap-1.5 text-[#68738c] dark:text-white/60"><span className="inline-block h-3 w-3 rounded-sm border border-[#cfd6e4] bg-[#f4f5f8] dark:border-white/10 dark:bg-white/8" />Upcoming</span>
                <span className="flex items-center gap-1.5 text-[#3388c9] dark:text-[#8ed0f6]"><span className="inline-block h-3 w-3 rounded-sm border border-[#a9daf7] bg-[#eef8ff] dark:border-[#315f7c] dark:bg-[#173044]" />Not Due</span>
              </div>
            </div>
            <div className="adhdice-scrollbar -mx-2 overflow-x-auto px-2 pb-2">
              <div className="inline-flex w-max gap-1.5 pr-2">
                {weeks.map((week, weekIndex) => (
                  <div className="flex flex-col gap-1.5" key={weekIndex}>
                    {week.map((dateKey) => (
                      <button
                        aria-pressed={selectedDateSet.has(dateKey)}
                        className={`flex h-9 w-9 items-center justify-center rounded-[0.85rem] border text-[10px] font-black tabular-nums transition ${cellTone(dateKey)} ${selectedDateSet.has(dateKey) ? "ring-2 ring-[#6f57f6] ring-offset-2 ring-offset-white dark:ring-[#cabfff] dark:ring-offset-[#171328]" : ""} ${isMultiSelect && dateKey > today ? "cursor-not-allowed opacity-45" : ""}`}
                        key={dateKey}
                        onClick={() => selectDate(dateKey)}
                        title={dateKey}
                        type="button"
                      >
                        {dateKey.slice(-2)}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-[#ece8f8] bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">Task Status History</p>
                <p className="mt-1 text-sm text-[#7d88a1] dark:text-white/50">Recent saved results for this task.</p>
              </div>
              <span className="text-xs font-semibold text-[#8d87a7] dark:text-white/40">{sortedHistory.length} logged</span>
            </div>
            <div className="adhdice-scrollbar max-h-[20rem] space-y-2 overflow-y-auto pr-1">
              {sortedHistory.length === 0 ? <EmptyTaskState text="No saved task history yet." /> : null}
              {sortedHistory.map((entry) => (
                <button
                  className={`flex w-full items-center justify-between rounded-[1.25rem] border px-4 py-3 text-left transition ${selectedDateSet.has(entry.entry_date) ? "border-[#cfc3ff] bg-[#f8f5ff] dark:border-[#6f57f6] dark:bg-[#22193d]" : "border-[#efebfb] bg-[#fcfbff] hover:border-[#ddd3ff] dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"}`}
                  key={entry.id}
                  onClick={() => selectDate(entry.entry_date)}
                  type="button"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#27304c] dark:text-white">{formatCalendarDate(entry.entry_date)}</p>
                    <p className="mt-1 text-xs text-[#8d87a7] dark:text-white/45">{dueDates.has(entry.entry_date) ? "Due opportunity" : "Manual history entry"}</p>
                    {formatTaskHistoryLoggedLine(entry) ? <p className="mt-1 text-xs text-[#8d87a7] dark:text-white/45">{formatTaskHistoryLoggedLine(entry)}</p> : null}
                    {formatTaskHistoryEditedLine(entry) ? <p className="mt-1 text-xs text-[#8d87a7] dark:text-white/45">{formatTaskHistoryEditedLine(entry)}</p> : null}
                  </div>
                  {renderStatusPill(entry)}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
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
                  toneClassName={`${statusTone(status)}${isSelectedStatus(status) ? ` ${ACTIVE_CHIP_RING_CLASS}` : " opacity-78 hover:opacity-100"} disabled:opacity-50`}
                >
                  {renderTaskStatusCircle(status, "sm")}
                  <span>{formatTaskStatusLabel(status)}</span>
                </TaskTableChipButton>
              ))}
              {selectedEntries.some(Boolean) ? (
                <TaskTableChipButton
                  className="gap-2"
                  disabled={isSaving || selectedDates.length === 0 || (!isMultiSelect && selectedIsFuture)}
                  onClick={() => { void handleSetStatus("clear"); }}
                  toneClassName={`${TASK_TABLE_INACTIVE_CHIP_CLASS} opacity-78 hover:opacity-100 disabled:opacity-50`}
                >
                  <span>Clear</span>
                </TaskTableChipButton>
              ) : null}
            </div>
            {showDelayEditor && canDelaySelectedDate && task.due_on ? (
              <div className="mt-4 rounded-[1.25rem] border border-[#efe9ff] bg-[#fbfaff] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                <TaskDelayPicker
                  anchorDateKey={selectedDate === today ? (task.due_on > today ? task.due_on : today) : selectedDate}
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

          <section className="rounded-[2rem] border border-[#ece8f8] bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8d87a7] dark:text-white/35">Stats</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {[
                { label: "Last Done", value: lastDone ? (lastDone.timestamp ? formatHistoryDateTime(lastDone.timestamp) : formatCalendarDate(lastDone.dateKey)) : "None", detail: "latest Done or Did My Best" },
                { label: "Current Streak", value: stats.currentStreak, detail: "completed due dates in a row" },
                { label: "Best Streak", value: stats.bestStreak, detail: "best completion streak" },
                { label: "Missed Streak", value: stats.missedStreak, detail: "missed due dates in a row" },
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
        </div>
        </div>
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
