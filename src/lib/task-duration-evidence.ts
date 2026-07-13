import type { Task, TaskHistoryInsert, TaskStatus } from "@/lib/database.types";

export type TaskOccurrenceIdentity = {
  occurrenceDueOn: string | null;
  occurrenceKey: string | null;
};

export type TaskDurationEvidence = TaskOccurrenceIdentity & {
  estimateEligible: true;
  source: "manual" | "task_timer";
};

export function buildTaskOccurrenceIdentity(
  task: Pick<Task, "active_occurrence_due_on" | "due_on" | "id" | "repeat_frequency">,
): TaskOccurrenceIdentity {
  const occurrenceDueOn = task.repeat_frequency === "none"
    ? null
    : task.active_occurrence_due_on ?? task.due_on ?? null;

  return {
    occurrenceDueOn,
    occurrenceKey: task.repeat_frequency === "none"
      ? `lifetime:${task.id}`
      : occurrenceDueOn ? `occurrence:${occurrenceDueOn}` : null,
  };
}

/** Captures the immutable task occurrence identity used by duration-learning evidence. */
export function buildTaskDurationEvidence(
  task: Pick<Task, "active_occurrence_due_on" | "due_on" | "id" | "repeat_frequency">,
  source: TaskDurationEvidence["source"],
): TaskDurationEvidence {
  return {
    ...buildTaskOccurrenceIdentity(task),
    estimateEligible: true,
    source,
  };
}

export function buildTaskHistoryOccurrenceMetadata(
  task: Pick<Task, "active_occurrence_due_on" | "due_on" | "id" | "repeat_frequency"> | null | undefined,
  status: TaskStatus,
): Pick<TaskHistoryInsert, "occurrence_due_on" | "occurrence_key"> {
  if (!task || (status !== "done" && status !== "did_my_best")) {
    return { occurrence_due_on: null, occurrence_key: null };
  }
  const identity = buildTaskOccurrenceIdentity(task);
  return {
    occurrence_due_on: identity.occurrenceDueOn,
    occurrence_key: identity.occurrenceKey,
  };
}
