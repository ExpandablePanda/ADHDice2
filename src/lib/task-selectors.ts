import type { Task } from "@/lib/database.types";
import { isTaskFinished, isTaskOpen, isTaskUrgent } from "@/lib/task-buckets";
import { isDueToday, isOverdue } from "@/lib/task-cockpit";

type TaskMembership = { id: string };

export function buildTaskCollections(
  tasks: Task[],
  taskMembershipsByTaskId: Record<string, TaskMembership[]>,
  focusedTaskIds: string[],
) {
  const filteredActiveTasks = tasks.filter(isTaskOpen);
  const filteredDoneTasks = tasks.filter(isTaskFinished);
  const filteredOverdueTasks = filteredActiveTasks.filter((task) => isOverdue(task.due_on));
  const filteredUrgentTasks = filteredActiveTasks.filter(isTaskUrgent);
  const filteredFocusTasks = filteredActiveTasks.filter((task) => focusedTaskIds.includes(task.id));
  const filteredLowEnergyTasks = filteredActiveTasks.filter((task) => task.energy === "low").slice(0, 4);
  const filteredTodayTasks = filteredActiveTasks.filter((task) => isDueToday(task.due_on));

  const withMembership = (membershipId: string) =>
    tasks.filter((task) => taskMembershipsByTaskId[task.id]?.some((membership) => membership.id === membershipId));

  return {
    filteredActiveTasks,
    filteredDoneTasks,
    filteredFocusTasks,
    filteredLowEnergyTasks,
    filteredOverdueTasks,
    filteredTodayTasks,
    filteredUrgentTasks,
    inboxTasks: withMembership("inbox"),
    laterTasks: withMembership("later"),
    missedTasks: withMembership("missed"),
    quickWinTasks: withMembership("quick_wins"),
    recurringTasks: withMembership("recurring"),
    waitingTasks: withMembership("waiting"),
  };
}
