export async function promoteHomeSearchResultToUrgent({
  moveTodoTaskToUrgent,
  onSetTaskPriority,
  taskId,
  urgentTaskIds,
}: {
  moveTodoTaskToUrgent: (taskId: string) => void;
  onSetTaskPriority: (taskId: string, priority: "5") => Promise<boolean>;
  taskId: string;
  urgentTaskIds: readonly string[];
}) {
  if (urgentTaskIds.includes(taskId)) return false;
  const promoted = await onSetTaskPriority(taskId, "5");
  if (!promoted) return false;
  moveTodoTaskToUrgent(taskId);
  return true;
}
