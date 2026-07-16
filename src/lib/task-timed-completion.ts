import type { Task } from "@/lib/database.types";
import type { StoppedTaskTimer } from "@/hooks/useTaskTimers";
import type { OnTimeLinkedItemOrigin } from "@/lib/on-time-plan-state";

export type TimedCompletionTerminalAction = "done" | "did_my_best" | "complete";

type TimedCompletionBase<TCompletePayload> = {
  completePayload: TCompletePayload | null;
  completionError: string | null;
  evidenceId: string | null;
  latestTask: Task | null;
  occurrenceDueOn: string | null;
  occurrenceKey: string | null;
  onTimeOrigin: OnTimeLinkedItemOrigin | null;
  taskId: string;
  terminalAction: TimedCompletionTerminalAction;
};

export type TimedCompletionWorkflow<TCompletePayload> =
  | (TimedCompletionBase<TCompletePayload> & { phase: "stopping_timer"; stoppedTimer: null })
  | (TimedCompletionBase<TCompletePayload> & { phase: "awaiting_evidence" | "saving_evidence"; stoppedTimer: StoppedTaskTimer })
  | (TimedCompletionBase<TCompletePayload> & { phase: "evidence_saved_awaiting_completion" | "completing_task" | "failed_completion" | "complete"; evidenceId: string; stoppedTimer: StoppedTaskTimer });

export function isTimedCompletionEvidenceSaved<T>(workflow: TimedCompletionWorkflow<T> | null) {
  return Boolean(workflow && workflow.evidenceId && (
    workflow.phase === "evidence_saved_awaiting_completion"
    || workflow.phase === "completing_task"
    || workflow.phase === "failed_completion"
    || workflow.phase === "complete"
  ));
}
