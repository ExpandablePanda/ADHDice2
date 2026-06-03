import type { Task } from "@/lib/database.types";
import { isTaskFinished, isTaskUrgent } from "@/lib/task-buckets";
import { isDueToday } from "@/lib/task-cockpit";

export type MomentumView = "urgent" | "today" | "focus";

export function getNextMomentumView(currentView: MomentumView): MomentumView {
  return currentView === "urgent" ? "today" : currentView === "today" ? "focus" : "urgent";
}

export function updateFocusedTaskIdsByDate(
  current: Record<string, string[]>,
  dateKey: string,
  taskIds: string[],
) {
  const next = { ...current };

  if (taskIds.length === 0) {
    delete next[dateKey];
    return next;
  }

  next[dateKey] = taskIds;
  return next;
}

export function getMomentumMetric(
  data: {
    doneTasks: Task[];
    focusedTaskIds: string[];
    tasks: Task[];
    todayTasks: Task[];
    urgentTasks: Task[];
  },
  view: MomentumView,
) {
  if (view === "today") {
    const doneTasks = data.doneTasks.filter((task) => isDueToday(task.due_on));
    const remainingTasks = data.todayTasks;
    const totalCount = doneTasks.length + remainingTasks.length;
    const percent = totalCount === 0 ? 0 : Math.round((doneTasks.length / totalCount) * 100);
    return {
      doneTasks,
      label: "Today Momentum",
      percent,
      remainingTasks,
      summary: `${doneTasks.length} / ${totalCount} due today finished`,
      totalCount,
    };
  }

  if (view === "focus") {
    const focusedAllTasks = data.tasks.filter((task) => data.focusedTaskIds.includes(task.id));
    const doneTasks = focusedAllTasks.filter(isTaskFinished);
    const remainingTasks = focusedAllTasks.filter((task) => !isTaskFinished(task));
    const totalCount = focusedAllTasks.length;
    const percent = totalCount === 0 ? 0 : Math.round((doneTasks.length / totalCount) * 100);
    return {
      doneTasks,
      label: "Focus Momentum",
      percent,
      remainingTasks,
      summary: `${doneTasks.length} / ${totalCount} focused tasks finished`,
      totalCount,
    };
  }

  const doneTasks = data.doneTasks.filter(isTaskUrgent);
  const remainingTasks = data.urgentTasks;
  const totalCount = doneTasks.length + remainingTasks.length;
  const percent = totalCount === 0 ? 0 : Math.round((doneTasks.length / totalCount) * 100);
  return {
    doneTasks,
    label: "Urgent Momentum",
    percent,
    remainingTasks,
    summary: `${doneTasks.length} / ${totalCount} urgent tasks finished`,
    totalCount,
  };
}
