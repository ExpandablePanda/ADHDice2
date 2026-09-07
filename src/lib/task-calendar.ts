import type { Task } from "@/lib/database.types";

export const TASK_CALENDAR_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type TaskCalendarMonth = {
  month: number;
  year: number;
};

export type TaskCalendarDay = {
  date: Date;
  dateKey: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
};

function padCalendarPart(value: number) {
  return String(value).padStart(2, "0");
}

export function getCalendarDateKey(date: Date) {
  return `${date.getFullYear()}-${padCalendarPart(date.getMonth() + 1)}-${padCalendarPart(date.getDate())}`;
}

export function getTaskCalendarMonth(date: Date): TaskCalendarMonth {
  return {
    month: date.getMonth(),
    year: date.getFullYear(),
  };
}

export function shiftTaskCalendarMonth(month: TaskCalendarMonth, offset: number): TaskCalendarMonth {
  const shifted = new Date(month.year, month.month + offset, 1);
  return getTaskCalendarMonth(shifted);
}

export function getTaskCalendarMonthGrid(month: TaskCalendarMonth): TaskCalendarDay[] {
  const firstDay = new Date(month.year, month.month, 1);
  const leadingDayCount = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const displayedWeekCount = Math.max(5, Math.ceil((leadingDayCount + daysInMonth) / 7));

  return Array.from({ length: displayedWeekCount * 7 }, (_, index) => {
    const date = new Date(month.year, month.month, 1 - leadingDayCount + index);
    return {
      date,
      dateKey: getCalendarDateKey(date),
      dayOfMonth: date.getDate(),
      isCurrentMonth: date.getMonth() === month.month && date.getFullYear() === month.year,
    };
  });
}

export function formatTaskCalendarMonth(month: TaskCalendarMonth, locale?: string) {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(month.year, month.month, 1),
  );
}

export function formatTaskCalendarDate(date: Date, locale?: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function parseTaskCalendarTime(value: string | null | undefined) {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1]!, 10);
  const minutes = Number.parseInt(match[2]!, 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

export function formatTaskCalendarTime(value: string | null | undefined, locale?: string) {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const minutes = parseTaskCalendarTime(value);
  if (minutes === null) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
    new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60),
  );
}

function hasTaskCalendarTime(task: Pick<Task, "due_time">) {
  return typeof task.due_time === "string" && task.due_time.trim().length > 0;
}

export function sortTasksForCalendar<T extends Pick<Task, "due_time">>(tasks: readonly T[]) {
  return tasks
    .map((task, index) => ({ index, task }))
    .sort((left, right) => {
      const leftHasTime = hasTaskCalendarTime(left.task);
      const rightHasTime = hasTaskCalendarTime(right.task);
      if (leftHasTime !== rightHasTime) {
        return leftHasTime ? -1 : 1;
      }

      if (leftHasTime && rightHasTime) {
        const leftMinutes = parseTaskCalendarTime(left.task.due_time) ?? Number.MAX_SAFE_INTEGER;
        const rightMinutes = parseTaskCalendarTime(right.task.due_time) ?? Number.MAX_SAFE_INTEGER;
        if (leftMinutes !== rightMinutes) {
          return leftMinutes - rightMinutes;
        }
      }

      return left.index - right.index;
    })
    .map(({ task }) => task);
}

export function groupTasksByCalendarDate<T extends Pick<Task, "due_on" | "due_time">>(tasks: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    if (task.due_on === null) {
      continue;
    }
    const current = groups.get(task.due_on) ?? [];
    current.push(task);
    groups.set(task.due_on, current);
  }

  for (const [dateKey, groupedTasks] of groups) {
    groups.set(dateKey, sortTasksForCalendar(groupedTasks));
  }
  return groups;
}
