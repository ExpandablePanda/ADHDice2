import type { Task, TaskHistory } from "@/lib/database.types";
import { collapseTaskHistory } from "@/lib/records/evaluator";

export const HOME_RECORD_METRIC_KEYS = [
  "parent_tasks_day",
  "steps_day",
  "permanent_completes_day",
] as const;

export type HomeRecordMetricKey = typeof HOME_RECORD_METRIC_KEYS[number];

export type HomeDailyProgress = Readonly<{
  parentTasks: number;
  permanentCompletes: number;
  recordLiveValues: Readonly<Record<HomeRecordMetricKey, number>>;
  steps: number;
  total: number;
}>;

export type HomeRecordChaseState = "below_record" | "first_record" | "new_record" | "tied_record";

export type HomeRecordChase = Readonly<{
  label: string;
  liveValue: number;
  message: string;
  metricKey: HomeRecordMetricKey;
  recordValue: number | null;
  state: HomeRecordChaseState;
}>;

const HOME_RECORD_LABELS: Readonly<Record<HomeRecordMetricKey, string>> = {
  parent_tasks_day: "Tasks Today",
  permanent_completes_day: "Permanent Completes Today",
  steps_day: "Steps Today",
};

const HOME_RECORD_ORDER: Readonly<Record<HomeRecordMetricKey, number>> = {
  parent_tasks_day: 0,
  steps_day: 1,
  permanent_completes_day: 2,
};

function emptyRecordLiveValues(): Record<HomeRecordMetricKey, number> {
  return {
    parent_tasks_day: 0,
    permanent_completes_day: 0,
    steps_day: 0,
  };
}

export function buildHomeDailyProgress(input: {
  taskHistoryByTaskId: Readonly<Record<string, readonly TaskHistory[]>>;
  tasks: readonly Task[];
  todayKey: string;
}): HomeDailyProgress {
  const taskHistory = Object.values(input.taskHistoryByTaskId).flat();
  const todayOccurrences = collapseTaskHistory({ taskHistory, tasks: [...input.tasks] })
    .filter((occurrence) => occurrence.creditedDate === input.todayKey);
  const completedOccurrences = todayOccurrences.filter((occurrence) => occurrence.isOrdinarySuccess || occurrence.isPermanentComplete);
  const completedTaskIds = new Set(completedOccurrences.map((occurrence) => occurrence.task.id));
  const parentTaskIds = new Set(completedOccurrences.filter((occurrence) => occurrence.entityKind === "parent").map((occurrence) => occurrence.task.id));
  const stepTaskIds = new Set(completedOccurrences.filter((occurrence) => occurrence.entityKind === "step").map((occurrence) => occurrence.task.id));
  const permanentCompleteTaskIds = new Set(completedOccurrences.filter((occurrence) => occurrence.isPermanentComplete).map((occurrence) => occurrence.task.id));
  const ordinaryOccurrences = todayOccurrences.filter((occurrence) => occurrence.isOrdinarySuccess);
  const recordLiveValues = emptyRecordLiveValues();
  recordLiveValues.parent_tasks_day = ordinaryOccurrences.filter((occurrence) => occurrence.entityKind === "parent").length;
  recordLiveValues.steps_day = ordinaryOccurrences.filter((occurrence) => occurrence.entityKind === "step").length;
  recordLiveValues.permanent_completes_day = todayOccurrences.filter((occurrence) => occurrence.isPermanentComplete).length;

  return {
    parentTasks: parentTaskIds.size,
    permanentCompletes: permanentCompleteTaskIds.size,
    recordLiveValues,
    steps: stepTaskIds.size,
    total: completedTaskIds.size,
  };
}

export function buildHomeRecordChases(
  liveValues: Readonly<Record<HomeRecordMetricKey, number>>,
  targets: Readonly<Partial<Record<HomeRecordMetricKey, number>>>,
): HomeRecordChase[] {
  return HOME_RECORD_METRIC_KEYS.map((metricKey) => {
    const liveValue = liveValues[metricKey];
    const recordValue = targets[metricKey] ?? null;
    if (recordValue === null) {
      return {
        label: HOME_RECORD_LABELS[metricKey],
        liveValue,
        message: "Setting your first record",
        metricKey,
        recordValue,
        state: "first_record" as const,
      };
    }
    if (liveValue > recordValue) {
      return {
        label: HOME_RECORD_LABELS[metricKey],
        liveValue,
        message: "NEW RECORD · +" + (liveValue - recordValue),
        metricKey,
        recordValue,
        state: "new_record" as const,
      };
    }
    if (liveValue === recordValue) {
      return {
        label: HOME_RECORD_LABELS[metricKey],
        liveValue,
        message: "Tied record — 1 more to break it",
        metricKey,
        recordValue,
        state: "tied_record" as const,
      };
    }
    return {
      label: HOME_RECORD_LABELS[metricKey],
      liveValue,
      message: (recordValue + 1 - liveValue) + " more to beat it",
      metricKey,
      recordValue,
      state: "below_record" as const,
    };
  }).sort((left, right) => {
    const stateRank: Record<HomeRecordChaseState, number> = {
      new_record: 0,
      tied_record: 1,
      below_record: 2,
      first_record: 3,
    };
    const rankDifference = stateRank[left.state] - stateRank[right.state];
    if (rankDifference !== 0) return rankDifference;
    if (left.state === "below_record" && right.state === "below_record") {
      const leftDistance = left.recordValue! + 1 - left.liveValue;
      const rightDistance = right.recordValue! + 1 - right.liveValue;
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    }
    return HOME_RECORD_ORDER[left.metricKey] - HOME_RECORD_ORDER[right.metricKey];
  });
}
