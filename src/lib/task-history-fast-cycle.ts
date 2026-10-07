import type { TaskHistory } from "@/lib/database.types";
import type { TaskCalendarOverrideState, TaskEffectiveTimelineSourceKind } from "@/lib/task-state-engine/types";

export const TASK_HISTORY_FAST_CYCLE_DELAY_MS = 5_000;

export const TASK_HISTORY_FAST_CYCLE_ORDER = [
  "in_progress",
  "done",
  "did_my_best",
  "delayed",
  "missed",
  "complete",
  "blank",
  "not_due",
  "due",
] as const;

export type TaskHistoryFastCycleAction = typeof TASK_HISTORY_FAST_CYCLE_ORDER[number];

export type TaskHistoryFastCyclePending = {
  action: TaskHistoryFastCycleAction;
  dateKey: string;
  taskId: string;
};

export function getTaskHistoryFastCycleActions({
  canClear,
  calendarActionStatuses,
  calendarOverrideActions,
}: {
  canClear: boolean;
  calendarActionStatuses: readonly string[];
  calendarOverrideActions: readonly string[];
}) {
  // Automatic remains an explicit selected-day action, but never a cycle
  // position. An eligible Calendar edit always uses the same locked order;
  // canonical action authority still validates the final mutation.
  if (!canClear && calendarActionStatuses.length === 0 && calendarOverrideActions.length === 0) return [];
  return [...TASK_HISTORY_FAST_CYCLE_ORDER];
}

export function getTaskHistoryFastCycleCurrentAction({
  calendarOverrideState,
  entryStatus,
  state,
  sourceKind,
}: {
  calendarOverrideState?: TaskCalendarOverrideState | null;
  entryStatus?: TaskHistory["status"] | null;
  state?: string | null;
  sourceKind?: TaskEffectiveTimelineSourceKind | null;
}): TaskHistoryFastCycleAction | null {
  if (calendarOverrideState === "in_progress") return "in_progress";
  if (calendarOverrideState === "blank_due") return "blank";
  if (calendarOverrideState === "not_due") return "not_due";
  if (calendarOverrideState === "due_open") return "due";

  if (entryStatus === "done" || entryStatus === "did_my_best" || entryStatus === "delayed" || entryStatus === "missed" || entryStatus === "complete") {
    return entryStatus;
  }

  // Calculated/workflow states have no manual cycle position. Returning null
  // makes the first click preview In Progress without exposing Automatic.
  if (sourceKind === "calculated" || sourceKind === "workflow" || sourceKind === "history_fact") return null;
  if (state && (TASK_HISTORY_FAST_CYCLE_ORDER as readonly string[]).includes(state)) {
    return state as TaskHistoryFastCycleAction;
  }
  return null;
}

export function getNextTaskHistoryFastCycleAction(
  actions: readonly TaskHistoryFastCycleAction[],
  currentAction: TaskHistoryFastCycleAction | null,
) {
  if (actions.length === 0) return null;
  const currentIndex = currentAction === null ? -1 : actions.indexOf(currentAction);
  return actions[(currentIndex + 1 + actions.length) % actions.length] ?? null;
}

export function getTaskHistoryFastCycleActionLabel(action: TaskHistoryFastCycleAction) {
  if (action === "in_progress") return "In Progress";
  if (action === "blank") return "Blank";
  if (action === "did_my_best") return "Did My Best";
  if (action === "not_due") return "Not Due";
  if (action === "due") return "Due";
  if (action === "delayed") return "Delayed";
  if (action === "missed") return "Missed";
  return action === "complete" ? "Complete" : "Done";
}

type PendingChange = (pending: TaskHistoryFastCyclePending | null) => void;
type CommitPending = (pending: TaskHistoryFastCyclePending) => Promise<boolean | void>;
type TimerHandle = ReturnType<typeof setTimeout>;
type SetTimer = (callback: () => void, delayMs: number) => TimerHandle;
type ClearTimer = (timer: TimerHandle) => void;

export type TaskHistoryFastCycleController = {
  activate: () => void;
  cancel: () => void;
  dispose: () => void;
  flush: () => Promise<boolean>;
  schedule: (pending: TaskHistoryFastCyclePending) => void;
  setCommit: (commit: CommitPending) => void;
};

export function createTaskHistoryFastCycleController({
  commit: initialCommit,
  delayMs = TASK_HISTORY_FAST_CYCLE_DELAY_MS,
  onPendingChange,
  setTimer = setTimeout,
  clearTimer: clearTimerValue = clearTimeout,
}: {
  commit: CommitPending;
  clearTimer?: ClearTimer;
  delayMs?: number;
  onPendingChange: PendingChange;
  setTimer?: SetTimer;
}): TaskHistoryFastCycleController {
  let disposed = false;
  let generation = 0;
  let pending: TaskHistoryFastCyclePending | null = null;
  let timer: TimerHandle | null = null;
  let commitPromise: Promise<boolean> | null = null;
  let commit = initialCommit;

  function clearTimer() {
    if (timer === null) return;
    clearTimerValue(timer);
    timer = null;
  }

  function clearPending(notify: boolean) {
    pending = null;
    if (notify && !disposed) onPendingChange(null);
  }

  async function flush() {
    if (commitPromise) return commitPromise;
    clearTimer();
    const pendingAtFlush = pending;
    if (!pendingAtFlush || disposed) return true;
    const pendingGeneration = ++generation;
    commitPromise = (async () => {
      let committed = false;
      try {
        committed = (await commit(pendingAtFlush)) !== false;
      } catch {
        committed = false;
      }
      if (pending === pendingAtFlush && pendingGeneration === generation) {
        clearPending(true);
      }
      return committed;
    })();
    try {
      return await commitPromise;
    } finally {
      commitPromise = null;
    }
  }

  function schedule(nextPending: TaskHistoryFastCyclePending) {
    if (disposed || commitPromise) return;
    clearTimer();
    pending = nextPending;
    generation += 1;
    onPendingChange(nextPending);
    const scheduledGeneration = generation;
    timer = setTimer(() => {
      if (disposed || generation !== scheduledGeneration || pending !== nextPending) return;
      timer = null;
      void flush();
    }, delayMs);
  }

  return {
    activate() {
      if (!disposed) return;
      clearTimer();
      generation += 1;
      pending = null;
      disposed = false;
    },
    cancel() {
      clearTimer();
      generation += 1;
      clearPending(true);
    },
    dispose() {
      disposed = true;
      clearTimer();
      generation += 1;
      clearPending(false);
    },
    flush,
    schedule,
    setCommit(nextCommit) {
      commit = nextCommit;
    },
  };
}
