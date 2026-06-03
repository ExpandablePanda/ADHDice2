import type { Task } from "@/lib/database.types";
import { isTaskFinished, isTaskOpen } from "@/lib/task-buckets";

export function sortTasksForUi(nextTasks: Task[]) {
  return [...nextTasks].sort((left, right) => {
    const leftBucket = isTaskOpen(left) ? 0 : isTaskFinished(left) ? 1 : 2;
    const rightBucket = isTaskOpen(right) ? 0 : isTaskFinished(right) ? 1 : 2;
    if (leftBucket !== rightBucket) {
      return leftBucket - rightBucket;
    }

    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }

    return right.created_at.localeCompare(left.created_at);
  });
}
