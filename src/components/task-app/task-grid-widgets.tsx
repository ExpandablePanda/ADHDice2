"use client";

import { ChevronDown, ChevronUp, GripVertical, Trash2 } from "lucide-react";
import { useState } from "react";
import { renderTaskStatusCircle } from "./task-status-ui";
import { formatDueLabel } from "@/lib/task-cockpit";
import type { Task, TaskStatus, TaskSubtask as DbTaskSubtask, TaskSubtaskStatus } from "@/lib/database.types";
import { formatOptionLabel } from "@/lib/task-label-format";
import { formatRepeatSummary } from "@/lib/task-formatting";
import { getDisplayRowsFromSpan, getSpanFromDisplayRows, type TaskGridLayoutItem } from "@/lib/task-grid-layout";
import { getNextPendingSubtask, isClosedSubtaskStatus } from "@/lib/task-subtasks";

type TaskGridItem = TaskGridLayoutItem<string>;

const TASK_STATUS_OPTIONS: TaskStatus[] = ["pending", "in_progress", "done", "did_my_best", "missed", "upcoming", "not_due"];

function EmptyTaskState({ text }: { text: string }) {
  return (
    <div className="rounded-[1.25rem] border border-dashed px-4 py-5 text-sm border-[#ddd6f9] bg-[#faf8ff] text-[#7b84a0] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/55">
      {text}
    </div>
  );
}

function TaskMetaChip({ children, tone }: { children: React.ReactNode; tone: "blue" | "purple" | "green" | "neutral" | "red" | "yellow" }) {
  const className = tone === "blue"
    ? "bg-[#edf6ff] text-[#3f8bdc] dark:bg-[#162434] dark:text-[#8bc4ff]"
    : tone === "purple"
      ? "bg-[#f2edff] text-[#7a63f7] dark:bg-[#22193f] dark:text-[#c7b9ff]"
      : tone === "green"
        ? "bg-[#e8fbf2] text-[#0fa774] dark:bg-[#14362c] dark:text-[#7de4b8]"
        : tone === "yellow"
          ? "bg-[#fff5d9] text-[#b77900] dark:bg-[#44350d] dark:text-[#ffd56b]"
          : tone === "red"
            ? "bg-[#fff1f3] text-[#d94e67] dark:bg-[#44232f] dark:text-[#ff9eaf]"
            : "bg-[#f4f5f8] text-[#68738c] dark:bg-white/8 dark:text-white/60";

  return <span className={`inline-flex shrink-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-semibold ${className}`}>{children}</span>;
}

function TaskSupplementalMeta({ nextSubtask, task }: { nextSubtask: DbTaskSubtask | null; task: Task }) {
  const repeatSummary = formatRepeatSummary(task);
  const visibleTags = task.tags.slice(0, 3);

  if (visibleTags.length === 0 && !repeatSummary && !task.external_link_url && !task.estimated_minutes && !nextSubtask) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {task.one_step_at_a_time && nextSubtask ? <TaskMetaChip tone="purple">Next: {nextSubtask.title}</TaskMetaChip> : null}
      {visibleTags.map((tag) => <TaskMetaChip key={tag} tone="neutral">#{tag}</TaskMetaChip>)}
      {task.estimated_minutes ? <TaskMetaChip tone="neutral">{task.estimated_minutes} min</TaskMetaChip> : null}
      {repeatSummary ? <TaskMetaChip tone="blue">{repeatSummary}</TaskMetaChip> : null}
      {task.external_link_url ? (
        <a className="inline-flex shrink-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm font-semibold bg-[#edf6ff] text-[#3f8bdc] dark:bg-[#162434] dark:text-[#8bc4ff]" href={task.external_link_url} rel="noreferrer" target="_blank">
          {task.external_link_label || "Open link"}
        </a>
      ) : null}
    </div>
  );
}

export function TaskGridSelectedOverlayComponent({
  currentColumns,
  heightPresets,
  item,
  maxDisplayRows,
  onClose,
  onMove,
  onRemove,
  onResize,
  widgetLabel,
  widthPresets,
}: {
  currentColumns: number;
  heightPresets: Array<{ label: string; span: number }>;
  item: TaskGridItem;
  maxDisplayRows: number;
  onClose: () => void;
  onMove: (widgetId: string, direction: "up" | "down") => void;
  onRemove: () => void;
  onResize: (widgetId: string, nextWidth: number, nextHeight: number) => Promise<void> | void;
  widgetLabel: string;
  widthPresets: Array<{ label: string; width: number }>;
}) {
  const [customRowsInput, setCustomRowsInput] = useState(String(getDisplayRowsFromSpan(item.h)));

  const parsedCustomRows = Number.parseInt(customRowsInput, 10);
  const clampedCustomRows = Number.isFinite(parsedCustomRows)
    ? Math.max(1, Math.min(maxDisplayRows, parsedCustomRows))
    : null;

  function stopOverlayEvent(event: React.SyntheticEvent) {
    event.stopPropagation();
  }

  async function applyCustomRows() {
    if (clampedCustomRows === null) return;
    await onResize(item.id, item.w, getSpanFromDisplayRows(clampedCustomRows, maxDisplayRows));
    onClose();
  }

  return (
    <div className="absolute inset-x-3 bottom-3 z-30 rounded-[1.35rem] border p-3 border-[#ddd4ff] bg-white/95 shadow-[0_18px_36px_rgba(81,61,168,0.18)] dark:border-white/10 dark:bg-[#171328]/95" draggable={false} onClick={stopOverlayEvent} onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }} onMouseDown={stopOverlayEvent} onPointerDown={stopOverlayEvent} onTouchStart={stopOverlayEvent}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7a63f7] dark:text-[#c9bbff]">{widgetLabel}</p>
        <div className="flex flex-wrap gap-2">
          <button className="ui-pill-button-light" draggable={false} onClick={() => onMove(item.id, "up")} type="button">Up</button>
          <button className="ui-pill-button-light" draggable={false} onClick={() => onMove(item.id, "down")} type="button">Down</button>
          <button className="ui-pill-button-danger-light" draggable={false} onClick={onRemove} type="button">Remove</button>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        <div>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8b84a6] dark:text-white/40">Width</p>
          <div className="flex flex-wrap gap-2">
            {widthPresets.map((preset) => (
              <button className={Math.min(item.w, currentColumns) === preset.width ? "ui-pill-button-strong-light" : "ui-pill-button-light"} draggable={false} key={preset.label} onClick={() => onResize(item.id, preset.width, item.h)} type="button">{preset.label}</button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#8b84a6] dark:text-white/40">Rows</p>
          <div className="flex flex-wrap gap-2">
            {heightPresets.map((preset) => (
              <button className={item.h === preset.span ? "ui-pill-button-strong-light" : "ui-pill-button-light"} draggable={false} key={preset.label} onClick={() => onResize(item.id, item.w, preset.span)} type="button">{preset.label}</button>
            ))}
          </div>
        </div>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void applyCustomRows(); }}>
          <label className="min-w-0 flex-1">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-[#8b84a6] dark:text-white/40">Custom Rows</span>
            <input className="h-11 w-full rounded-[0.9rem] px-3 text-sm outline-none bg-[#f7f5ff] text-[#1f2642] dark:bg-white/8 dark:text-white" draggable={false} inputMode="numeric" max={String(maxDisplayRows)} min="1" onChange={(event) => setCustomRowsInput(event.target.value)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter" && clampedCustomRows !== null) { event.preventDefault(); void applyCustomRows(); } }} type="number" value={customRowsInput} />
          </label>
          <button className="ui-pill-button-strong-light" disabled={clampedCustomRows === null} draggable={false} onClick={(event) => { event.stopPropagation(); void applyCustomRows(); }} type="submit">Apply</button>
        </form>
      </div>
    </div>
  );
}

export function TaskGridWidgetShellComponent({
  children,
  currentColumns,
  draggedWidgetId,
  heightPresets,
  isEditMode,
  item,
  maxColumns,
  maxDisplayRows,
  onDeselect,
  onDragEnd,
  onDragStart,
  onDrop,
  onMove,
  onRemove,
  onResize,
  onSelect,
  selected,
  widgetLabel,
  widthPresets,
}: {
  children: React.ReactNode;
  currentColumns: number;
  draggedWidgetId: string | null;
  heightPresets: Array<{ label: string; span: number }>;
  isEditMode: boolean;
  item: TaskGridItem;
  maxColumns: number;
  maxDisplayRows: number;
  onDeselect: () => void;
  onDragEnd: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onMove: (widgetId: string, direction: "up" | "down") => void;
  onRemove: () => void;
  onResize: (widgetId: string, nextWidth: number, nextHeight: number) => Promise<void> | void;
  onSelect: () => void;
  selected: boolean;
  widgetLabel: string;
  widthPresets: Array<{ label: string; width: number }>;
}) {
  const widthSpan = Math.max(1, Math.min(item.w, currentColumns));

  return (
    <div className={`relative min-w-0 ${isEditMode ? "cursor-grab" : ""} ${draggedWidgetId === item.id ? "opacity-60" : ""}`} draggable={isEditMode} onClick={() => { if (isEditMode && !selected) onSelect(); }} onDragEnd={onDragEnd} onDragOver={(event) => { if (isEditMode) event.preventDefault(); }} onDragStart={onDragStart} onDrop={(event) => { if (isEditMode) { event.preventDefault(); onDrop(); } }} style={{ gridColumn: currentColumns === maxColumns ? `${Math.min(item.x + 1, maxColumns)} / span ${widthSpan}` : `span ${widthSpan} / span ${widthSpan}`, gridRow: currentColumns === maxColumns ? `${item.y + 1} / span ${item.h}` : `span ${item.h} / span ${item.h}` }}>
      {isEditMode ? <div className={`pointer-events-none absolute inset-0 z-10 rounded-[2rem] border-2 ${selected ? "border-[#6f57f6] shadow-[0_0_0_4px_rgba(111,87,246,0.16)] dark:border-[#cabfff] dark:shadow-[0_0_0_4px_rgba(202,191,255,0.12)]" : "border-[#dcd2ff] dark:border-white/15"}`} /> : null}
      {isEditMode ? <div className="absolute left-4 top-4 z-20 rounded-full px-3 py-1 text-xs font-semibold bg-white text-[#6f57f6] shadow-[0_10px_24px_rgba(81,61,168,0.12)] dark:bg-[#171328] dark:text-[#cabfff]"><GripVertical className="mr-1 inline h-3.5 w-3.5" />{widgetLabel}</div> : null}
      {isEditMode ? <button aria-label={`Remove ${widgetLabel}`} className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-[#fff1f3] text-[#f05566] shadow-[0_10px_24px_rgba(240,85,102,0.12)] dark:bg-[#44232f] dark:text-[#ff9eaf]" onClick={(event) => { event.stopPropagation(); onRemove(); }} type="button"><Trash2 className="h-4 w-4" /></button> : null}
      {isEditMode && selected ? <TaskGridSelectedOverlayComponent key={`${item.id}-${item.h}`} currentColumns={currentColumns} heightPresets={heightPresets} item={item} maxDisplayRows={maxDisplayRows} onClose={onDeselect} onMove={onMove} onRemove={onRemove} onResize={onResize} widgetLabel={widgetLabel} widthPresets={widthPresets} /> : null}
      <div className={`h-full min-h-0 overflow-hidden ${isEditMode ? "pointer-events-none" : ""}`}><div className={`adhdice-scrollbar h-full min-h-0 overflow-y-auto ${isEditMode && selected ? "pb-56" : ""}`}>{children}</div></div>
    </div>
  );
}

export function UrgentTasksPanelComponent({
  focusedTaskIds,
  onEditTask,
  onSetStatus,
  onSetSubtaskStatus,
  subtasksByTaskId,
  tasks,
}: {
  focusedTaskIds: string[];
  onEditTask: (task: Task) => void;
  onSetStatus: (task: Task, status: TaskStatus) => void;
  onSetSubtaskStatus: (subtaskId: string, status: TaskSubtaskStatus) => void;
  subtasksByTaskId: Record<string, DbTaskSubtask[]>;
  tasks: Task[];
}) {
  const DEFAULT_VISIBLE_COUNT = 4;
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleTasks = isExpanded ? tasks : tasks.slice(0, DEFAULT_VISIBLE_COUNT);
  const hiddenCount = Math.max(0, tasks.length - visibleTasks.length);

  return (
    <section className="w-full overflow-hidden rounded-[2rem] border p-5 transition hover:-translate-y-0.5 border-[#ece8f8] bg-white shadow-[0_18px_50px_rgba(81,61,168,0.07)] dark:border-white/10 dark:bg-white/6">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full bg-[#f05566] dark:bg-[#ff9eaf]" /><h2 className="text-2xl font-black uppercase tracking-[0.08em] text-[#28304a] dark:text-white">Urgent Tasks</h2></div>
        <span className="text-2xl font-bold text-[#939ab0] dark:text-white/45">{tasks.length}</span>
      </div>

      <div className="mt-5 space-y-5">
        {tasks.length === 0 ? <EmptyTaskState text="No urgent tasks match the current filters." /> : null}
        {visibleTasks.map((task, index) => (
          <article className="w-full overflow-hidden rounded-[1.4rem] border p-4 transition border-[#ede8fb] bg-[#fcfbff] dark:border-white/10 dark:bg-white/[0.04]" key={task.id}>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`h-4 w-4 shrink-0 rounded-full ${index < 2 ? "bg-[#f05566]" : "bg-[#12b886]"}`} />
                  <button className="min-w-0 truncate text-left text-[1.55rem] font-semibold text-[#202844] dark:text-white" onClick={() => onEditTask(task)} type="button">{task.title}</button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {focusedTaskIds.includes(task.id) ? <TaskMetaChip tone="purple">Focus</TaskMetaChip> : null}
                  <TaskMetaChip tone="neutral">{task.priority} priority</TaskMetaChip>
                  <TaskMetaChip tone="green">{task.energy}</TaskMetaChip>
                  <TaskMetaChip tone="neutral">{formatDueLabel(task.due_on)}</TaskMetaChip>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TASK_STATUS_OPTIONS.map((status) => {
                    const isActive = task.status === status;
                    return (
                      <button aria-label={`Set status to ${formatOptionLabel(status)}`} className={`h-8 w-8 rounded-full border-2 transition ${isActive ? "border-[#202844] dark:border-white" : "border-transparent opacity-65 hover:opacity-100"}`} key={status} onClick={() => onSetStatus(task, status)} title={formatOptionLabel(status)} type="button"><span className="flex h-full w-full items-center justify-center">{renderTaskStatusCircle(status, "md")}</span></button>
                    );
                  })}
                </div>
                <TaskSupplementalMeta nextSubtask={getNextPendingSubtask(task.id, subtasksByTaskId)} task={task} />
              </div>
              <div className="flex w-full gap-2 sm:w-auto sm:shrink-0"><button className="ui-pill-button-strong-light w-full sm:w-auto" onClick={() => onEditTask(task)} type="button">Edit</button></div>
            </div>

            <ul className="mt-5 space-y-2">
              {(subtasksByTaskId[task.id] ?? []).map((subtask) => (
                <li className="flex items-center gap-3" key={subtask.id}>
                  <button aria-label={`Mark ${subtask.title} as ${isClosedSubtaskStatus(subtask.status) ? "pending" : "done"}`} className="transition" onClick={() => onSetSubtaskStatus(subtask.id, isClosedSubtaskStatus(subtask.status) ? "pending" : "done")} type="button">{renderTaskStatusCircle(subtask.status, "sm")}</button>
                  <span className={`${isClosedSubtaskStatus(subtask.status) ? "line-through opacity-50" : ""} text-[#525d78] dark:text-white/72`}>{subtask.title}</span>
                </li>
              ))}
              {(subtasksByTaskId[task.id] ?? []).length === 0 ? <li className="text-sm text-[#8d97b0] dark:text-white/45">No subtasks yet.</li> : null}
            </ul>
          </article>
        ))}
        {tasks.length > DEFAULT_VISIBLE_COUNT ? (
          <button className="flex w-full items-center justify-center gap-2 rounded-[1.1rem] border px-4 py-3 text-sm font-semibold border-[#e6defb] bg-[#faf7ff] text-[#6f57f6] dark:border-white/10 dark:bg-white/[0.04] dark:text-[#cabfff]" onClick={() => setIsExpanded((prev) => !prev)} type="button">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {isExpanded ? "Show fewer urgent tasks" : `Show ${hiddenCount} more urgent task${hiddenCount === 1 ? "" : "s"}`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
