import type { Task, TaskHistory } from "@/lib/database.types";
import { adaptLegacyTaskState } from "./legacy-adapter.ts";
import { evaluateTaskState } from "./engine.ts";
import { projectPersistableTaskStatePatch } from "./persistence-projection.ts";
import { TASK_STATE_ENGINE_INTEGRATION_ENABLED } from "./read-authority.ts";
import type { TaskHistoryOutcome } from "./types.ts";

export function evaluateTaskActionAuthority(input: {
  enabled?: boolean;
  history: TaskHistory[];
  logicalDayRollover: string;
  delayDays?: number;
  now: Date | string;
  outcome?: TaskHistoryOutcome;
  outcomeDate?: string;
  task: Task;
  timezone: string;
}) {
  if (!(input.enabled ?? TASK_STATE_ENGINE_INTEGRATION_ENABLED)) return null;
  const adapted = adaptLegacyTaskState(input.task, input.history, input);
  const result = evaluateTaskState({
    ...adapted.engineInput,
    ...(input.outcome ? { action: { type: "record_outcome" as const, outcome: input.outcome, logicalDate: input.outcomeDate, delayDays: input.delayDays, provenance: "manual" as const } } : {}),
  });
  return { ...result, persistableTaskPatch: projectPersistableTaskStatePatch(result.proposedTaskPatch, input.task) };
}
