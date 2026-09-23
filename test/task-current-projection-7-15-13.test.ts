import assert from "node:assert/strict";
import test from "node:test";

import { createTask } from "../src/lib/task-buckets.ts";
import type {
  Task,
  TaskBehaviorSelection,
} from "../src/lib/database.types.ts";
import {
  buildCurrentTaskProjection,
  isCurrentTaskProjectionFingerprint,
  type BuildCurrentTaskProjectionInput,
} from "../src/lib/task-current-projection.ts";
import { buildTaskHistoryLastHandledSummaryMap } from "../src/lib/task-history-last-handled.ts";
import { getTaskHistoryLastDone } from "../src/lib/task-history.ts";
import { mapCanonicalTaskHistoryFacts } from "../src/lib/task-state-canonical/history-projection.ts";
import { buildCanonicalTaskStateEngineInput } from "../src/lib/task-state-canonical/engine-input.ts";
import type { CanonicalTaskStateReadModel } from "../src/lib/task-state-canonical/read-model.ts";
import type {
  CanonicalTaskCalendarOverride,
  CanonicalTaskHistoryFact,
  CanonicalTaskOccurrence,
  CanonicalTaskOccurrenceEffectiveOverride,
  CanonicalTaskScheduleBoundary,
} from "../src/lib/task-state-canonical/types.ts";
import { projectTaskWithCanonicalScheduleBoundary } from "../src/lib/task-state-canonical/schedule-projection.ts";
import { evaluateTaskState } from "../src/lib/task-state-engine/engine.ts";
import {
  STANDARD_TASK_BEHAVIOR_POLICY,
  type TaskBehaviorPolicyResolutionContext,
} from "../src/lib/task-state-engine/behavior-policy.ts";
import { buildTaskHistoryStreakSummary } from "../src/lib/task-history-streak-summaries.ts";

const NOW = "2026-09-23T12:00:00.000Z";
const TIMEZONE = "UTC";
const DAY_START = "00:00";

function boundaryFor(task: Task, overrides: Partial<CanonicalTaskScheduleBoundary> = {}): CanonicalTaskScheduleBoundary {
  const scheduleModel = task.due_on === null && task.repeat_frequency === "none"
    ? "unscheduled"
    : task.repeat_frequency === "none"
      ? "one_time"
      : task.repeat_frequency === "weekly" || task.repeat_frequency === "monthly"
        ? "fixed"
        : "rolling";
  return {
    id: `boundary-${task.id}`,
    user_id: task.user_id,
    entity_id: task.id,
    entity_kind: "parent",
    effective_from_logical_date: task.due_on ?? "2026-09-01",
    boundary_sequence: 1,
    boundary_type: "initial",
    schedule_model: scheduleModel,
    repeat_frequency: task.repeat_frequency,
    repeat_interval: task.repeat_interval,
    repeat_days_of_week: [...task.repeat_days_of_week],
    repeat_day_of_month: task.repeat_day_of_month,
    repeat_monthly_mode: task.repeat_monthly_mode,
    repeat_monthly_ordinal: task.repeat_monthly_ordinal,
    repeat_monthly_weekday: task.repeat_monthly_weekday,
    one_time_due_on: scheduleModel === "one_time" ? task.due_on : null,
    due_time: task.due_time,
    anchor_date: scheduleModel === "unscheduled" ? null : task.due_on,
    anchor_kind: scheduleModel === "unscheduled" ? "unknown" : "user_selected",
    anchor_confidence: scheduleModel === "unscheduled" ? "unavailable" : "proven",
    historical_scope_known: true,
    prospective_only: false,
    prior_boundary_id: null,
    affected_occurrence_id: null,
    logical_day_settings_revision: 1,
    timezone: TIMEZONE,
    day_start_time: DAY_START,
    actor_kind: "user",
    actor_id: task.user_id,
    source: "test",
    command_id: null,
    idempotence_identity: `boundary:${task.id}`,
    schema_contract_version: "task-state-schema-v1",
    source_task_revision: task.revision,
    revision: 1,
    created_at: task.created_at,
    updated_at: task.updated_at,
    ...overrides,
  };
}

function canonicalTask(id: string, overrides: Partial<Task> & Record<string, unknown> = {}) {
  const source = createTask({
    id,
    title: id,
    status: "pending",
    created_at: "2026-09-01T12:00:00.000Z",
    sort_order: 0,
    due_on: "2026-09-23",
    ...overrides,
  });
  return {
    ...source,
    canonicalization_status: "canonical_runtime" as const,
    entity_kind: "parent" as const,
    terminal_state: "active" as const,
    container_state: "active" as const,
    prior_container_state: null,
    prior_container_state_status: "not_applicable" as const,
    terminal_completed_at: null,
    container_trashed_at: null,
    workflow_state: "none" as const,
    workflow_started_at: null,
    workflow_logical_date: null,
    workflow_occurrence_id: null,
    workflow_command_id: null,
    workflow_revision: 1,
    canonical_revision: 1,
    canonical_created_at: source.created_at,
    canonical_updated_at: source.updated_at,
    projection_source_canonical_revision: 1,
    projection_source_fingerprint: "canonical-test",
    projection_version: "task-state-projection-v1",
    ...overrides,
  };
}

function occurrence(task: Task, scheduledDueOn: string, overrides: Partial<CanonicalTaskOccurrence> = {}): CanonicalTaskOccurrence {
  return {
    id: `occurrence-${task.id}-${scheduledDueOn}`,
    user_id: task.user_id,
    entity_id: task.id,
    entity_kind: "parent",
    occurrence_key: `task:${task.id}:occurrence:${scheduledDueOn}`,
    scheduled_due_on: scheduledDueOn,
    source_boundary_id: `boundary-${task.id}`,
    recurrence_source_fingerprint: `schedule-${task.id}`,
    origin_kind: "proven",
    origin_confidence: "proven",
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: task.user_id,
    source: "test",
    materialization_reason: "required_command_state",
    resolution_state: "unresolved",
    resolved_logical_date: null,
    resolved_outcome: null,
    resolved_history_id: null,
    command_id: null,
    revision: 1,
    created_at: "2026-09-01T12:00:00.000Z",
    updated_at: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

function historyFact(task: Task, logicalDate: string, outcome: CanonicalTaskHistoryFact["outcome"], overrides: Partial<CanonicalTaskHistoryFact> = {}): CanonicalTaskHistoryFact {
  return {
    id: `fact-${task.id}-${logicalDate}`,
    user_id: task.user_id,
    entity_id: task.id,
    entity_kind: "parent",
    logical_date: logicalDate,
    outcome,
    event_kind: outcome === "complete" ? "terminal_complete" : "explicit_outcome",
    occurrence_id: null,
    scheduled_due_on: null,
    effective_due_on: null,
    schedule_boundary_id: null,
    recurrence_source_fingerprint: null,
    provenance_kind: "user",
    actor_kind: "user",
    actor_id: task.user_id,
    source: "task-state-command",
    logical_day_settings_revision: 1,
    timezone: TIMEZONE,
    day_start_time: DAY_START,
    command_id: null,
    idempotence_identity: `fact:${task.id}:${logicalDate}`,
    source_legacy_history_id: null,
    revision: 1,
    created_at: `${logicalDate}T09:00:00.000Z`,
    updated_at: `${logicalDate}T09:00:00.000Z`,
    ...overrides,
  };
}

function calendarOverride(task: Task, logicalDate: string, overrideState: CanonicalTaskCalendarOverride["override_state"]): CanonicalTaskCalendarOverride {
  return {
    id: `override-${task.id}-${logicalDate}`,
    user_id: task.user_id,
    entity_id: task.id,
    entity_kind: "parent",
    logical_date: logicalDate,
    override_state: overrideState,
    reason: "test",
    is_active: true,
    cleared_at: null,
    cleared_by_command_id: null,
    provenance_kind: "manual",
    actor_kind: "user",
    actor_id: task.user_id,
    source: "task-state-command",
    command_id: null,
    idempotence_identity: `override:${task.id}:${logicalDate}`,
    revision: 1,
    created_at: `${logicalDate}T08:00:00.000Z`,
    updated_at: `${logicalDate}T08:00:00.000Z`,
  };
}

function behaviorSelection(task: Task, effectiveFromLogicalDate: string, customRulesetId: string | null = null): TaskBehaviorSelection {
  return {
    id: `selection-${task.id}-${effectiveFromLogicalDate}`,
    user_id: task.user_id,
    task_id: task.id,
    effective_from_logical_date: effectiveFromLogicalDate,
    task_type: customRulesetId ? "custom" : "task",
    custom_ruleset_id: customRulesetId,
    created_at: `${effectiveFromLogicalDate}T08:00:00.000Z`,
    updated_at: `${effectiveFromLogicalDate}T08:00:00.000Z`,
  };
}

function readModel(
  task: ReturnType<typeof canonicalTask>,
  options: {
    historyFacts?: CanonicalTaskHistoryFact[];
    occurrences?: CanonicalTaskOccurrence[];
    calendarOverrides?: CanonicalTaskCalendarOverride[];
    behaviorSelections?: TaskBehaviorSelection[];
    boundary?: Partial<CanonicalTaskScheduleBoundary>;
  } = {},
) {
  const boundary = boundaryFor(task, {
    entity_kind: task.entity_kind ?? "parent",
    ...options.boundary,
  });
  return {
    task,
    commandOperations: [],
    scheduleBoundaries: [boundary],
    occurrences: options.occurrences ?? [],
    occurrenceEffectiveOverrides: [] as CanonicalTaskOccurrenceEffectiveOverride[],
    historyFacts: options.historyFacts ?? [],
    calendarOverrides: options.calendarOverrides ?? [],
    rewardEntitlements: [],
    rewardGrants: [],
    rewardClaimConsumptions: [],
    behaviorSelections: options.behaviorSelections ?? [],
    logicalDayProfile: { timezone: TIMEZONE, day_start_time: DAY_START, settings_revision: 1 },
  } as unknown as CanonicalTaskStateReadModel;
}

function historyFence(model: CanonicalTaskStateReadModel, sourceRevision = model.historyFacts.length ? 1 : 0): BuildCurrentTaskProjectionInput["historyFence"] {
  return {
    syncEpoch: "00000000-0000-4000-8000-000000000001",
    sourceRevision,
    frontier: sourceRevision > 0 ? {
      sequence: sourceRevision,
      historyFactId: model.historyFacts.at(-1)?.id ?? `delete-${model.task.id}`,
      logicalDate: model.historyFacts.at(-1)?.logical_date ?? "2026-09-22",
      operation: model.historyFacts.length ? "upsert" : "delete",
      rowRevision: model.historyFacts.at(-1)?.revision ?? null,
    } : null,
  };
}

function buildInput(model: CanonicalTaskStateReadModel, context: TaskBehaviorPolicyResolutionContext = {}, options: Partial<Pick<BuildCurrentTaskProjectionInput, "effectiveTrackingExclusion">> = {}): BuildCurrentTaskProjectionInput {
  return {
    readModel: model,
    behaviorContext: context,
    historyFence: historyFence(model),
    projectedAt: NOW,
    ...options,
  };
}

function authoritativeCurrentResult(input: BuildCurrentTaskProjectionInput) {
  const context = {
    ...(input.behaviorContext ?? {}),
    behaviorSelectionsByTaskId: {
      ...(input.behaviorContext?.behaviorSelectionsByTaskId ?? {}),
      [input.readModel.task.id]: (input.readModel.behaviorSelections ?? []).map((selection) => ({
        effectiveFromLogicalDate: selection.effective_from_logical_date,
        taskType: selection.task_type,
        customRulesetId: selection.custom_ruleset_id,
      })),
    },
  } satisfies TaskBehaviorPolicyResolutionContext;
  const engineInput = buildCanonicalTaskStateEngineInput(input.readModel, {
    ...context,
    logicalDayRollover: DAY_START,
    now: NOW,
    timezone: TIMEZONE,
  });
  const evaluated = evaluateTaskState(engineInput);
  const history = mapCanonicalTaskHistoryFacts(input.readModel.historyFacts);
  const lastHandled = buildTaskHistoryLastHandledSummaryMap(
    [input.readModel.task],
    history,
    input.readModel.calendarOverrides,
    input.readModel.commandOperations,
    evaluated.logicalDate,
  )[input.readModel.task.id] ?? null;
  const boundary = input.readModel.scheduleBoundaries[0]!;
  const projectedTask = projectTaskWithCanonicalScheduleBoundary(input.readModel.task, boundary);
  const summary = buildTaskHistoryStreakSummary(projectedTask, history, evaluated.logicalDate, {
    ...context,
    calendarOverrides: input.readModel.calendarOverrides.filter((row) => row.is_active).map((row) => ({
      id: row.id,
      logicalDate: row.logical_date,
      overrideState: row.override_state,
      revision: row.revision,
      source: row.source,
      provenance: row.provenance_kind,
    })),
    effectiveTrackingExclusion: input.effectiveTrackingExclusion ?? input.readModel.task.exclude_from_tracking === true,
    manualActionSummaryByTaskId: { [input.readModel.task.id]: lastHandled },
    logicalDayRollover: DAY_START,
    now: NOW,
    timezone: TIMEZONE,
  });
  const currentEffectiveDueOn = evaluated.timeline.unresolvedDueOn
    ?? evaluated.unresolvedOccurrenceDueOn
    ?? evaluated.timeline.activeOccurrenceDueOn
    ?? null;
  const lastDone = getTaskHistoryLastDone(history, evaluated.logicalDate);
  const lifecycle = input.readModel.task.terminal_state === "permanently_complete"
    ? "complete"
    : input.readModel.task.container_state === "trashed"
      ? "trashed"
      : input.readModel.task.container_state === "archived"
        ? "archived"
        : "active";
  return {
    displayStatus: lifecycle === "active" ? evaluated.activeStatus : lifecycle,
    currentEffectiveDueOn,
    nextDueOn: evaluated.nextDueDate,
    handledCurrentLogicalDay: evaluated.handledCurrentDay,
    lastHandledLogicalDate: lastHandled?.dateKey ?? null,
    lastHandledAt: lastHandled?.timestamp ?? null,
    lastDoneLogicalDate: lastDone?.dateKey ?? summary.lastDoneDate,
    lastDoneAt: lastDone?.timestamp ?? summary.lastDoneAt,
    currentPositiveStreak: summary.currentStreak,
    currentMissedStreak: summary.missedStreak,
  };
}

function scenario(name: string, model: CanonicalTaskStateReadModel, context: TaskBehaviorPolicyResolutionContext = {}, options: Partial<Pick<BuildCurrentTaskProjectionInput, "effectiveTrackingExclusion">> = {}) {
  return { name, input: buildInput(model, context, options) };
}

const scenarios = (() => {
  const unscheduled = canonicalTask("unscheduled", { due_on: null, repeat_frequency: "none" });
  const oneOffPending = canonicalTask("one-off-pending", { due_on: "2026-09-24", repeat_frequency: "none" });
  const oneOffMissed = canonicalTask("one-off-missed", { due_on: "2026-09-20", repeat_frequency: "none" });
  const dailyUpcoming = canonicalTask("daily-upcoming", { due_on: "2026-09-25", repeat_frequency: "daily" });
  const dailyNotDue = canonicalTask("daily-not-due", { due_on: "2026-10-10", repeat_frequency: "daily" });
  const unresolvedMissed = canonicalTask("recurring-unresolved-missed", { due_on: "2026-09-20", repeat_frequency: "daily" });
  const dailyDone = canonicalTask("daily-done", { due_on: "2026-09-23", repeat_frequency: "daily" });
  const didMyBest = canonicalTask("did-my-best", { due_on: "2026-09-23", repeat_frequency: "none" });
  const delayed = canonicalTask("delayed", { due_on: "2026-09-23", repeat_frequency: "daily" });
  const permanentlyComplete = canonicalTask("permanent-complete", { terminal_state: "permanently_complete", due_on: null, status: "pending" });
  const archived = canonicalTask("archived", { container_state: "archived", due_on: null, status: "pending" });
  const trashed = canonicalTask("trashed", { container_state: "trashed", due_on: null, status: "pending" });
  const inProgress = canonicalTask("in-progress", {
    workflow_state: "in_progress",
    workflow_logical_date: "2026-09-23",
    workflow_occurrence_id: "occurrence-in-progress-2026-09-23",
    due_on: "2026-09-23",
    status: "pending",
  });
  const rolling = canonicalTask("rolling", { due_on: "2026-09-20", repeat_frequency: "custom", repeat_interval: 3 });
  const weekly = canonicalTask("weekly", { due_on: "2026-09-21", repeat_frequency: "weekly", repeat_days_of_week: [1] });
  const monthly = canonicalTask("monthly", { due_on: "2026-09-01", repeat_frequency: "monthly", repeat_day_of_month: 1 });
  const dailyUntilComplete = canonicalTask("daily-until-complete", { due_on: "2026-09-20", repeat_frequency: "daily_until_complete" });
  const step = canonicalTask("step", { entity_kind: "step", parent_task_id: "parent" });
  const substep = canonicalTask("substep", { entity_kind: "substep", parent_task_id: "step" });
  const historyCorrection = canonicalTask("history-correction", { due_on: "2026-09-22", repeat_frequency: "daily" });
  const calendar = canonicalTask("calendar-override", { due_on: "2026-09-23", repeat_frequency: "daily" });
  const policyBoundary = canonicalTask("policy-boundary", { due_on: "2026-09-20", repeat_frequency: "daily" });
  const namedCustom = canonicalTask("named-custom", { task_type: "custom", custom_ruleset_id: "practice", due_on: "2026-09-20", repeat_frequency: "daily" });
  const excluded = canonicalTask("excluded", { exclude_from_tracking: true, due_on: "2026-09-22", repeat_frequency: "daily" });
  const missedThenSuccess = canonicalTask("missed-then-success", { due_on: "2026-09-22", repeat_frequency: "daily" });
  const handledToday = canonicalTask("handled-today", { due_on: "2026-09-23", repeat_frequency: "daily" });
  const unhandledToday = canonicalTask("unhandled-today", { due_on: "2026-09-23", repeat_frequency: "daily" });
  const practicePolicy = {
    ...STANDARD_TASK_BEHAVIOR_POLICY,
    id: "practice-policy",
    unresolvedOccurrence: "blank" as const,
  };

  return [
    scenario("unscheduled active", readModel(unscheduled)),
    scenario("one-off pending", readModel(oneOffPending)),
    scenario("one-off Missed", readModel(oneOffMissed, { historyFacts: [historyFact(oneOffMissed, "2026-09-20", "missed", { scheduled_due_on: "2026-09-20" })] })),
    scenario("recurring upcoming", readModel(dailyUpcoming)),
    scenario("recurring not_due", readModel(dailyNotDue)),
    scenario("recurring unresolved Missed", readModel(unresolvedMissed, { historyFacts: [historyFact(unresolvedMissed, "2026-09-20", "missed", { scheduled_due_on: "2026-09-20" })] })),
    scenario("Done", readModel(dailyDone, { historyFacts: [historyFact(dailyDone, "2026-09-23", "done", { scheduled_due_on: "2026-09-23" })] })),
    scenario("Did My Best", readModel(didMyBest, { historyFacts: [historyFact(didMyBest, "2026-09-23", "did_my_best")] })),
    scenario("Delay", readModel(delayed, { historyFacts: [historyFact(delayed, "2026-09-23", "delayed", { scheduled_due_on: "2026-09-23", effective_due_on: "2026-09-26" })] })),
    scenario("permanent Complete", readModel(permanentlyComplete)),
    scenario("Archived", readModel(archived)),
    scenario("Trashed", readModel(trashed)),
    scenario("In Progress", readModel(inProgress, { occurrences: [occurrence(inProgress, "2026-09-23", { id: "occurrence-in-progress-2026-09-23" })] })),
    scenario("Daily", readModel(dailyDone)),
    scenario("rolling multi-day recurrence", readModel(rolling)),
    scenario("weekly fixed recurrence", readModel(weekly)),
    scenario("monthly recurrence", readModel(monthly)),
    scenario("daily_until_complete", readModel(dailyUntilComplete, { historyFacts: [historyFact(dailyUntilComplete, "2026-09-20", "missed", { scheduled_due_on: "2026-09-20" })] })),
    scenario("Step", readModel(step), {}, { effectiveTrackingExclusion: false }),
    scenario("Substep", readModel(substep), {}, { effectiveTrackingExclusion: false }),
    scenario("History correction", readModel(historyCorrection, { historyFacts: [historyFact(historyCorrection, "2026-09-22", "done", { event_kind: "correction", scheduled_due_on: "2026-09-22" })] })),
    scenario("Calendar override", readModel(calendar, { calendarOverrides: [calendarOverride(calendar, "2026-09-23", "not_due")] })),
    scenario("behavior-policy boundary", readModel(policyBoundary, { behaviorSelections: [behaviorSelection(policyBoundary, "2026-09-01"), behaviorSelection(policyBoundary, "2026-09-23")] },), {
      behaviorPolicyRevisions: {
        task: [{ ...STANDARD_TASK_BEHAVIOR_POLICY, effectiveFromLogicalDate: "2026-09-01" }, { ...practicePolicy, effectiveFromLogicalDate: "2026-09-23" }],
      },
    }),
    scenario("named Custom ruleset", readModel(namedCustom, { behaviorSelections: [behaviorSelection(namedCustom, "2026-09-01", "practice")] }), {
      namedCustomRulesetBehaviorPolicyRevisions: {
        practice: [{ ...practicePolicy, effectiveFromLogicalDate: "2026-09-01" }],
      },
    }),
    scenario("tracking exclusion", readModel(excluded, { historyFacts: [historyFact(excluded, "2026-09-22", "done")] })),
    scenario("prior Missed followed by later success", readModel(missedThenSuccess, { historyFacts: [
      historyFact(missedThenSuccess, "2026-09-21", "missed", { scheduled_due_on: "2026-09-21" }),
      historyFact(missedThenSuccess, "2026-09-22", "done", { scheduled_due_on: "2026-09-22" }),
    ] })),
    scenario("current logical-day handled", readModel(handledToday, { historyFacts: [historyFact(handledToday, "2026-09-23", "done")] })),
    scenario("current logical-day unhandled", readModel(unhandledToday)),
  ];
})();

test("7.15.13 projection calculator preserves the current authoritative runtime result", () => {
  for (const scenarioCase of scenarios) {
    const projection = buildCurrentTaskProjection(scenarioCase.input);
    const expected = authoritativeCurrentResult(scenarioCase.input);
    assert.equal(projection.validity, "valid", scenarioCase.name);
    assert.deepEqual({
      displayStatus: projection.display_status,
      currentEffectiveDueOn: projection.current_effective_due_on,
      nextDueOn: projection.next_due_on,
      handledCurrentLogicalDay: projection.handled_current_logical_day,
      lastHandledLogicalDate: projection.last_handled_logical_date,
      lastHandledAt: projection.last_handled_at,
      lastDoneLogicalDate: projection.last_done_logical_date,
      lastDoneAt: projection.last_done_at,
      currentPositiveStreak: projection.current_positive_streak,
      currentMissedStreak: projection.current_missed_streak,
    }, expected, scenarioCase.name);
  }
});

test("projection occurrence identity is canonical-only and status mapping is explicit", () => {
  const noMaterializedOccurrence = buildCurrentTaskProjection(scenarios.find((item) => item.name === "one-off pending")!.input);
  assert.equal(noMaterializedOccurrence.active_occurrence_id, null);
  assert.equal(noMaterializedOccurrence.active_occurrence_status, "none");

  const input = scenarios.find((item) => item.name === "In Progress")!.input;
  const projection = buildCurrentTaskProjection(input);
  assert.equal(projection.active_occurrence_id, "occurrence-in-progress-2026-09-23");
  assert.equal(projection.active_occurrence_status, "open");
});

test("projection fences use colon-prefixed SHA-256 and normalize semantic ordering", () => {
  const first = scenarios.find((item) => item.name === "weekly fixed recurrence")!.input;
  const second = structuredClone(first);
  second.readModel.scheduleBoundaries[0]!.repeat_days_of_week = [1];
  const firstProjection = buildCurrentTaskProjection(first);
  const secondProjection = buildCurrentTaskProjection(second);
  for (const value of [
    firstProjection.history_source_fingerprint,
    firstProjection.schedule_boundary_revision,
    firstProjection.behavior_policy_revision,
    firstProjection.source_fingerprint,
  ]) assert.equal(isCurrentTaskProjectionFingerprint(value), true);
  assert.equal(firstProjection.schedule_boundary_revision, secondProjection.schedule_boundary_revision);
  assert.equal(firstProjection.source_fingerprint, secondProjection.source_fingerprint);
});

test("entity History changes only its own History and source fences", () => {
  const first = scenarios.find((item) => item.name === "one-off pending")!.input;
  const second = structuredClone(first);
  second.readModel.task = { ...second.readModel.task, id: "unrelated-task" } as never;
  const firstProjection = buildCurrentTaskProjection(first);
  const secondProjection = buildCurrentTaskProjection(second);
  assert.notEqual(firstProjection.entity_id, secondProjection.entity_id);
  assert.equal(firstProjection.schedule_boundary_revision, secondProjection.schedule_boundary_revision);

  const withHistory = scenarios.find((item) => item.name === "one-off Missed")!.input;
  const changedHistory = structuredClone(withHistory);
  changedHistory.readModel.historyFacts[0]!.outcome = "done";
  const original = buildCurrentTaskProjection(withHistory);
  const changed = buildCurrentTaskProjection(changedHistory);
  assert.notEqual(original.history_source_fingerprint, changed.history_source_fingerprint);
  assert.notEqual(original.source_fingerprint, changed.source_fingerprint);

  const unrelatedGlobalRevision = structuredClone(first);
  (unrelatedGlobalRevision.historyFence as BuildCurrentTaskProjectionInput["historyFence"] & { globalRevision?: number }).globalRevision = 99;
  assert.equal(
    buildCurrentTaskProjection(first).source_fingerprint,
    buildCurrentTaskProjection(unrelatedGlobalRevision).source_fingerprint,
  );
});

test("schedule, behavior, logical-day, and authoritative timestamp changes fence the source", () => {
  const base = scenarios.find((item) => item.name === "one-off pending")!.input;
  const scheduleChanged = structuredClone(base);
  scheduleChanged.readModel.scheduleBoundaries[0]!.one_time_due_on = "2026-09-25";
  const behaviorChanged = structuredClone(base);
  behaviorChanged.behaviorContext = {
    behaviorPolicyRevisions: {
      task: [{ ...STANDARD_TASK_BEHAVIOR_POLICY, effectiveFromLogicalDate: "2026-01-01", unresolvedOccurrence: "blank" }],
    },
  };
  const settingsChanged = structuredClone(base);
  settingsChanged.readModel.logicalDayProfile.settings_revision = 2;
  settingsChanged.projectedAt = "2026-09-24T12:00:00.000Z";
  const timestampChanged = scenarios.find((item) => item.name === "Done")!.input;
  const timestampChangedCopy = structuredClone(timestampChanged);
  timestampChangedCopy.readModel.historyFacts[0]!.updated_at = "2026-09-23T10:00:00.000Z";
  assert.notEqual(buildCurrentTaskProjection(base).source_fingerprint, buildCurrentTaskProjection(scheduleChanged).source_fingerprint);
  assert.notEqual(buildCurrentTaskProjection(base).behavior_policy_revision, buildCurrentTaskProjection(behaviorChanged).behavior_policy_revision);
  assert.notEqual(buildCurrentTaskProjection(base).source_fingerprint, buildCurrentTaskProjection(settingsChanged).source_fingerprint);
  assert.notEqual(buildCurrentTaskProjection(timestampChanged).source_fingerprint, buildCurrentTaskProjection(timestampChangedCopy).source_fingerprint);

  const oldHistory = scenarios.find((item) => item.name === "prior Missed followed by later success")!.input;
  const oldHistoryTimestampChanged = structuredClone(oldHistory);
  oldHistoryTimestampChanged.readModel.historyFacts[0]!.updated_at = "2026-09-21T10:00:00.000Z";
  assert.equal(
    buildCurrentTaskProjection(oldHistory).source_fingerprint,
    buildCurrentTaskProjection(oldHistoryTimestampChanged).source_fingerprint,
  );
});

test("invalid authority and contradictory occurrence state fail safe", () => {
  const missingSchedule = structuredClone(scenarios.find((item) => item.name === "one-off pending")!.input);
  missingSchedule.readModel.scheduleBoundaries = [];
  assert.equal(buildCurrentTaskProjection(missingSchedule).validity, "unavailable");

  const contradictory = structuredClone(scenarios.find((item) => item.name === "In Progress")!.input);
  contradictory.readModel.occurrences[0]!.resolution_state = "resolved";
  contradictory.readModel.occurrences[0]!.resolved_outcome = null;
  assert.equal(buildCurrentTaskProjection(contradictory).validity, "repair_required");

  const malformedFence = structuredClone(scenarios.find((item) => item.name === "one-off pending")!.input);
  malformedFence.historyFence = { syncEpoch: "", sourceRevision: 0, frontier: null };
  assert.equal(buildCurrentTaskProjection(malformedFence).validity, "unavailable");
});

test("builder does not mutate canonical inputs", () => {
  const input = scenarios.find((item) => item.name === "Calendar override")!.input;
  const before = structuredClone(input);
  buildCurrentTaskProjection(input);
  assert.deepEqual(input, before);
});
