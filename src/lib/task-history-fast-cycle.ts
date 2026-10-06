import type { TaskHistory } from "@/lib/database.types";
import type { TaskCalendarOverrideState, TaskEffectiveTimelineSourceKind } from "@/lib/task-state-engine/types";

export const TASK_HISTORY_FAST_CYCLE_DELAY_MS = 2_000;

export const TASK_HISTORY_FAST_CYCLE_ORDER = [
  "automatic",
  "blank",
  "done",
  "did_my_best",
  "missed",
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
  const actions: TaskHistoryFastCycleAction[] = [];
  if (canClear) actions.push("automatic");
  if (calendarOverrideActions.includes("blank_due")) actions.push("blank");
  if (calendarActionStatuses.includes("done")) actions.push("done");
  if (calendarActionStatuses.includes("did_my_best")) actions.push("did_my_best");
  if (calendarActionStatuses.includes("missed")) actions.push("missed");
  if (calendarOverrideActions.includes("not_due")) actions.push("not_due");
  if (calendarOverrideActions.includes("due_open")) actions.push("due");
  return actions;
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
}): TaskHistoryFastCycleAction {
  if (entryStatus === "done" || entryStatus === "did_my_best" || entryStatus === "missed") {
    return entryStatus;
  }
  if (calendarOverrideState === "blank_due") return "blank";
  if (calendarOverrideState === "not_due") return "not_due";
  if (calendarOverrideState === "due_open") return "due";

  // A calculated Not Due/Blank/Due is engine output, not a manual choice that
  // can be cleared. Keep the source distinction explicit for this boundary.
  if (sourceKind === "calculated" || sourceKind === "workflow" || sourceKind === "history_fact") {
    return "automatic";
  }
  return state === "done" || state === "did_my_best" || state === "missed"
    ? state
    : "automatic";
}

export function getNextTaskHistoryFastCycleAction(
  actions: readonly TaskHistoryFastCycleAction[],
  currentAction: TaskHistoryFastCycleAction,
) {
  if (actions.length === 0) return null;
  const currentIndex = actions.indexOf(currentAction);
  return actions[(currentIndex + 1 + actions.length) % actions.length] ?? null;
}

export function getTaskHistoryFastCycleActionLabel(action: TaskHistoryFastCycleAction) {
  if (action === "automatic") return "Automatic";
  if (action === "blank") return "Blank";
  if (action === "did_my_best") return "Did My Best";
  if (action === "not_due") return "Not Due";
  if (action === "due") return "Due";
  return action === "missed" ? "Missed" : "Done";
}

type PendingChange = (pending: TaskHistoryFastCyclePending | null) => void;
type CommitPending = (pending: TaskHistoryFastCyclePending) => Promise<boolean | void>;
type TimerHandle = ReturnType<typeof setTimeout>;
type SetTimer = (callback: () => void, delayMs: number) => TimerHandle;
type ClearTimer = (timer: TimerHandle) => void;

export type TaskHistoryFastCycleController = {
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
