import type {
  TaskRepeatFrequency,
  TaskRepeatMonthlyMode,
  TaskRepeatMonthlyOrdinal,
} from "./database.types.ts";

export type TaskRepeatReconciliationValue = {
  repeat: TaskRepeatFrequency;
  repeatInterval: number;
  repeatDaysOfWeek: number[];
  repeatDayOfMonth: number | null;
  repeatMonthlyMode: TaskRepeatMonthlyMode;
  repeatMonthlyOrdinal: TaskRepeatMonthlyOrdinal | null;
  repeatMonthlyWeekday: number | null;
};

export type PendingTaskRepeat = {
  generation: number;
  value: TaskRepeatReconciliationValue;
};

function sameNumberArray(left: number[], right: number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function taskRepeatValuesEqual(left: TaskRepeatReconciliationValue, right: TaskRepeatReconciliationValue) {
  return left.repeat === right.repeat
    && left.repeatInterval === right.repeatInterval
    && sameNumberArray(left.repeatDaysOfWeek, right.repeatDaysOfWeek)
    && left.repeatDayOfMonth === right.repeatDayOfMonth
    && left.repeatMonthlyMode === right.repeatMonthlyMode
    && left.repeatMonthlyOrdinal === right.repeatMonthlyOrdinal
    && left.repeatMonthlyWeekday === right.repeatMonthlyWeekday;
}

export function reconcilePendingTaskRepeats<TRow extends { id: string } & TaskRepeatReconciliationValue>(
  rows: readonly TRow[],
  pending: ReadonlyMap<string, PendingTaskRepeat>,
) {
  const settled: Array<{ generation: number; taskId: string }> = [];
  const nextRows = rows.map((row) => {
    const pendingRepeat = pending.get(row.id);
    if (!pendingRepeat) {
      return row;
    }
    if (taskRepeatValuesEqual(row, pendingRepeat.value)) {
      settled.push({ generation: pendingRepeat.generation, taskId: row.id });
      return row;
    }
    return {
      ...row,
      ...pendingRepeat.value,
      repeatDaysOfWeek: [...pendingRepeat.value.repeatDaysOfWeek],
    };
  });

  return { nextRows, settled };
}
