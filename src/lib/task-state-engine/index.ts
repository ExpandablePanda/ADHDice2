export { evaluateTaskState } from "./engine.ts";
export { logicalDateForTimestamp } from "./calendar.ts";
export { allowedOutcomes, occurrenceIdentity } from "./recurrence.ts";
export { adaptLegacyTaskState } from "./legacy-adapter.ts";
export { assertSafeProposedTaskPatch, inspectProposedTaskPatch, runTaskStateShadow } from "./shadow.ts";
export { projectPersistableTaskStatePatch } from "./persistence-projection.ts";
export { evaluateTaskActionAuthority } from "./action-authority.ts";
export { createEngineRolloverPlan, engineRolloverPlanHasMutations } from "./rollover-authority.ts";
export type { EngineRolloverPlan, EngineRolloverTaskPlan } from "./rollover-authority.ts";
export { buildRecurringDateRepairReport, RECURRING_DATE_REPAIR_TASK_IDS } from "./recurring-date-repair-report.ts";
export type { RecurringDateRepairReport, RecurringDateRepairTaskReport } from "./recurring-date-repair-report.ts";
export { resolveTaskHistoryCalendarActionStatuses, resolveTaskHistoryCalendarStates } from "./calendar-authority.ts";
export {
  projectTasksForActiveStatusRead,
  resolveActiveTaskStatuses,
  TASK_STATE_ENGINE_INTEGRATION_ENABLED,
  TASK_STATE_ENGINE_ACTIVE_STATUS_READ_ENABLED,
} from "./read-authority.ts";
export type * from "./types.ts";
