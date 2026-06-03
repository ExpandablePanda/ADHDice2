"use client";

import { useState, type ComponentProps, type JSX, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { ModalShell } from "../modal-shell";
import { BottomDockComponent } from "./bottom-dock";
import { FilterRowsComponent } from "./task-filter-rows";
import { FocusPlannerModalComponent } from "./focus-planner-modal";
import { PageShellHeader } from "./page-shell-header";
import { RollPageComponent } from "./roll-page";
import { NotesPageComponent } from "./notes-page";
import { Select } from "./task-status-select";
import { TaskGridViewComponent } from "./task-grid-view";
import {
  TaskCardGalleryComponent,
  TaskComposerCardComponent,
  TaskLaneComponent,
  TaskMatrixViewComponent,
} from "./task-secondary-views";
import { UrgentTasksPanelComponent } from "./task-grid-widgets";
import type { TaskDraft } from "./task-editor-model";
import { todayISO } from "@/lib/utils";
import { shiftDateKey } from "@/lib/task-grid-layout";
import type { createBrowserSupabaseClient } from "@/lib/supabase";
import type { AppPage } from "@/lib/task-ui-state";
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

function FocusStatsCard({
  activeCount,
  doneCount,
  overdueCount,
  taskHistoryStats,
}: {
  activeCount: number;
  doneCount: number;
  overdueCount: number;
  taskHistoryStats: { bestStreak: number; currentStreak: number; doneRate: number };
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
  message,
  onImport,
}: {
  message: Message | null;
  onImport: (lines: string[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lines = text
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s+/, ""))
    .filter(Boolean);

  return (
    <section className="rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6">
      <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">
        Import List
      </h2>
      <p className="mt-2 text-sm text-[#78829c] dark:text-white/55">
        Paste a rough list and turn it into calm, structured tasks.
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsSubmitting(true);
          await onImport(lines);
          setText("");
          setIsSubmitting(false);
        }}
      >
        <textarea
          className="min-h-40 w-full resize-y rounded-[1.25rem] px-4 py-4 text-base outline-none bg-[#f7f5ff] text-[#1f2642] placeholder:text-[#9b9fba] dark:bg-white/8 dark:text-white dark:placeholder:text-white/30"
          onChange={(event) => setText(event.target.value)}
          placeholder={"Call dentist\nDrink water\nChoose dinner"}
          value={text}
        />
        <button
          className="w-full rounded-[1.25rem] px-5 py-4 text-lg font-bold bg-[#ede8ff] text-[#6f57f6] dark:bg-[#22193f] dark:text-[#cabfff]"
          disabled={lines.length === 0 || isSubmitting}
          type="submit"
        >
          Import {lines.length || ""}
        </button>
      </form>

      <p className="mt-3 text-sm text-[#8c94ac] dark:text-white/45">
        {message?.text}
      </p>
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
  onImportTasks: (lines: string[]) => Promise<void>;
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
  taskHistoryStats: { bestStreak: number; currentStreak: number; doneRate: number };
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
  taskHistory,
  taskTitle,
}: {
  onClose: () => void;
  taskHistory: DbTaskHistory[];
  taskTitle: string;
}) {
  const today = todayISO();
  const totalDays = 84;
  const days = Array.from({ length: totalDays }, (_, index) => shiftDateKey(today, index - (totalDays - 1)));
  const historyByDate = new Map(taskHistory.map((historyEntry) => [historyEntry.entry_date, historyEntry]));
  const weeks: string[][] = [];

  for (let weekIndex = 0; weekIndex < 12; weekIndex += 1) {
    weeks.push(days.slice(weekIndex * 7, weekIndex * 7 + 7));
  }

  const completedCount = taskHistory.filter((historyEntry) => historyEntry.was_completed).length;

  function cellColor(dateKey: string) {
    if (dateKey > today) return "bg-transparent";
    const entry = historyByDate.get(dateKey);
    if (!entry) return "bg-[#ece8f8] dark:bg-white/8";
    if (entry.was_completed) return "bg-[#6f57f6] dark:bg-[#8b70ff]";
    return "bg-[#fbd0d5] dark:bg-[#5a2030]";
  }

  return (
    <ModalShell className="w-full max-w-lg rounded-[2rem] border p-5 border-[#ece8f8] bg-white shadow-[0_30px_80px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]" label="Task history" onClose={onClose}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[#1f2746] dark:text-white">History</h2>
          <p className="mt-0.5 text-sm text-[#7d88a1] dark:text-white/50">{taskTitle}</p>
        </div>
        <button className="text-2xl leading-none text-[#8e97af] dark:text-white/55" onClick={onClose} type="button">×</button>
      </div>

      <div className="adhdice-scrollbar flex gap-1 overflow-x-auto pb-1">
        {weeks.map((week, weekIndex) => (
          <div className="flex flex-col gap-1" key={weekIndex}>
            {week.map((dateKey) => (
              <div
                className={`h-5 w-5 rounded-sm ${cellColor(dateKey)}`}
                key={dateKey}
                title={dateKey}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-[#6f57f6] dark:bg-[#8b70ff]" />
            <span className="text-[#7d88a1] dark:text-white/50">Done</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-[#fbd0d5] dark:bg-[#5a2030]" />
            <span className="text-[#7d88a1] dark:text-white/50">Missed</span>
          </span>
        </div>
        <span className="text-[#7d88a1] dark:text-white/50">
          {completedCount} completed in last 12 weeks
        </span>
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

export function RollPageAdapter({
  client,
  currentUser,
  isDark,
  onSpendPoints,
  tasks,
}: {
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  currentUser: User;
  isDark: boolean;
  onSpendPoints: (delta: number, reason: string) => void;
  tasks: Task[];
}) {
  return <RollPageComponent client={client} currentUser={currentUser} isDark={isDark} onSpendPoints={onSpendPoints} tasks={tasks} />;
}

export function NotesPageAdapter({
  client,
  currentUser,
  onOpenNoteHandled,
  openNoteId,
  tasks,
}: {
  client: NonNullable<ReturnType<typeof createBrowserSupabaseClient>>;
  currentUser: User;
  onOpenNoteHandled?: () => void;
  openNoteId?: string | null;
  tasks: Task[];
}) {
  return <NotesPageComponent client={client} currentUser={currentUser} headerNode={<PageShellHeader subtitle="Knowledge Base" title="Notes" />} onOpenNoteHandled={onOpenNoteHandled} openNoteId={openNoteId} tasks={tasks} />;
}
