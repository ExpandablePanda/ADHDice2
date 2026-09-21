"use client";

import { ArrowDownToLine, ArrowUpToLine, CalendarDays, ChevronDown, GripVertical, ListTodo, LoaderCircle, Minus, Pencil, Plus, Search, Settings2, Skull, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { AdhdCard } from "@/components/ui-system/adhd-card";
import { AdhdChip } from "@/components/ui-system/adhd-chip";
import { AdhdDropdownPanel } from "@/components/ui-system/adhd-dropdown-panel";
import { AdhdIconButton } from "@/components/ui-system/adhd-icon-button";
import { AdhdPanel } from "@/components/ui-system/adhd-panel";
import { TaskTypeSelect } from "./task-type-identity";
import { PageShell, PageShellBody, PageShellLayoutControls, PageShellSurface, ReorderablePageShells } from "@/components/ui-system/reorderable-page-shells";
import { usePageShellLayout } from "@/hooks/usePageShellLayout";
import { HOME_PAGE_SHELL_CANONICAL_LAYOUT, HOME_PAGE_SHELL_IDS } from "@/lib/page-shell-layout";
import { SortableList } from "@/components/ui/sortable-list";
import { useHomeTodoState } from "@/hooks/useHomeTodoState";
import { TaskStatusCircleRail, formatTaskStatusLabel, renderTaskStatusCircle } from "@/components/task-app/task-status-ui";
import { TaskAttentionChip } from "./task-attention-chip";
import { PageShellHeader } from "./page-shell-header";
import { getSelectableTaskStatusesForTask } from "@/lib/task-complete";
import { resolveTaskStatusOptionsForTask } from "@/lib/task-state-engine/action-authority";
import type { TaskBehaviorPolicyResolutionContext } from "@/lib/task-state-engine/behavior-policy";
import type { Task, TaskRepeatFrequency, TaskRepeatMonthlyMode, TaskRepeatMonthlyOrdinal, TaskStatus } from "@/lib/database.types";
import type { TaskDisplayStatusByTaskId } from "@/lib/task-display-status";
import type { TaskListMembership } from "@/lib/task-lists";
import type { TaskAttentionReason } from "@/lib/task-attention";
import type { TaskHistoryStreakSummaryMap } from "@/lib/task-history-streak-summaries";
import type { TaskSiblingDropPlacement, TaskSiblingReorderInstruction } from "@/lib/task-sibling-reorder";
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
import type { HomeDailyProgress, HomeRecordChase, HomeRecordMetricKey } from "@/lib/home-progress";
import {
  buildHomeTodoHierarchy,
  buildHomeTodoDaySections,
  buildHomeRoutineGroups,
  buildHomeRoutineSections,
  createHomeTodoTask,
  formatHomeRoutineDueLabel,
  getHomeRoutineStreakMetadata,
  getHomeRoutineTaskIds,
  getHomeTodoSearchText,
  shouldPersistHomeRoutineReconciliation,
  isHomeTodoTaskEligible,
  mergeHomeTodoVisibleTaskIds,
  moveHomeTodoTaskIdToEdge,
  reconcileHomeTodoTaskIds,
  reconcileHomeRoutineTaskIds,
  sortHomeTodoSearchResults,
  type HomeTodoTaskMetadata,
} from "@/lib/home-todo-state";
import {
  CompactRepeatCadenceControls,
  dedupeTaskTagLabels,
  formatNewTaskTagLabel,
  TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS,
  TASK_TABLE_ACTIVE_LIST_CHIP_CLASS,
  TASK_TABLE_INACTIVE_CHIP_CLASS,
  TASK_TABLE_INPUT_CLASS,
  TASK_TABLE_LIST_CHIP_CLASS,
  normalizeTaskTagValue,
  TaskTableChipButton,
  TASK_TABLE_CHIP_BASE_CLASS,
  TaskCurrentStreakChip,
} from "@/components/ui/task-table-primitives";

const HOME_TODO_TITLE_CLASS = "text-sm font-medium text-[#26324f] dark:text-white";
const HOME_TODO_LIST_CLASS = "mt-3 space-y-2 max-sm:-mx-2";
const HOME_TODO_ACTION_CLASS = "max-sm:!h-7 max-sm:!w-7";
const HOME_TODO_ACTION_ICON_CLASS = "max-sm:!h-[12.25px] max-sm:!w-[12.25px]";
const HOME_GEAR_LONG_PRESS_MS = 475;
const HOME_GEAR_LONG_PRESS_MOVE_PX = 8;
const HOME_REPEAT_OPTIONS: ReadonlyArray<{ label: string; value: TaskRepeatFrequency }> = [
  { label: "No Repeat", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Daily Until Complete", value: "daily_until_complete" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Custom Cadence", value: "custom" },
];
const HOME_REPEAT_WEEKDAY_OPTIONS = REPEAT_WEEKDAY_FULL_LABELS.map((label, value) => ({ label: label.slice(0, 3), value }));
const HOME_REPEAT_MONTHLY_WEEKDAY_OPTIONS = REPEAT_WEEKDAY_FULL_LABELS.map((label, value) => ({ label, value }));
const HOME_REPEAT_UNITS: Array<{ label: string; value: TaskRepeatFrequency }> = [
  { label: "Days", value: "daily" },
  { label: "Weeks", value: "weekly" },
  { label: "Months", value: "monthly" },
];
type HomePanelTab = "todo" | "routine";
type HomeRowActionMenuView = "actions" | "move-day";

type HomeRowActionMenuState = {
  taskId: string;
  view: HomeRowActionMenuView;
};

type HomeGearLongPressPointer = {
  pointerId: number;
  startX: number;
  startY: number;
  triggered: boolean;
};

type HomeRoutineChildDragState = {
  depth: number;
  parentTaskId: string;
  taskId: string;
};

type HomeRoutineChildDropTarget = {
  placement: TaskSiblingDropPlacement;
  taskId: string;
};

function RoutineTaskMetadata({
  task,
  streakSummary,
}: {
  task: Pick<Task, "due_on" | "due_time">;
  streakSummary?: TaskHistoryStreakSummaryMap[string];
}) {
  const dueLabel = formatHomeRoutineDueLabel(task);
  const streak = getHomeRoutineStreakMetadata(streakSummary);
  if (!dueLabel && !streak) return null;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {dueLabel ? <span className={`${TASK_TABLE_CHIP_BASE_CLASS} ${TASK_TABLE_LIST_CHIP_CLASS}`}>{dueLabel}</span> : null}
      {streak?.kind === "missed" ? (
        <span className={`${TASK_TABLE_CHIP_BASE_CLASS} gap-1 border-[#ffd6de] bg-[#fff1f3] px-2 text-[#d94e67] dark:border-[#5b2e3b] dark:bg-[#44232f] dark:text-[#ff9eaf]`}>
          <Skull aria-hidden="true" className="h-3 w-3" />
          {streak.count}
        </span>
      ) : (
        <TaskCurrentStreakChip currentStreak={streak?.count ?? 0} />
      )}
    </span>
  );
}

function HomeTodoTaskSignals({
  attentionReason,
  task,
  streakSummary,
}: {
  attentionReason?: TaskAttentionReason | null;
  task: Pick<Task, "due_on" | "id">;
  streakSummary?: TaskHistoryStreakSummaryMap[string];
}) {
  const missedStreak = streakSummary?.missedStreak ?? 0;
  const currentStreak = streakSummary?.currentStreak ?? 0;
  if (missedStreak <= 0 && currentStreak <= 0 && !attentionReason) return null;

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1">
      {missedStreak > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#ffd6de] bg-[#fff1f3] px-1.5 py-0 text-[11px] font-medium leading-5 text-[#d65775] dark:border-[#5f2a36] dark:bg-[#32161d] dark:text-[#ffb0c1]">
          <Skull aria-hidden="true" className="h-3 w-3" />
          {missedStreak}
        </span>
      ) : (
        <TaskCurrentStreakChip className="px-1.5 py-0 text-[11px]" currentStreak={currentStreak} />
      )}
      {attentionReason ? <TaskAttentionChip dueOn={task.due_on} reason={attentionReason} taskId={task.id} /> : null}
    </span>
  );
}

function HomeProgressDashboard({
  dailyProgress,
  homeRecordChases,
  isTaskHistoryLoaded,
  onOpenRecord,
  recordTargetsError,
  recordTargetsLoading,
  recordTargetsRecalculatedAt,
  recordTargetsSettingsMismatch,
}: {
  dailyProgress: HomeDailyProgress;
  homeRecordChases: HomeRecordChase[];
  isTaskHistoryLoaded: boolean;
  onOpenRecord: (metricKey: HomeRecordMetricKey) => void;
  recordTargetsError: string | null;
  recordTargetsLoading: boolean;
  recordTargetsRecalculatedAt: string | null;
  recordTargetsSettingsMismatch: boolean;
}) {
  const [isFinishedDetailsOpen, setIsFinishedDetailsOpen] = useState(false);

  return (
    <div className="mb-4 grid min-w-0 gap-3 sm:grid-cols-2" data-home-progress-dashboard>
      <AdhdPanel aria-labelledby="home-finished-today" padding="sm">
        <h2 className="text-sm font-semibold text-[#26324f] dark:text-white" id="home-finished-today">Finished Today</h2>
        {!isTaskHistoryLoaded ? (
          <div aria-live="polite" className="mt-3 flex items-center gap-2 text-sm text-[#817990] dark:text-white/55" role="status">
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-[#7d6cf5]" />
            <span>Loading today&apos;s completions…</span>
          </div>
        ) : (
          <div className="mt-3">
            <button
              aria-controls="home-finished-today-details"
              aria-expanded={isFinishedDetailsOpen}
              className="block w-full rounded-lg text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#8b78ed]"
              onClick={() => setIsFinishedDetailsOpen((open) => !open)}
              type="button"
            >
              <p className="text-2xl font-bold leading-none text-[#30275a] dark:text-white">
                {dailyProgress.total} <span className="text-sm font-medium text-[#7d7598] dark:text-white/55">finished today</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[#746d90] dark:text-white/60">
                <span>Done {dailyProgress.done}</span>
                <span>Did My Best {dailyProgress.didMyBest}</span>
                <span>Completed {dailyProgress.completed}</span>
              </div>
            </button>
            {isFinishedDetailsOpen ? (
              <div className="mt-3 border-t border-[#f0ecf8] pt-2.5 dark:border-white/8" id="home-finished-today-details">
                <p className="text-[11px] font-medium text-[#8b82a7] dark:text-white/48">Finished Tasks and Steps</p>
                {dailyProgress.finishedItems.length > 0 ? (
                  <ul className="mt-1.5 grid max-h-48 gap-1 overflow-y-auto">
                    {dailyProgress.finishedItems.map((item) => (
                      <li className="flex items-center justify-between gap-3 rounded-md bg-[#faf8fe] px-2 py-1.5 text-xs dark:bg-white/5" key={item.taskId}>
                        <span className="min-w-0 truncate text-[#625b7b] dark:text-white/75">{item.title}</span>
                        <span className="shrink-0 text-[10px] text-[#8b82a7] dark:text-white/48">
                          {item.entityKind === "step" ? "Step" : "Task"} · {item.outcome === "did_my_best" ? "Did My Best" : item.outcome === "complete" ? "Completed" : "Done"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-xs text-[#8b82a7] dark:text-white/48">No Tasks or Steps finished today.</p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </AdhdPanel>

      <AdhdPanel aria-labelledby="home-records-to-beat" padding="sm">
        <h2 className="text-sm font-semibold text-[#26324f] dark:text-white" id="home-records-to-beat">Records to Beat</h2>
        {recordTargetsLoading ? (
          <div aria-live="polite" className="mt-3 flex items-center gap-2 text-sm text-[#817990] dark:text-white/55" role="status">
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-[#7d6cf5]" />
            <span>Loading saved Records…</span>
          </div>
        ) : recordTargetsError ? (
          <p className="mt-3 text-xs text-[#8b82a7] dark:text-white/48">Record targets unavailable right now.</p>
        ) : recordTargetsSettingsMismatch ? (
          <p className="mt-3 text-xs text-[#8b82a7] dark:text-white/48">Record targets need a Records refresh after your day settings changed.</p>
        ) : (
          <div className="mt-2 grid gap-1.5">
            {recordTargetsRecalculatedAt ? <p className="mb-1 text-[11px] text-[#8b82a7] dark:text-white/48">Records calculated {new Date(recordTargetsRecalculatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p> : null}
            {homeRecordChases.map((chase) => (
              <button
                aria-label={`Open ${chase.label} in Progress Records`}
                className="w-full rounded-lg border border-[#f0ecf8] px-2.5 py-2 text-left outline-none transition-colors hover:bg-[#faf8fe] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8b78ed] dark:border-white/8 dark:hover:bg-white/5"
                key={chase.metricKey}
                onClick={() => onOpenRecord(chase.metricKey)}
                type="button"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-xs font-medium text-[#625b7b] dark:text-white/70">{chase.label}</span>
                  <span className="shrink-0 text-xs font-semibold text-[#30275a] dark:text-white">
                    {chase.liveValue}{chase.recordValue === null ? " today" : ` / Record ${chase.recordValue}`}
                  </span>
                </span>
                <span className={`mt-0.5 block text-[11px] ${chase.state === "new_record" ? "text-[#23815b] dark:text-[#70d6a7]" : chase.state === "tied_record" ? "text-[#6f57f6] dark:text-[#b8aaff]" : "text-[#8b82a7] dark:text-white/48"}`}>
                  {chase.message}
                </span>
              </button>
            ))}
          </div>
        )}
      </AdhdPanel>
    </div>
  );
}

export function HomePage({
  listMembershipsByTaskId,
  manualMembershipsByTaskId,
  allTags,
  onCreateTaskWithType,
  onSetRoutineMembership,
  onReorderChildTask,
  onOpenTask,
  onSetStatus,
  taskDisplayStatusByTaskId,
  dailyProgress,
  homeRecordChases,
  isTaskHistoryLoaded,
  onOpenRecord,
  recordTargetsError,
  recordTargetsLoading,
  recordTargetsRecalculatedAt,
  recordTargetsSettingsMismatch,
  taskAttentionReasonByTaskId,
  taskHistoryStreakSummaries,
  calendarNowMs,
  calendarTimeZone,
  tasks,
  userId,
  behaviorProfiles,
  behaviorPolicyRevisions,
  namedCustomRulesetBehaviorPolicyRevisions,
  behaviorSelectionsByTaskId,
  behaviorPolicyLoading = false,
  behaviorPolicyLogicalDate,
  taskTypeOptions,
}: {
  listMembershipsByTaskId: Record<string, TaskListMembership[]>;
  manualMembershipsByTaskId: Readonly<Record<string, readonly string[]>>;
  allTags: string[];
  onCreateTaskWithType: (title: string, taskTypeSelectionValue: string, metadata: HomeTodoTaskMetadata) => Promise<Task | null>;
  onSetRoutineMembership: (taskId: string, included: boolean) => Promise<boolean>;
  onReorderChildTask: (taskId: string, instruction: TaskSiblingReorderInstruction) => void;
  onOpenTask: (taskId: string) => void;
  onSetStatus: (task: Task, status: TaskStatus) => void;
  taskDisplayStatusByTaskId: TaskDisplayStatusByTaskId;
  dailyProgress: HomeDailyProgress;
  homeRecordChases: HomeRecordChase[];
  isTaskHistoryLoaded: boolean;
  onOpenRecord: (metricKey: HomeRecordMetricKey) => void;
  recordTargetsError: string | null;
  recordTargetsLoading: boolean;
  recordTargetsRecalculatedAt: string | null;
  recordTargetsSettingsMismatch: boolean;
  taskAttentionReasonByTaskId: Readonly<Record<string, TaskAttentionReason>>;
  taskHistoryStreakSummaries: TaskHistoryStreakSummaryMap;
  calendarNowMs: number;
  calendarTimeZone: string;
  tasks: Task[];
  userId: string | null;
  behaviorProfiles?: TaskBehaviorPolicyResolutionContext["behaviorProfiles"];
  behaviorPolicyRevisions?: TaskBehaviorPolicyResolutionContext["behaviorPolicyRevisions"];
  namedCustomRulesetBehaviorPolicyRevisions?: TaskBehaviorPolicyResolutionContext["namedCustomRulesetBehaviorPolicyRevisions"];
  behaviorSelectionsByTaskId?: TaskBehaviorPolicyResolutionContext["behaviorSelectionsByTaskId"];
  behaviorPolicyLoading?: boolean;
  behaviorPolicyLogicalDate: string;
  taskTypeOptions: ReadonlyArray<TaskTypeSelectionOption>;
}) {
  const layout = usePageShellLayout(userId, "home", HOME_PAGE_SHELL_IDS, HOME_PAGE_SHELL_CANONICAL_LAYOUT.sizes, HOME_PAGE_SHELL_CANONICAL_LAYOUT);
  const { state, syncStatus, updateRoutineSectionName, updateRoutineTaskIds, updateRoutinesPerSection, updateTaskDayOffset, updateTaskIds, updateTasksPerDay } = useHomeTodoState(userId);
  const [query, setQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeHomeTab, setActiveHomeTab] = useState<HomePanelTab>("todo");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskTypeSelection, setNewTaskTypeSelection] = useState("task");
  const [newTaskDueOn, setNewTaskDueOn] = useState("");
  const [newTaskDueTime, setNewTaskDueTime] = useState("");
  const [newTaskRepeatFrequency, setNewTaskRepeatFrequency] = useState<TaskRepeatFrequency>("none");
  const [newTaskRepeatInterval, setNewTaskRepeatInterval] = useState("1");
  const [newTaskRepeatDaysOfWeek, setNewTaskRepeatDaysOfWeek] = useState<number[]>([]);
  const [newTaskRepeatDayOfMonth, setNewTaskRepeatDayOfMonth] = useState("");
  const [newTaskRepeatMonthlyMode, setNewTaskRepeatMonthlyMode] = useState<TaskRepeatMonthlyMode>("day_of_month");
  const [newTaskRepeatMonthlyOrdinal, setNewTaskRepeatMonthlyOrdinal] = useState<TaskRepeatMonthlyOrdinal | null>(null);
  const [newTaskRepeatMonthlyWeekday, setNewTaskRepeatMonthlyWeekday] = useState<number | null>(null);
  const [newTaskTags, setNewTaskTags] = useState<string[]>([]);
  const [newTaskTagDraft, setNewTaskTagDraft] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriorityLevelOption>("0");
  const [isCreating, setIsCreating] = useState(false);
  const [isDoLaterOpen, setIsDoLaterOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);
  const [rowActionMenu, setRowActionMenu] = useState<HomeRowActionMenuState | null>(null);
  const [isFastActionMode, setIsFastActionMode] = useState(false);
  const [editingRoutineSectionIndex, setEditingRoutineSectionIndex] = useState<number | null>(null);
  const [routineSectionNameDraft, setRoutineSectionNameDraft] = useState("");
  const [routineChildDragState, setRoutineChildDragState] = useState<HomeRoutineChildDragState | null>(null);
  const [routineChildDropTarget, setRoutineChildDropTarget] = useState<HomeRoutineChildDropTarget | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const newTaskInputRef = useRef<HTMLInputElement | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);
  const rowActionMenuRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPointerRef = useRef<HomeGearLongPressPointer | null>(null);
  const suppressGearClickRef = useRef(false);
  const suppressGearClickResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const routineSectionRenameCanceledRef = useRef(false);
  const routineChildDragStateRef = useRef<HomeRoutineChildDragState | null>(null);
  const routineChildDropTargetRef = useRef<HomeRoutineChildDropTarget | null>(null);
  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (suppressGearClickResetTimerRef.current) clearTimeout(suppressGearClickResetTimerRef.current);
  }, []);

  const reconciledTaskIds = useMemo(
    () => reconcileHomeTodoTaskIds(state.taskIds, tasks),
    [state.taskIds, tasks],
  );
  const todoTasks = useMemo(
    () => reconciledTaskIds.map((taskId) => taskById.get(taskId)).filter((task): task is Task => Boolean(task)),
    [reconciledTaskIds, taskById],
  );
  const routineTaskIds = useMemo(
    () => getHomeRoutineTaskIds(tasks, listMembershipsByTaskId, manualMembershipsByTaskId),
    [listMembershipsByTaskId, manualMembershipsByTaskId, tasks],
  );
  const reconciledRoutineTaskIds = useMemo(
    () => reconcileHomeRoutineTaskIds(state.routineTaskIds, routineTaskIds),
    [routineTaskIds, state.routineTaskIds],
  );
  const routineGroups = useMemo(
    () => buildHomeRoutineGroups(reconciledRoutineTaskIds, tasks),
    [reconciledRoutineTaskIds, tasks],
  );
  const routineTasks = useMemo(
    () => routineGroups.flatMap((group) => group.tasks.map(({ task }) => task)),
    [routineGroups],
  );
  const routineTaskIdSet = useMemo(() => new Set(routineTasks.map((task) => task.id)), [routineTasks]);
  const normalizedNewTaskTagDraft = normalizeTaskTagValue(newTaskTagDraft);
  const selectedNewTaskTagSet = new Set(newTaskTags.map((tag) => normalizeTaskTagValue(tag)));
  const dedupedNewTaskTagOptions = dedupeTaskTagLabels(allTags);
  const availableNewTaskTagOptions = dedupedNewTaskTagOptions
    .filter((tag) => !selectedNewTaskTagSet.has(normalizeTaskTagValue(tag)))
    .filter((tag) => !normalizedNewTaskTagDraft || normalizeTaskTagValue(tag).includes(normalizedNewTaskTagDraft));
  const exactNewTaskTagMatch = dedupedNewTaskTagOptions.find((tag) => normalizeTaskTagValue(tag) === normalizedNewTaskTagDraft) ?? null;
  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const selected = activeHomeTab === "todo" ? new Set(reconciledTaskIds) : routineTaskIdSet;
    return sortHomeTodoSearchResults(tasks
      .filter((task) => !selected.has(task.id) && isHomeTodoTaskEligible(task, tasks, taskById))
      .map((task) => {
        const hierarchy = buildHomeTodoHierarchy(task, tasks, taskById);
        const searchable = getHomeTodoSearchText(task, hierarchy, listMembershipsByTaskId[task.id] ?? []);
        return { hierarchy, searchable, task };
      })
      .filter((item) => item.searchable.includes(needle)));
  }, [activeHomeTab, listMembershipsByTaskId, query, reconciledTaskIds, routineTaskIdSet, taskById, tasks]);

  const { laterTaskIds, sections: daySections } = useMemo(
    () => buildHomeTodoDaySections(todoTasks.map((task) => task.id), state.tasksPerDay, new Date(calendarNowMs), calendarTimeZone, state.taskDayOffsets),
    [calendarNowMs, calendarTimeZone, state.taskDayOffsets, state.tasksPerDay, todoTasks],
  );
  const routineSections = useMemo(
    () => buildHomeRoutineSections(reconciledRoutineTaskIds, state.routinesPerSection, state.routineSectionNames),
    [reconciledRoutineTaskIds, state.routineSectionNames, state.routinesPerSection],
  );
  const dayTaskIds = daySections.flatMap((section) => section.taskIds);
  const sevenDayCapacity = dayTaskIds.length;
  const dayTasks = dayTaskIds.map((taskId) => taskById.get(taskId)).filter((task): task is Task => Boolean(task));
  const doLaterTasks = laterTaskIds.map((taskId) => taskById.get(taskId)).filter((task): task is Task => Boolean(task));
  const visibleTasks = isDoLaterOpen ? [...dayTasks, ...doLaterTasks] : dayTasks;

  useEffect(() => {
    if (isCreateOpen) newTaskInputRef.current?.focus();
  }, [isCreateOpen]);

  useEffect(() => {
    if (!tasks.length || !shouldPersistHomeRoutineReconciliation(syncStatus)) return;
    updateRoutineTaskIds((currentRoutineTaskIds) => reconcileHomeRoutineTaskIds(currentRoutineTaskIds, routineTaskIds));
  }, [routineTaskIds, syncStatus, tasks.length, updateRoutineTaskIds]);

  function selectHomeTab(nextTab: HomePanelTab) {
    setActiveHomeTab(nextTab);
    setIsSearchOpen(false);
    setRowActionMenu(null);
    setIsFastActionMode(false);
    setIsSettingsOpen(false);
  }

  function clearGearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function scheduleGearClickSuppressionReset() {
    if (suppressGearClickResetTimerRef.current) clearTimeout(suppressGearClickResetTimerRef.current);
    suppressGearClickResetTimerRef.current = setTimeout(() => {
      clearGearClickSuppression();
    }, HOME_GEAR_LONG_PRESS_MS * 2);
  }

  function clearGearClickSuppression() {
    suppressGearClickRef.current = false;
    if (suppressGearClickResetTimerRef.current) {
      clearTimeout(suppressGearClickResetTimerRef.current);
      suppressGearClickResetTimerRef.current = null;
    }
  }

  function beginGearLongPress(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearGearLongPressTimer();
    const pending: HomeGearLongPressPointer = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      triggered: false,
    };
    longPressPointerRef.current = pending;
    event.currentTarget.setPointerCapture(event.pointerId);
    longPressTimerRef.current = setTimeout(() => {
      if (longPressPointerRef.current !== pending) return;
      pending.triggered = true;
      setIsFastActionMode(true);
      setRowActionMenu(null);
      suppressGearClickRef.current = true;
      scheduleGearClickSuppressionReset();
      longPressTimerRef.current = null;
    }, HOME_GEAR_LONG_PRESS_MS);
  }

  function cancelGearLongPress(event: ReactPointerEvent<HTMLButtonElement>, suppressClick = false) {
    const pending = longPressPointerRef.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    clearGearLongPressTimer();
    if (pending.triggered && suppressClick) {
      suppressGearClickRef.current = true;
      scheduleGearClickSuppressionReset();
    }
    longPressPointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleGearLongPressMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const pending = longPressPointerRef.current;
    if (!pending || pending.pointerId !== event.pointerId || pending.triggered) return;
    const movedX = event.clientX - pending.startX;
    const movedY = event.clientY - pending.startY;
    if (Math.hypot(movedX, movedY) > HOME_GEAR_LONG_PRESS_MOVE_PX) {
      clearGearLongPressTimer();
      longPressPointerRef.current = null;
    }
  }

  function handleGearClick(taskId: string, event: ReactMouseEvent<HTMLButtonElement>) {
    if (suppressGearClickRef.current) {
      clearGearClickSuppression();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setRowActionMenu((current) => current?.taskId === taskId ? null : { taskId, view: "actions" });
  }

  function handleFastActionClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressGearClickRef.current) return;
    clearGearClickSuppression();
    event.preventDefault();
    event.stopPropagation();
  }

  function selectNewTaskRepeatFrequency(nextFrequency: TaskRepeatFrequency) {
    setNewTaskRepeatFrequency(nextFrequency);
    setNewTaskRepeatInterval((current) => String(parsePositiveInteger(current) ?? 1));
    if (nextFrequency !== "weekly" && nextFrequency !== "custom") {
      setNewTaskRepeatDaysOfWeek([]);
    }
    if (nextFrequency !== "monthly") {
      setNewTaskRepeatDayOfMonth("");
      setNewTaskRepeatMonthlyMode("day_of_month");
      setNewTaskRepeatMonthlyOrdinal(null);
      setNewTaskRepeatMonthlyWeekday(null);
    }
  }

  function applyNewTaskWeekdaysPreset() {
    setNewTaskRepeatFrequency("weekly");
    setNewTaskRepeatInterval("1");
    setNewTaskRepeatDaysOfWeek([...WEEKDAYS_REPEAT_DAYS]);
    setNewTaskRepeatDayOfMonth("");
    setNewTaskRepeatMonthlyMode("day_of_month");
    setNewTaskRepeatMonthlyOrdinal(null);
    setNewTaskRepeatMonthlyWeekday(null);
  }

  function addNewTaskTag(rawTag: string) {
    const normalizedTag = formatNewTaskTagLabel(rawTag);
    if (!normalizedTag) return;
    setNewTaskTags((current) => dedupeTaskTagLabels([...current, normalizedTag]));
    setNewTaskTagDraft("");
  }

  function removeNewTaskTag(tagToRemove: string) {
    const normalizedTagToRemove = normalizeTaskTagValue(tagToRemove);
    setNewTaskTags((current) => current.filter((tag) => normalizeTaskTagValue(tag) !== normalizedTagToRemove));
  }

  function buildNewTaskMetadata(): HomeTodoTaskMetadata {
    const repeatInterval = parsePositiveInteger(newTaskRepeatInterval) ?? 1;
    const repeatDayOfMonth = newTaskRepeatFrequency === "monthly" && newTaskRepeatMonthlyMode === "day_of_month"
      ? parseDayOfMonth(newTaskRepeatDayOfMonth)
      : null;
    const isMonthlyOrdinal = newTaskRepeatFrequency === "monthly" && newTaskRepeatMonthlyMode === "ordinal_weekday";
    return {
      due_on: newTaskDueOn || null,
      due_time: newTaskDueOn ? (newTaskDueTime || null) : null,
      priority_level: Number.parseInt(newTaskPriority, 10) as TaskPriorityLevel,
      repeat_day_of_month: repeatDayOfMonth,
      repeat_days_of_week: newTaskRepeatFrequency === "weekly" || newTaskRepeatFrequency === "custom"
        ? [...newTaskRepeatDaysOfWeek]
        : [],
      repeat_frequency: newTaskRepeatFrequency,
      repeat_interval: repeatInterval,
      repeat_monthly_mode: newTaskRepeatFrequency === "monthly" ? newTaskRepeatMonthlyMode : "day_of_month",
      repeat_monthly_ordinal: isMonthlyOrdinal ? (newTaskRepeatMonthlyOrdinal ?? "first") : null,
      repeat_monthly_weekday: isMonthlyOrdinal ? (newTaskRepeatMonthlyWeekday ?? 1) : null,
      tags: [...newTaskTags],
    };
  }

  function resetNewTaskComposer() {
    setNewTaskTitle("");
    setNewTaskTypeSelection("task");
    setNewTaskDueOn("");
    setNewTaskDueTime("");
    setNewTaskRepeatFrequency("none");
    setNewTaskRepeatInterval("1");
    setNewTaskRepeatDaysOfWeek([]);
    setNewTaskRepeatDayOfMonth("");
    setNewTaskRepeatMonthlyMode("day_of_month");
    setNewTaskRepeatMonthlyOrdinal(null);
    setNewTaskRepeatMonthlyWeekday(null);
    setNewTaskTags([]);
    setNewTaskTagDraft("");
    setNewTaskPriority("0");
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isCreating) return;

    setIsCreating(true);
    try {
      const createdTask = await createHomeTodoTask(
        newTaskTitle,
        newTaskTypeSelection,
        onCreateTaskWithType,
        activeHomeTab === "todo"
          ? (taskId) => updateTaskIds((taskIds) => [...taskIds, taskId])
          : () => {},
        buildNewTaskMetadata(),
      );
      if (createdTask) {
        if (activeHomeTab === "routine") {
          await onSetRoutineMembership(createdTask.id, true);
        }
        resetNewTaskComposer();
        setIsCreateOpen(false);
      }
    } finally {
      setIsCreating(false);
    }
  }

  function cancelCreateTask() {
    if (isCreating) return;
    resetNewTaskComposer();
    setIsCreateOpen(false);
  }

  async function addSearchResult(taskId: string) {
    if (activeHomeTab === "routine") {
      const enabled = await onSetRoutineMembership(taskId, true);
      if (enabled) {
        setQuery("");
        setIsSearchOpen(false);
      }
      return;
    }
    updateTaskIds((taskIds) => [...taskIds, taskId]);
  }

  useEffect(() => {
    if (!statusMenuTaskId) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!statusMenuRef.current?.contains(event.target as Node)) setStatusMenuTaskId(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStatusMenuTaskId(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [statusMenuTaskId]);

  useEffect(() => {
    if (!rowActionMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rowActionMenuRef.current?.contains(event.target as Node)) setRowActionMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setRowActionMenu(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [rowActionMenu]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!settingsMenuRef.current?.contains(event.target as Node)) setIsSettingsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSettingsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen]);

  function renderDaySectionHeader(section: typeof daySections[number]) {
    return (
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#ece8f8] pt-4 first:mt-3 first:border-t-0 dark:border-white/10" data-sortable-drop-id={`day-${section.dayIndex}`} data-sortable-drop-index={section.startIndex} key={`home-day-${section.dayIndex}`}>
        <div>
          <h2 className="text-sm font-bold text-[#4d466d] dark:text-white/85">{section.label}</h2>
          <p className="mt-0.5 text-xs text-[#9a92b1] dark:text-white/42">
            {section.taskIds.length ? `${section.taskIds.length} task${section.taskIds.length === 1 ? "" : "s"}` : "Empty"}
          </p>
        </div>
      </div>
    );
  }

  function renderLaterSectionHeader() {
    return (
      <section className="mt-5 border-t border-[#ece8f8] pt-4 dark:border-white/10" data-sortable-drop-id="later" data-sortable-drop-index={sevenDayCapacity}>
        <AdhdChip
          aria-expanded={isDoLaterOpen}
          contentClassName="gap-1.5"
          icon={<ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${isDoLaterOpen ? "rotate-180" : ""}`} />}
          onClick={() => setIsDoLaterOpen((current) => !current)}
        >
          Later ({doLaterTasks.length})
        </AdhdChip>
      </section>
    );
  }

  function getDayOffsetForInsertion(index: number) {
    if (index >= sevenDayCapacity) return 7;
    return daySections.reduce((dayOffset, section) => section.startIndex <= index ? section.dayIndex : dayOffset, 0);
  }

  function beginRoutineSectionRename(section: typeof routineSections[number]) {
    routineSectionRenameCanceledRef.current = false;
    setRoutineSectionNameDraft(state.routineSectionNames[String(section.sectionIndex)] ?? section.label);
    setEditingRoutineSectionIndex(section.sectionIndex);
  }

  function saveRoutineSectionName(sectionIndex: number) {
    if (routineSectionRenameCanceledRef.current) {
      routineSectionRenameCanceledRef.current = false;
      return;
    }
    updateRoutineSectionName(sectionIndex, routineSectionNameDraft);
    setEditingRoutineSectionIndex(null);
  }

  function renderRoutineSectionHeader(section: typeof routineSections[number]) {
    const isEditing = editingRoutineSectionIndex === section.sectionIndex;
    return (
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#ece8f8] pt-4 first:mt-3 first:border-t-0 dark:border-white/10" data-sortable-drop-id={`routine-section-${section.sectionIndex}`} data-sortable-drop-index={section.startIndex} key={`home-routine-section-${section.sectionIndex}`}>
        <div>
          <div className="flex min-w-0 items-center gap-1">
            {isEditing ? (
              <input
                aria-label={`Rename ${section.label}`}
                autoFocus
                className="health-input h-7 min-w-0 w-[min(14rem,60vw)] px-2 py-1 text-sm font-bold"
                onBlur={() => saveRoutineSectionName(section.sectionIndex)}
                onChange={(event) => setRoutineSectionNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveRoutineSectionName(section.sectionIndex);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    routineSectionRenameCanceledRef.current = true;
                    setEditingRoutineSectionIndex(null);
                  }
                }}
                value={routineSectionNameDraft}
              />
            ) : (
              <>
                <h2 className="text-sm font-bold text-[#4d466d] dark:text-white/85">{section.label}</h2>
                <AdhdIconButton
                  aria-label={`Rename ${section.label}`}
                  className="h-6 w-6"
                  iconClassName="h-3.5 w-3.5"
                  onClick={() => beginRoutineSectionRename(section)}
                  size="sm"
                  title={`Rename ${section.label}`}
                  tone="ghost"
                >
                  <Pencil aria-hidden="true" />
                </AdhdIconButton>
              </>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[#9a92b1] dark:text-white/42">
            {section.groupIds.length} routine group{section.groupIds.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    );
  }

  function clearRoutineChildDragState() {
    routineChildDragStateRef.current = null;
    routineChildDropTargetRef.current = null;
    setRoutineChildDragState(null);
    setRoutineChildDropTarget(null);
  }

  function beginRoutineChildDrag(event: DragEvent<HTMLElement>, task: Task, depth: number) {
    event.stopPropagation();
    if (!task.parent_task_id) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
    const nextDragState = {
      depth,
      parentTaskId: task.parent_task_id,
      taskId: task.id,
    };
    routineChildDragStateRef.current = nextDragState;
    routineChildDropTargetRef.current = null;
    setRoutineChildDragState(nextDragState);
    setRoutineChildDropTarget(null);
  }

  function getRoutineChildDropPlacement(event: DragEvent<HTMLElement>): TaskSiblingDropPlacement {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY - rect.top < rect.height / 2 ? "before" : "after";
  }

  function canDropRoutineChildOnTask(task: Task, depth: number) {
    const dragState = routineChildDragStateRef.current;
    return Boolean(
      dragState
      && dragState.taskId !== task.id
      && dragState.parentTaskId === task.parent_task_id
      && dragState.depth === depth,
    );
  }

  function updateRoutineChildDropTarget(event: DragEvent<HTMLElement>, task: Task, depth: number) {
    if (!routineChildDragStateRef.current) return;
    event.stopPropagation();
    if (!canDropRoutineChildOnTask(task, depth)) {
      if (routineChildDropTargetRef.current) {
        routineChildDropTargetRef.current = null;
        setRoutineChildDropTarget(null);
      }
      return;
    }

    event.preventDefault();
    const placement = getRoutineChildDropPlacement(event);
    const currentDropTarget = routineChildDropTargetRef.current;
    if (currentDropTarget?.taskId !== task.id || currentDropTarget.placement !== placement) {
      const nextDropTarget = { placement, taskId: task.id };
      routineChildDropTargetRef.current = nextDropTarget;
      setRoutineChildDropTarget(nextDropTarget);
    }
  }

  function dropRoutineChildOnTask(event: DragEvent<HTMLElement>, task: Task, depth: number) {
    const dragState = routineChildDragStateRef.current;
    event.stopPropagation();
    if (!dragState || !canDropRoutineChildOnTask(task, depth)) {
      clearRoutineChildDragState();
      return;
    }

    event.preventDefault();
    onReorderChildTask(dragState.taskId, {
      placement: getRoutineChildDropPlacement(event),
      targetTaskId: task.id,
    });
    clearRoutineChildDragState();
  }

  function getRoutineChildDropIndicatorClassName(taskId: string) {
    if (routineChildDropTarget?.taskId !== taskId) return "";
    return routineChildDropTarget.placement === "before"
      ? "shadow-[inset_0_2px_0_0_rgba(111,87,246,0.95)]"
      : "shadow-[inset_0_-2px_0_0_rgba(111,87,246,0.95)]";
  }

  function renderHomeTask(
    task: Task,
    index: number,
    handle: ReactNode,
    mode: HomePanelTab,
    rowKey?: string,
    routineDepth = 0,
    isRoutineGroupAnchor = false,
  ) {
    const isRoutine = mode === "routine";
    const isRoutineChild = isRoutine && !isRoutineGroupAnchor;
    const hierarchy = buildHomeTodoHierarchy(task, tasks, taskById);
    const displayStatus = taskDisplayStatusByTaskId[task.id] ?? task.status;
    const statusMenuOpen = statusMenuTaskId === task.id;
    const fastActionOpen = isFastActionMode;
    const rowActionMenuOpen = rowActionMenu?.taskId === task.id;
    const rowActionMenuView = rowActionMenuOpen ? rowActionMenu.view : "actions";
    const durableTaskIndex = state.taskIds.indexOf(task.id);
    const renderedDayOffset = daySections.find((section) => section.taskIds.includes(task.id))?.dayIndex
      ?? (laterTaskIds.includes(task.id) ? 7 : null);
    const moveDayDestinations = [
      ...daySections.map((section) => ({
        dayOffset: section.dayIndex,
        isFull: section.taskIds.length >= state.tasksPerDay,
        label: section.label,
      })),
      { dayOffset: 7, isFull: false, label: "Later" },
    ];
    const isAtAbsoluteTop = !isRoutine && durableTaskIndex === 0 && renderedDayOffset === 0;
    const isAtAbsoluteBottom = !isRoutine && durableTaskIndex === state.taskIds.length - 1 && renderedDayOffset === 7;
    const isAtRoutineTop = isRoutine && index === 0;
    const isAtRoutineBottom = isRoutine && index === routineGroups.length - 1;
    return (
      <AdhdCard
        key={rowKey}
        className={`${isRoutineChild
          ? "grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-0"
          : "grid min-w-0 grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] items-center gap-x-0"}${isRoutineChild && routineChildDragState?.taskId === task.id ? " opacity-60" : ""}${isRoutineChild ? ` ${getRoutineChildDropIndicatorClassName(task.id)}` : ""}`}
        padding="sm"
        onDragOver={isRoutineChild ? (event) => updateRoutineChildDropTarget(event, task, routineDepth) : undefined}
        onDrop={isRoutineChild ? (event) => dropRoutineChildOnTask(event, task, routineDepth) : undefined}
        style={isRoutineChild ? { marginLeft: `${Math.min(Math.max(routineDepth, 1), 3) * 0.75}rem` } : undefined}
      >
        {!isRoutineChild ? <span className="max-sm:-ml-3 sm:-ml-2 shrink-0">{handle}</span> : null}
        {isRoutineChild ? (
          <button
            aria-label={`Drag to reorder ${routineDepth > 1 ? "substep" : "step"} ${task.title || "Untitled"}`}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8a79d6] opacity-70 transition hover:bg-[#f3efff] hover:text-[#6f57f6] hover:opacity-100 dark:text-[#b6a9ec] dark:hover:bg-[#22193f] dark:hover:text-[#cabfff]"
            draggable
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onDragEnd={clearRoutineChildDragState}
            onDragStart={(event) => beginRoutineChildDrag(event, task, routineDepth)}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <GripVertical aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {!isRoutineChild ? (
          <span className="ml-1 shrink-0 text-sm font-medium leading-5 text-[#26324f] dark:text-white">
            {index + 1}
          </span>
        ) : null}
        <div className="relative ml-2 flex h-8 w-8 shrink-0 items-center justify-center" ref={statusMenuOpen ? statusMenuRef : undefined}>
          <button
            aria-expanded={statusMenuOpen}
            aria-label={`Change status: ${formatTaskStatusLabel(displayStatus)}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full"
            onClick={() => setStatusMenuTaskId((current) => current === task.id ? null : task.id)}
            type="button"
          >
            {renderTaskStatusCircle(displayStatus, "sm", { className: "!h-7 !w-7", glyphClassName: "!h-4 !w-4 !text-sm" })}
          </button>
          {statusMenuOpen ? (
            <div className="absolute left-0 top-full z-30 mt-2 rounded-full border border-[#e4def2] bg-white p-1 shadow-lg dark:border-white/15 dark:bg-[#201a35]">
              <TaskStatusCircleRail
                currentStatus={displayStatus}
                onSetStatus={(status) => {
                  onSetStatus(task, status);
                  setStatusMenuTaskId(null);
                }}
                options={resolveTaskStatusOptionsForTask({
                  behaviorPolicyRevisions,
                  behaviorProfiles,
                  behaviorSelectionsByTaskId,
                  customRulesetId: task.custom_ruleset_id,
                  logicalDate: behaviorPolicyLogicalDate,
                  namedCustomRulesetBehaviorPolicyRevisions,
                  policyLoading: behaviorPolicyLoading,
                  statuses: getSelectableTaskStatusesForTask({ dueOn: task.due_on, repeatFrequency: task.repeat_frequency, status: displayStatus }),
                  taskId: task.id,
                  taskType: task.task_type,
                }).map((status) => ({ label: formatTaskStatusLabel(status), value: status }))}
                preserveCurrentStatus
                statusLabelPrefix="Set task status to"
                wrap={false}
              />
            </div>
          ) : null}
        </div>
        <div className="ml-2 min-w-0">
          {isRoutine ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <button className="block min-w-0 max-w-full text-left" onClick={() => onOpenTask(task.id)} type="button">
                <p className={`break-words leading-5 ${HOME_TODO_TITLE_CLASS}`}>
                  {task.title || "Untitled task"}
                </p>
              </button>
              <RoutineTaskMetadata task={task} streakSummary={taskHistoryStreakSummaries[task.id]} />
            </div>
          ) : (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <button className="block min-w-0 max-w-full text-left" onClick={() => onOpenTask(task.id)} type="button">
                <p className={`break-words leading-5 ${HOME_TODO_TITLE_CLASS}`}>
                  {task.title || "Untitled task"}
                </p>
              </button>
              <HomeTodoTaskSignals
                attentionReason={taskAttentionReasonByTaskId[task.id]}
                task={task}
                streakSummary={taskHistoryStreakSummaries[task.id]}
              />
            </div>
          )}
          {hierarchy.length ? (
            <p className="mt-1 break-words text-xs leading-5 text-[#837b9e] dark:text-white/48">{hierarchy.join(" › ")}</p>
          ) : null}
        </div>
        {!isRoutineChild ? (
          <div className="relative flex shrink-0 items-center gap-1" ref={rowActionMenuOpen ? rowActionMenuRef : undefined}>
            {fastActionOpen ? (
              <div className="flex shrink-0 items-center gap-0.5" onClickCapture={handleFastActionClickCapture}>
                {!isRoutine ? (
                  <AdhdIconButton
                    aria-expanded={rowActionMenuOpen && rowActionMenuView === "move-day"}
                    aria-haspopup="menu"
                    aria-label={`Move ${task.title || "Untitled task"} to day`}
                    className={HOME_TODO_ACTION_CLASS}
                    iconClassName={HOME_TODO_ACTION_ICON_CLASS}
                    onClick={() => setRowActionMenu({ taskId: task.id, view: "move-day" })}
                    selected={rowActionMenuOpen && rowActionMenuView === "move-day"}
                    size="sm"
                    title="Move to day"
                  >
                    <CalendarDays aria-hidden="true" />
                  </AdhdIconButton>
                ) : null}
                {!isRoutine && !isAtAbsoluteTop ? (
                  <AdhdIconButton
                    aria-label={`Move ${task.title || "Untitled task"} to Top`}
                    className={HOME_TODO_ACTION_CLASS}
                    iconClassName={HOME_TODO_ACTION_ICON_CLASS}
                    onClick={() => {
                      updateTaskIds((taskIds) => moveHomeTodoTaskIdToEdge(taskIds, task.id, "top"));
                      updateTaskDayOffset(task.id, 0);
                      setRowActionMenu(null);
                    }}
                    size="sm"
                    title="Move task to Top"
                  >
                    <ArrowUpToLine aria-hidden="true" />
                  </AdhdIconButton>
                ) : null}
                {!isRoutine && !isAtAbsoluteBottom ? (
                  <AdhdIconButton
                    aria-label={`Move ${task.title || "Untitled task"} to Bottom`}
                    className={HOME_TODO_ACTION_CLASS}
                    iconClassName={HOME_TODO_ACTION_ICON_CLASS}
                    onClick={() => {
                      updateTaskIds((taskIds) => moveHomeTodoTaskIdToEdge(taskIds, task.id, "bottom"));
                      updateTaskDayOffset(task.id, 7);
                      setRowActionMenu(null);
                    }}
                    size="sm"
                    title="Move task to Bottom"
                  >
                    <ArrowDownToLine aria-hidden="true" />
                  </AdhdIconButton>
                ) : null}
                {isRoutine && !isAtRoutineTop ? (
                  <AdhdIconButton
                    aria-label={`Move ${task.title || "Untitled task"} to Top`}
                    className={HOME_TODO_ACTION_CLASS}
                    iconClassName={HOME_TODO_ACTION_ICON_CLASS}
                    onClick={() => {
                      updateRoutineTaskIds((taskIds) => moveHomeTodoTaskIdToEdge(taskIds, task.id, "top"));
                      setRowActionMenu(null);
                    }}
                    size="sm"
                    title="Move task to Top"
                  >
                    <ArrowUpToLine aria-hidden="true" />
                  </AdhdIconButton>
                ) : null}
                {isRoutine && !isAtRoutineBottom ? (
                  <AdhdIconButton
                    aria-label={`Move ${task.title || "Untitled task"} to Bottom`}
                    className={HOME_TODO_ACTION_CLASS}
                    iconClassName={HOME_TODO_ACTION_ICON_CLASS}
                    onClick={() => {
                      updateRoutineTaskIds((taskIds) => moveHomeTodoTaskIdToEdge(taskIds, task.id, "bottom"));
                      setRowActionMenu(null);
                    }}
                    size="sm"
                    title="Move task to Bottom"
                  >
                    <ArrowDownToLine aria-hidden="true" />
                  </AdhdIconButton>
                ) : null}
                <AdhdIconButton
                  aria-label={`Remove ${task.title || "Untitled task"} from ${isRoutine ? "Routine" : "Home To-do"}`}
                  className={HOME_TODO_ACTION_CLASS}
                  iconClassName={HOME_TODO_ACTION_ICON_CLASS}
                  onClick={() => {
                    setRowActionMenu(null);
                    if (isRoutine) {
                      void onSetRoutineMembership(task.id, false);
                    } else {
                      updateTaskIds((taskIds) => taskIds.filter((taskId) => taskId !== task.id));
                    }
                  }}
                  size="sm"
                  title={isRoutine ? "Remove from Routine" : "Remove from Home To-do"}
                  tone="danger"
                >
                  <Minus aria-hidden="true" />
                </AdhdIconButton>
                <AdhdIconButton
                  aria-label={`Collapse actions for ${task.title || "Untitled task"}`}
                  className={HOME_TODO_ACTION_CLASS}
                  iconClassName={HOME_TODO_ACTION_ICON_CLASS}
                  onClick={() => {
                    setIsFastActionMode(false);
                    setRowActionMenu(null);
                  }}
                  size="sm"
                  title="Collapse actions"
                >
                  <ChevronDown aria-hidden="true" className="rotate-180" />
                </AdhdIconButton>
              </div>
            ) : (
              <AdhdIconButton
                aria-expanded={rowActionMenuOpen}
                aria-haspopup="menu"
                aria-label={`${rowActionMenuOpen ? "Close" : "Open"} actions for ${task.title || "Untitled task"}`}
                className={HOME_TODO_ACTION_CLASS}
                iconClassName={HOME_TODO_ACTION_ICON_CLASS}
                onClick={(event) => handleGearClick(task.id, event)}
                onPointerCancel={(event) => cancelGearLongPress(event)}
                onPointerDown={beginGearLongPress}
                onPointerMove={handleGearLongPressMove}
                onPointerUp={(event) => cancelGearLongPress(event, true)}
                selected={rowActionMenuOpen}
                size="sm"
                title="Task actions"
              >
                <Settings2 aria-hidden="true" />
              </AdhdIconButton>
            )}
            {rowActionMenuOpen ? (
              <AdhdDropdownPanel
                aria-label={rowActionMenuView === "move-day" ? `Move ${task.title || "Untitled task"} to day` : `${task.title || "Untitled task"} actions`}
                className="left-auto right-0 top-[calc(100%+0.35rem)] max-h-80 overflow-y-auto p-1.5"
                role="menu"
                widthClassName="min-w-56"
              >
                {rowActionMenuView === "move-day" ? (
                  <div className="grid gap-1">
                    {moveDayDestinations.map((destination) => {
                      const isCurrentDestination = renderedDayOffset === destination.dayOffset;
                      const disabled = isCurrentDestination || destination.isFull;
                      return (
                        <button
                          aria-checked={isCurrentDestination}
                          aria-label={`${destination.label}${isCurrentDestination ? ", current destination" : destination.isFull ? ", full" : ""}`}
                          className="flex min-h-9 items-center justify-between gap-3 rounded-[0.7rem] px-3 py-2 text-left text-sm font-semibold text-[#3c4966] hover:bg-[#f7f3ff] disabled:cursor-not-allowed disabled:opacity-45 dark:text-white/75 dark:hover:bg-white/[0.08]"
                          disabled={disabled}
                          key={destination.dayOffset}
                          onClick={() => {
                            if (disabled) return;
                            updateTaskDayOffset(task.id, destination.dayOffset);
                            setRowActionMenu(null);
                          }}
                          role="menuitemradio"
                          type="button"
                        >
                          <span>{destination.label}</span>
                          {isCurrentDestination ? <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-[#6f57f6]">Current</span> : destination.isFull ? <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-[#9a92b1]">Full</span> : null}
                        </button>
                      );
                    })}
                    <button
                      aria-label="Back to task actions"
                      className="flex min-h-9 items-center rounded-[0.7rem] px-3 py-2 text-left text-sm font-semibold text-[#6f57f6] hover:bg-[#f7f3ff] dark:text-[#cabfff] dark:hover:bg-white/[0.08]"
                      onClick={() => setRowActionMenu({ taskId: task.id, view: "actions" })}
                      role="menuitem"
                      type="button"
                    >
                      Back
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-1">
                    {!isRoutine ? (
                      <button
                        aria-label={`Move ${task.title || "Untitled task"} to day`}
                        className="flex min-h-9 items-center gap-2 rounded-[0.7rem] px-3 py-2 text-left text-sm font-semibold text-[#3c4966] hover:bg-[#f7f3ff] dark:text-white/75 dark:hover:bg-white/[0.08]"
                        onClick={() => setRowActionMenu({ taskId: task.id, view: "move-day" })}
                        role="menuitem"
                        type="button"
                      >
                        <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        Move to day
                      </button>
                    ) : null}
                    {!isRoutine && !isAtAbsoluteTop ? (
                      <button
                        aria-label={`Move ${task.title || "Untitled task"} to Top`}
                        className="flex min-h-9 items-center gap-2 rounded-[0.7rem] px-3 py-2 text-left text-sm font-semibold text-[#3c4966] hover:bg-[#f7f3ff] dark:text-white/75 dark:hover:bg-white/[0.08]"
                        onClick={() => {
                          updateTaskIds((taskIds) => moveHomeTodoTaskIdToEdge(taskIds, task.id, "top"));
                          updateTaskDayOffset(task.id, 0);
                          setRowActionMenu(null);
                        }}
                        role="menuitem"
                        type="button"
                      >
                        <ArrowUpToLine aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        Move to Top
                      </button>
                    ) : null}
                    {!isRoutine && !isAtAbsoluteBottom ? (
                      <button
                        aria-label={`Move ${task.title || "Untitled task"} to Bottom`}
                        className="flex min-h-9 items-center gap-2 rounded-[0.7rem] px-3 py-2 text-left text-sm font-semibold text-[#3c4966] hover:bg-[#f7f3ff] dark:text-white/75 dark:hover:bg-white/[0.08]"
                        onClick={() => {
                          updateTaskIds((taskIds) => moveHomeTodoTaskIdToEdge(taskIds, task.id, "bottom"));
                          updateTaskDayOffset(task.id, 7);
                          setRowActionMenu(null);
                        }}
                        role="menuitem"
                        type="button"
                      >
                        <ArrowDownToLine aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        Move to Bottom
                      </button>
                    ) : null}
                    {isRoutine && !isAtRoutineTop ? (
                      <button
                        aria-label={`Move ${task.title || "Untitled task"} to Top`}
                        className="flex min-h-9 items-center gap-2 rounded-[0.7rem] px-3 py-2 text-left text-sm font-semibold text-[#3c4966] hover:bg-[#f7f3ff] dark:text-white/75 dark:hover:bg-white/[0.08]"
                        onClick={() => {
                          updateRoutineTaskIds((taskIds) => moveHomeTodoTaskIdToEdge(taskIds, task.id, "top"));
                          setRowActionMenu(null);
                        }}
                        role="menuitem"
                        type="button"
                      >
                        <ArrowUpToLine aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        Move to Top
                      </button>
                    ) : null}
                    {isRoutine && !isAtRoutineBottom ? (
                      <button
                        aria-label={`Move ${task.title || "Untitled task"} to Bottom`}
                        className="flex min-h-9 items-center gap-2 rounded-[0.7rem] px-3 py-2 text-left text-sm font-semibold text-[#3c4966] hover:bg-[#f7f3ff] dark:text-white/75 dark:hover:bg-white/[0.08]"
                        onClick={() => {
                          updateRoutineTaskIds((taskIds) => moveHomeTodoTaskIdToEdge(taskIds, task.id, "bottom"));
                          setRowActionMenu(null);
                        }}
                        role="menuitem"
                        type="button"
                      >
                        <ArrowDownToLine aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        Move to Bottom
                      </button>
                    ) : null}
                    <button
                      aria-label={`Remove ${task.title || "Untitled task"} from ${isRoutine ? "Routine" : "Home To-do"}`}
                      className="flex min-h-9 items-center gap-2 rounded-[0.7rem] px-3 py-2 text-left text-sm font-semibold text-[#d65775] hover:bg-[#fff1f3] dark:text-[#ffb0c1] dark:hover:bg-[#32161d]"
                      onClick={() => {
                        setRowActionMenu(null);
                        if (isRoutine) {
                          void onSetRoutineMembership(task.id, false);
                        } else {
                          updateTaskIds((taskIds) => taskIds.filter((taskId) => taskId !== task.id));
                        }
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <Minus aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      {isRoutine ? "Remove from Routine" : "Remove from Home To-do"}
                    </button>
                  </div>
                )}
              </AdhdDropdownPanel>
            ) : null}
          </div>
        ) : null}
      </AdhdCard>
    );
  }

  useEffect(() => {
    if (!isSearchOpen) return;
    function closeSearch(event: PointerEvent) {
      if (!searchRef.current?.contains(event.target as Node)) setIsSearchOpen(false);
    }
    function closeSearchOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsSearchOpen(false);
    }
    window.addEventListener("pointerdown", closeSearch);
    window.addEventListener("keydown", closeSearchOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeSearch);
      window.removeEventListener("keydown", closeSearchOnEscape);
    };
  }, [isSearchOpen]);

  return (
    <section className={`-mx-[15px] w-auto px-3 pb-32 pt-6 sm:mx-auto sm:px-4 ${layout.isCanonical ? "max-w-4xl" : "max-w-none"}`}>
      <PageShellHeader actions={<PageShellLayoutControls layout={layout} />} subtitle="Daily workspace" title="Home" />
      <HomeProgressDashboard
        dailyProgress={dailyProgress}
        homeRecordChases={homeRecordChases}
        isTaskHistoryLoaded={isTaskHistoryLoaded}
        onOpenRecord={onOpenRecord}
        recordTargetsError={recordTargetsError}
        recordTargetsLoading={recordTargetsLoading}
        recordTargetsRecalculatedAt={recordTargetsRecalculatedAt}
        recordTargetsSettingsMismatch={recordTargetsSettingsMismatch}
      />
      <ReorderablePageShells layout={layout} shellsClassName="grid min-w-0 gap-5">
      <PageShell id="home-todo" label="Home To-do List">
      <PageShellSurface className="rounded-[1.25rem] border border-[#ede7f7] bg-white px-5 py-4 text-[#5f5876] shadow-[0_18px_45px_rgba(81,61,168,0.16)] dark:border-white/10 dark:bg-[#1b1530] dark:text-white/78">
        <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <ListTodo aria-hidden="true" className="mt-0.5 h-5 w-5 text-[#6f57f6]" />
              <div className="grid gap-2">
                <h1
                  className="text-xl font-black text-[#27304c] dark:text-white"
                  data-style-component="HomePage"
                  data-style-role="ui.section.title"
                >
                  {activeHomeTab === "todo" ? "To-do list" : "Routine"}
                </h1>
                <div aria-label="Home task view" className="flex flex-wrap gap-1.5" role="tablist">
                  <AdhdChip
                    aria-selected={activeHomeTab === "todo"}
                    onClick={() => selectHomeTab("todo")}
                    role="tab"
                    selected={activeHomeTab === "todo"}
                  >
                    To-do
                  </AdhdChip>
                  <AdhdChip
                    aria-selected={activeHomeTab === "routine"}
                    onClick={() => selectHomeTab("routine")}
                    role="tab"
                    selected={activeHomeTab === "routine"}
                  >
                    Routine
                  </AdhdChip>
                </div>
              </div>
            </div>
            <div className="relative flex items-center gap-2" ref={settingsMenuRef}>
              {activeHomeTab === "todo" || activeHomeTab === "routine" ? (
                <AdhdIconButton
                  aria-expanded={isSettingsOpen}
                  aria-haspopup="dialog"
                  aria-label={`${activeHomeTab === "todo" ? "To-do list" : "Routine"} settings`}
                  onClick={() => setIsSettingsOpen((current) => !current)}
                  selected={isSettingsOpen}
                  size="sm"
                  tone="ghost"
                >
                  <Settings2 aria-hidden="true" />
                </AdhdIconButton>
              ) : null}
              {isSettingsOpen ? (
                <div
                  aria-label={`${activeHomeTab === "todo" ? "To-do list" : "Routine"} settings`}
                  className="absolute right-0 top-[calc(100%+0.55rem)] z-40 grid w-[min(18rem,calc(100vw-2rem))] gap-3 rounded-[1.1rem] border border-[#ede6ff] bg-white/95 p-3 text-left shadow-[0_20px_60px_rgba(111,87,246,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#1b1530]/95"
                  role="dialog"
                >
                  <div>
                    <h2 className="text-sm font-bold text-[#26324f] dark:text-white">{activeHomeTab === "todo" ? "To-do list settings" : "Routine settings"}</h2>
                    <p className="mt-1 text-xs text-[#7d7598] dark:text-white/50">{activeHomeTab === "todo" ? "Tasks per day" : "Routines per section"}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={activeHomeTab === "todo" ? "Tasks per day" : "Routines per section"}>
                    {(activeHomeTab === "todo" ? [10, 11, 12, 13, 14, 15] : [1, 2, 3, 4, 5, 6]).map((capacity) => (
                      <AdhdChip
                        key={capacity}
                        onClick={() => activeHomeTab === "todo" ? updateTasksPerDay(capacity) : updateRoutinesPerSection(capacity)}
                        selected={activeHomeTab === "todo" ? state.tasksPerDay === capacity : state.routinesPerSection === capacity}
                        type="button"
                      >
                        {capacity}
                      </AdhdChip>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
        </div>
        <PageShellBody>
        <div className="relative mt-2" ref={searchRef}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <span className="text-xs font-medium text-[#7d7598] dark:text-white/55">Search tasks</span>
            <AdhdChip
              disabled={isCreating}
              onClick={() => {
                setIsSearchOpen(false);
                setNewTaskTypeSelection("task");
                setIsCreateOpen(true);
              }}
              selected={isCreateOpen}
            >
              New task
            </AdhdChip>
          </div>
          <label className="mt-1.5 grid gap-1.5">
            <span className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#938ab8]" />
              <input
                className="health-input pl-9"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="Task, Step, Substep, notes, or tags"
                value={query}
              />
            </span>
          </label>
          {isCreateOpen ? (
            <form
              className="mt-3 flex flex-wrap items-end gap-2 rounded-[1rem] border border-[#e4def2] bg-[#fcfbff] p-2.5 dark:border-white/10 dark:bg-white/[0.03]"
              onSubmit={handleCreateTask}
            >
              <label className="min-w-[min(100%,16rem)] flex-1">
                <span className="sr-only">Task title</span>
                <input
                  autoComplete="off"
                  className="health-input"
                  disabled={isCreating}
                  onChange={(event) => setNewTaskTitle(event.target.value)}
                  placeholder="Task title"
                  ref={newTaskInputRef}
                  value={newTaskTitle}
                />
              </label>
              <label className="w-full sm:w-44 sm:shrink-0">
                <span className="sr-only">Task Type</span>
                <TaskTypeSelect
                  ariaLabel="Task Type"
                  disabled={isCreating}
                  label="Task Type"
                  onChange={setNewTaskTypeSelection}
                  options={taskTypeOptions}
                  value={newTaskTypeSelection}
                />
              </label>
              <fieldset className="grid w-full min-w-0 gap-3" disabled={isCreating}>
                <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                  <label className="grid min-w-0 gap-1">
                    <span className="text-[11px] font-medium text-[#9b92be] dark:text-white/35">Due date</span>
                    <input
                      aria-label="Due date"
                      className={TASK_TABLE_INPUT_CLASS}
                      onChange={(event) => {
                        setNewTaskDueOn(event.target.value);
                        if (!event.target.value) setNewTaskDueTime("");
                      }}
                      type="date"
                      value={newTaskDueOn}
                    />
                  </label>
                  <label className="grid min-w-0 gap-1">
                    <span className="text-[11px] font-medium text-[#9b92be] dark:text-white/35">Due time</span>
                    <input
                      aria-label="Due time"
                      className={TASK_TABLE_INPUT_CLASS}
                      onChange={(event) => setNewTaskDueTime(event.target.value)}
                      type="time"
                      value={newTaskDueTime}
                    />
                  </label>
                </div>
                <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
                  <div className="grid min-w-0 gap-1">
                    <span className="text-[11px] font-medium text-[#9b92be] dark:text-white/35">Priority</span>
                    <div className="flex flex-wrap gap-2">
                      {TASK_PRIORITY_LEVEL_OPTIONS.map((value) => (
                        <TaskTableChipButton
                          key={value}
                          onClick={() => setNewTaskPriority(value)}
                          toneClassName={newTaskPriority === value ? getSelectedTaskPriorityToneClass(value) : getTaskPriorityToneClass(value)}
                        >
                          {value}
                        </TaskTableChipButton>
                      ))}
                    </div>
                  </div>
                  <div className="grid min-w-0 gap-1">
                    <span className="text-[11px] font-medium text-[#9b92be] dark:text-white/35">Repeat</span>
                    <div className="flex flex-wrap gap-2">
                      {HOME_REPEAT_OPTIONS.map((option) => (
                        <TaskTableChipButton
                          key={option.value}
                          onClick={() => selectNewTaskRepeatFrequency(option.value)}
                          toneClassName={newTaskRepeatFrequency === option.value && option.value !== "none"
                            ? TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS
                            : TASK_TABLE_INACTIVE_CHIP_CLASS}
                        >
                          {option.label}
                        </TaskTableChipButton>
                      ))}
                      <TaskTableChipButton
                        onClick={applyNewTaskWeekdaysPreset}
                        toneClassName={isWeekdaysRepeatSelection(newTaskRepeatFrequency, newTaskRepeatDaysOfWeek, parsePositiveInteger(newTaskRepeatInterval) ?? 1)
                          ? TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS
                          : TASK_TABLE_INACTIVE_CHIP_CLASS}
                      >
                        Weekdays
                      </TaskTableChipButton>
                    </div>
                    {newTaskRepeatFrequency !== "none" ? (
                      <div className="mt-1 space-y-2">
                        <CompactRepeatCadenceControls
                          activeToneClassName={TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS}
                          dayInputProps={{
                            inputMode: "numeric",
                            max: 31,
                            min: 1,
                            onBlur: () => setNewTaskRepeatDayOfMonth((current) => {
                              const parsed = parseDayOfMonth(current);
                              return parsed === null ? "" : String(parsed);
                            }),
                            onChange: (event) => setNewTaskRepeatDayOfMonth(event.target.value.replace(/[^\d]/g, "").slice(0, 2)),
                            type: "text",
                            value: newTaskRepeatDayOfMonth,
                          }}
                          inactiveToneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}
                          intervalInputProps={{
                            inputMode: "numeric",
                            min: 1,
                            onBlur: () => setNewTaskRepeatInterval((current) => String(parsePositiveInteger(current) ?? 1)),
                            onChange: (event) => setNewTaskRepeatInterval(event.target.value.replace(/[^\d]/g, "")),
                            type: "text",
                            value: newTaskRepeatInterval,
                          }}
                          monthlyMode={newTaskRepeatMonthlyMode}
                          monthlyModeOptions={REPEAT_MONTHLY_MODE_OPTIONS}
                          monthlyOrdinal={newTaskRepeatMonthlyOrdinal}
                          monthlyOrdinalOptions={REPEAT_MONTHLY_ORDINAL_OPTIONS}
                          monthlyWeekday={newTaskRepeatMonthlyWeekday}
                          onMonthlyModeClick={(value) => {
                            const nextOrdinal = value === "ordinal_weekday" ? (newTaskRepeatMonthlyOrdinal ?? "first") : null;
                            const nextWeekday = value === "ordinal_weekday" ? (newTaskRepeatMonthlyWeekday ?? 1) : null;
                            setNewTaskRepeatMonthlyMode(value);
                            setNewTaskRepeatMonthlyOrdinal(nextOrdinal);
                            setNewTaskRepeatMonthlyWeekday(nextWeekday);
                          }}
                          onMonthlyOrdinalClick={(value) => {
                            setNewTaskRepeatMonthlyMode("ordinal_weekday");
                            setNewTaskRepeatMonthlyOrdinal(value);
                            setNewTaskRepeatMonthlyWeekday(newTaskRepeatMonthlyWeekday ?? 1);
                          }}
                          onMonthlyWeekdayClick={(value) => {
                            setNewTaskRepeatMonthlyMode("ordinal_weekday");
                            setNewTaskRepeatMonthlyOrdinal(newTaskRepeatMonthlyOrdinal ?? "first");
                            setNewTaskRepeatMonthlyWeekday(value);
                          }}
                          onRepeatUnitClick={selectNewTaskRepeatFrequency}
                          onWeekdayClick={(weekday) => setNewTaskRepeatDaysOfWeek((current) => (
                            current.includes(weekday)
                              ? current.filter((value) => value !== weekday)
                              : [...current, weekday].sort((left, right) => left - right)
                          ))}
                          repeat={newTaskRepeatFrequency}
                          repeatDaysOfWeek={newTaskRepeatDaysOfWeek}
                          repeatUnits={HOME_REPEAT_UNITS}
                          showInterval
                          showMonthDay={(newTaskRepeatFrequency === "monthly" || newTaskRepeatFrequency === "custom") && newTaskRepeatMonthlyMode !== "ordinal_weekday"}
                          showMonthlyMode={newTaskRepeatFrequency === "monthly" || newTaskRepeatFrequency === "custom"}
                          showMonthlyOrdinals={(newTaskRepeatFrequency === "monthly" || newTaskRepeatFrequency === "custom") && newTaskRepeatMonthlyMode === "ordinal_weekday"}
                          showMonthlyWeekdays={(newTaskRepeatFrequency === "monthly" || newTaskRepeatFrequency === "custom") && newTaskRepeatMonthlyMode === "ordinal_weekday"}
                          showWeekdays={newTaskRepeatFrequency === "weekly" || newTaskRepeatFrequency === "custom"}
                          weekdayOptions={newTaskRepeatMonthlyMode === "ordinal_weekday"
                            ? HOME_REPEAT_MONTHLY_WEEKDAY_OPTIONS
                            : HOME_REPEAT_WEEKDAY_OPTIONS}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="grid min-w-0 gap-2">
                  <span className="text-[11px] font-medium text-[#9b92be] dark:text-white/35">Tags</span>
                  <div className="flex flex-wrap gap-2">
                    {newTaskTags.length > 0 ? newTaskTags.map((tag) => (
                      <TaskTableChipButton
                        key={tag}
                        onClick={() => removeNewTaskTag(tag)}
                        toneClassName={TASK_TABLE_ACTIVE_LIST_CHIP_CLASS}
                      >
                        #{tag}
                        <X className="ml-1 h-3.5 w-3.5" />
                      </TaskTableChipButton>
                    )) : (
                      <span className="text-sm text-[#7d7597] dark:text-white/55">No tags on this task yet.</span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <input
                      aria-label="Search or add a tag"
                      className={`${TASK_TABLE_INPUT_CLASS} min-w-[12rem] flex-1 sm:min-w-[16rem]`}
                      onChange={(event) => setNewTaskTagDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        if (!newTaskTagDraft.trim()) return;
                        event.preventDefault();
                        addNewTaskTag(exactNewTaskTagMatch ?? newTaskTagDraft);
                      }}
                      placeholder="Search or add a tag"
                      type="text"
                      value={newTaskTagDraft}
                    />
                    {exactNewTaskTagMatch ? (
                      <TaskTableChipButton onClick={() => addNewTaskTag(exactNewTaskTagMatch)} toneClassName={TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS}>
                        Use #{exactNewTaskTagMatch}
                      </TaskTableChipButton>
                    ) : null}
                    {normalizedNewTaskTagDraft && !exactNewTaskTagMatch ? (
                      <TaskTableChipButton onClick={() => addNewTaskTag(newTaskTagDraft)} toneClassName={TASK_LIST_QUICK_PANEL_PRIMARY_CHIP_CLASS}>
                        {`Add "${formatNewTaskTagLabel(newTaskTagDraft)}"`}
                      </TaskTableChipButton>
                    ) : null}
                  </div>
                  {availableNewTaskTagOptions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {availableNewTaskTagOptions.map((tag) => (
                        <TaskTableChipButton key={tag} onClick={() => addNewTaskTag(tag)} toneClassName={TASK_TABLE_INACTIVE_CHIP_CLASS}>
                          #{tag}
                        </TaskTableChipButton>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-[#7d7597] dark:text-white/55">
                      {normalizedNewTaskTagDraft ? "No matching saved tags." : "No saved tags yet."}
                    </span>
                  )}
                </div>
              </fieldset>
              <div className="flex shrink-0 gap-1.5">
                <AdhdChip disabled={isCreating} selected type="submit">
                  {isCreating ? "Adding…" : "Add"}
                </AdhdChip>
                <AdhdChip disabled={isCreating} onClick={cancelCreateTask}>
                  Cancel
                </AdhdChip>
              </div>
            </form>
          ) : null}
          {isSearchOpen && query.trim() ? (
            <div className="absolute inset-x-0 top-full z-30 mt-2 max-h-[min(55vh,26rem)] overflow-y-auto rounded-[1.2rem] border border-[#e4def2] bg-white p-2 shadow-xl dark:border-white/15 dark:bg-[#201a35]">
              {searchResults.length ? searchResults.map(({ hierarchy, task }) => (
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-[#f6f2ff] dark:hover:bg-white/8"
                  key={task.id}
                  onClick={() => {
                    void addSearchResult(task.id);
                  }}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className={`block truncate ${HOME_TODO_TITLE_CLASS}`}>
                      {task.title || "Untitled task"}
                    </span>
                    {hierarchy.length ? (
                      <span className="mt-0.5 block truncate text-xs text-[#837b9e] dark:text-white/48">
                        {hierarchy.join(" › ")}
                      </span>
                    ) : null}
                  </span>
                  <Plus aria-hidden="true" className="h-4 w-4 shrink-0 text-[#6f57f6]" />
                </button>
              )) : (
                <p className="px-3 py-6 text-center text-sm text-[#837b9e]">No matching active tasks</p>
              )}
            </div>
          ) : null}
        </div>

          {activeHomeTab === "todo" ? (
            <>
              <SortableList
                className={HOME_TODO_LIST_CLASS}
                getId={(task) => task.id}
                getLabel={(task) => task.title || "Untitled task"}
                items={visibleTasks}
                onReorder={(nextTasks, context) => {
                  const sourceTask = visibleTasks[context.sourceIndex];
                  updateTaskIds((taskIds) => mergeHomeTodoVisibleTaskIds(
                    taskIds,
                    visibleTasks.map((task) => task.id),
                    nextTasks.map((task) => task.id),
                  ));
                  if (sourceTask) {
                    const targetDayOffset = context.dropZoneId === "later"
                      ? 7
                      : context.dropZoneId?.startsWith("day-")
                        ? Number.parseInt(context.dropZoneId.slice(4), 10)
                        : getDayOffsetForInsertion(context.targetIndex);
                    updateTaskDayOffset(sourceTask.id, Number.isInteger(targetDayOffset) ? targetDayOffset : null);
                  }
                }}
                renderAfterItems={(
                  <>
                    {daySections
                      .filter((section) => section.startIndex >= visibleTasks.length)
                      .map(renderDaySectionHeader)}
                    {!isDoLaterOpen && doLaterTasks.length ? renderLaterSectionHeader() : null}
                  </>
                )}
                renderBeforeItem={(_, index) => (
                  <>
                    {daySections
                      .filter((section) => section.startIndex === index)
                      .map(renderDaySectionHeader)}
                    {isDoLaterOpen && index === sevenDayCapacity && doLaterTasks.length ? renderLaterSectionHeader() : null}
                  </>
                )}
              >
                {(task, index, handle) => renderHomeTask(task, index, handle, "todo")}
              </SortableList>
              {!todoTasks.length ? (
                <p className="mt-5 rounded-[1.25rem] border border-dashed border-[#ddd6ee] bg-[#fcfbff] px-5 py-6 text-center text-sm text-[#7d7597] dark:border-white/15 dark:bg-white/[0.03] dark:text-white/55">
                  Search above to add the first task to your ordered list.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <SortableList
                className={HOME_TODO_LIST_CLASS}
                getId={(group) => group.anchorId}
                getLabel={(group) => group.tasks[0]?.task.title || "Untitled task"}
                items={routineGroups}
                onReorder={(nextGroups) => updateRoutineTaskIds(() => nextGroups.map((group) => group.anchorId))}
                renderAfterItems={routineSections
                  .filter((section) => section.startIndex >= routineGroups.length)
                  .map(renderRoutineSectionHeader)}
                renderBeforeItem={(_, index) => routineSections
                  .filter((section) => section.startIndex === index)
                  .map(renderRoutineSectionHeader)}
              >
                {(group, index, handle) => (
                  <div className="space-y-2">
                    {group.tasks.map(({ depth, isAnchor, task }) => renderHomeTask(
                      task,
                      index,
                      isAnchor ? handle : null,
                      "routine",
                      `${group.anchorId}-${task.id}`,
                      depth,
                      isAnchor,
                    ))}
                  </div>
                )}
              </SortableList>
              {!routineGroups.length ? (
                <p className="mt-5 rounded-[1.25rem] border border-dashed border-[#ddd6ee] bg-[#fcfbff] px-5 py-6 text-center text-sm text-[#7d7597] dark:border-white/[0.15] dark:bg-white/[0.03] dark:text-white/55">
                  No Routine tasks yet.
                </p>
              ) : null}
            </>
          )}
        </PageShellBody>
      </PageShellSurface>
      </PageShell>
      </ReorderablePageShells>
    </section>
  );
}
