import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKFILL_VERSION,
  MigrationBackfillDiagnostic,
  applyBackfillPlans,
  buildBackfillPackage,
  migrationLeaseExpiresAt,
  parseBackfillCliArgs,
  sourceFingerprintsChanged,
} from "../scripts/task-state-migration-backfill.ts";
import {
  OWNER_APPROVED_HISTORY_EXCLUSION,
  emptySourceEvidence,
  type LegacyRow,
  type MigrationSourceEvidence,
} from "../scripts/task-state-migration-dry-run.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const CANONICAL_TIME = "2026-08-08T12:00:00.000Z";

function task(id: string, overrides: LegacyRow = {}): LegacyRow {
  return {
    id,
    user_id: USER_ID,
    parent_task_id: null,
    revision: 1,
    status: "pending",
    due_on: null,
    due_time: null,
    repeat_frequency: "none",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    active_status_logical_date: null,
    active_occurrence_due_on: null,
    completed_at: null,
    trashed_at: null,
    updated_at: CANONICAL_TIME,
    ...overrides,
  };
}

function history(id: string, taskId: string, status: string, date = "2026-08-07", overrides: LegacyRow = {}): LegacyRow {
  return {
    id,
    task_id: taskId,
    user_id: USER_ID,
    entry_date: date,
    occurrence_key: null,
    occurrence_due_on: null,
    status,
    event_type: "status",
    counted_as_due_occurrence: false,
    was_completed: ["done", "did_my_best", "complete"].includes(status),
    created_at: "2026-08-07T12:00:00.000Z",
    updated_at: "2026-08-07T12:00:00.000Z",
    ...overrides,
  };
}

function sources(tasks: LegacyRow[], historyRows: LegacyRow[] = [], overrides: Partial<MigrationSourceEvidence> = {}): MigrationSourceEvidence {
  return {
    ...emptySourceEvidence(),
    tasks,
    history: historyRows,
    profile: { user_id: USER_ID, timezone: "America/New_York", day_start_time: "06:00", settings_revision: 1 },
    ...overrides,
  };
}

function packageFor(tasks: LegacyRow[], historyRows: LegacyRow[] = [], options: Parameters<typeof buildBackfillPackage>[2] = {}) {
  return buildBackfillPackage(sources(tasks, historyRows), USER_ID, {
    logicalDate: "2026-08-08",
    canonicalizationTime: CANONICAL_TIME,
    ...options,
  });
}

test("forward schedule snapshot covers unscheduled, one-time, rolling, weekly fixed, and monthly fixed", () => {
  const result = packageFor([
    task("unscheduled"),
    task("one-time", { due_on: "2026-08-10" }),
    task("rolling", { due_on: "2026-08-08", repeat_frequency: "daily", repeat_interval: 2 }),
    task("weekly", { due_on: "2026-08-09", repeat_frequency: "weekly", repeat_interval: 2, repeat_days_of_week: [] }),
    task("monthly", { due_on: "2026-08-15", repeat_frequency: "monthly", repeat_interval: 1, repeat_day_of_month: null }),
  ]);
  assert.equal(result.report.tasksReadyForCanonicalInitialization, 5);
  assert.equal(result.report.prospectiveBoundariesPlanned, 5);
  assert.deepEqual(result.plans.find((plan) => plan.entityId === "unscheduled")?.scheduleBoundary?.scheduleModel, "unscheduled");
  assert.deepEqual(result.plans.find((plan) => plan.entityId === "one-time")?.scheduleBoundary?.oneTimeDueOn, "2026-08-10");
  assert.deepEqual(result.plans.find((plan) => plan.entityId === "weekly")?.scheduleBoundary?.repeatDaysOfWeek, [0]);
  assert.deepEqual(result.plans.find((plan) => plan.entityId === "monthly")?.scheduleBoundary?.repeatDayOfMonth, 15);
  assert.ok(result.plans.every((plan) => plan.scheduleBoundary?.prospectiveOnly === true));
});

test("current Complete and stale Complete projections use the current Task snapshot", () => {
  const result = packageFor([
    task("complete", { status: "complete", completed_at: "2026-08-01T12:00:00.000Z" }),
    task("stale-complete", { status: "pending", completed_at: "2026-08-01T12:00:00.000Z" }),
  ]);
  const complete = result.plans.find((plan) => plan.entityId === "complete")!;
  const stale = result.plans.find((plan) => plan.entityId === "stale-complete")!;
  assert.equal(complete.canonicalTask?.terminalState, "permanently_complete");
  assert.equal(complete.canonicalTask?.terminalCompletedAt, "2026-08-01T12:00:00.000Z");
  assert.equal(stale.canonicalTask?.terminalState, "active");
  assert.equal(stale.canonicalTask?.terminalCompletedAt, null);
  assert.equal(result.report.tasksNeedingAttention, 0);
});

test("inactive malformed recurrence can quarantine without inventing a schedule boundary", () => {
  const completeId = "complete-without-anchor";
  const trashedId = "trashed-without-anchor";
  const result = packageFor([
    task(completeId, {
      status: "complete",
      completed_at: "2026-08-01T12:00:00.000Z",
      repeat_frequency: "weekly",
      repeat_days_of_week: [7],
      due_on: "2026-08-10",
    }),
    task(trashedId, {
      status: "trashed",
      trashed_at: "2026-08-01T12:00:00.000Z",
      repeat_frequency: "weekly",
      repeat_days_of_week: [7],
      due_on: "2026-08-10",
    }),
  ]);
  const complete = result.plans.find((plan) => plan.entityId === completeId)!;
  const trashed = result.plans.find((plan) => plan.entityId === trashedId)!;
  assert.equal(complete.ready, true);
  assert.equal(complete.canonicalTask?.terminalState, "permanently_complete");
  assert.equal(complete.scheduleBoundary, null);
  assert.ok(complete.issues.some((issue) => issue.classification === "INACTIVE_SCHEDULE_REPAIR_REQUIRED_BEFORE_REACTIVATION" && issue.severity === "warning"));
  assert.equal(trashed.ready, true);
  assert.equal(trashed.canonicalTask?.containerState, "trashed");
  assert.equal(trashed.scheduleBoundary, null);
  assert.ok(trashed.issues.some((issue) => issue.classification === "TRASHED_SCHEDULE_REPAIR_REQUIRED_BEFORE_RESTORE" && issue.severity === "warning"));
});

test("owner-approved lifecycle dispositions remain visible while snapshot state stays authoritative", () => {
  const completeId = "preserved-complete";
  const staleId = "reset-stale-complete";
  const result = packageFor([
    task(completeId, { status: "complete", completed_at: "2026-08-01T12:00:00.000Z" }),
    task(staleId, { status: "pending", completed_at: "2026-08-01T12:00:00.000Z" }),
  ], [], {
    entityDispositions: {
      [completeId]: { ...OWNER_APPROVED_HISTORY_EXCLUSION, preserveCurrentCompleteProjection: true },
      [staleId]: { ...OWNER_APPROVED_HISTORY_EXCLUSION, resetStaleLegacyCompleteProjection: true },
    },
  });
  assert.equal(result.plans.find((plan) => plan.entityId === completeId)?.classification?.lifecycleProjectionDisposition, "owner_approved_complete_preserved");
  assert.equal(result.plans.find((plan) => plan.entityId === staleId)?.classification?.lifecycleProjectionDisposition, "owner_approved_stale_complete_reset");
  assert.equal(result.plans.find((plan) => plan.entityId === staleId)?.canonicalTask?.terminalState, "active");
});

test("Trashed without trustworthy prior container stays canonical with unknown prior state", () => {
  const plan = packageFor([task("trashed", { status: "trashed", trashed_at: "2026-08-07T12:00:00.000Z" })]).plans[0]!;
  assert.equal(plan.ready, true);
  assert.equal(plan.canonicalTask?.containerState, "trashed");
  assert.equal(plan.canonicalTask?.priorContainerState, null);
  assert.equal(plan.canonicalTask?.priorContainerStateStatus, "unknown");
  assert.equal(plan.canonicalTask?.containerTrashedAt, "2026-08-07T12:00:00.000Z");
});

test("current Done and Did My Best preserve today's handled behavior with minimum facts", () => {
  const result = packageFor([
    task("done", { status: "done", active_status_logical_date: "2026-08-08" }),
    task("best", { status: "did_my_best", active_status_logical_date: "2026-08-08" }),
  ]);
  assert.deepEqual(
    result.plans.map((plan) => plan.currentDayHistoryFacts[0]?.outcome).sort(),
    ["done", "did_my_best"].sort(),
  );
  assert.equal(result.report.currentDayHistoryFactsPlanned, 2);
  assert.ok(result.plans.every((plan) => plan.occurrences.length === 0 && plan.delayOverrides.length === 0));
  assert.equal(result.report.occurrencesPlanned, 0);
  assert.equal(result.report.delayOverridesPlanned, 0);
  assert.equal(result.report.historicalRewardRecordsPlanned, 0);
});

test("current Missed creates no automatic canonical Missed History", () => {
  const taskId = "missed";
  const plan = packageFor([task(taskId, { status: "missed" })], [history("missed-history", taskId, "missed")]).plans[0]!;
  assert.deepEqual(plan.currentDayHistoryFacts, []);
  assert.notEqual(plan.legacyHistoryEvidence[0]?.classification, "automatic_missed");
  assert.equal(plan.rewardObjects.length, 0);
});

test("current In Progress without representable canonical command provenance fails closed", () => {
  const plan = packageFor([task("in-progress", {
    status: "in_progress",
    active_status_logical_date: "2026-08-08",
    in_progress_started_at: "2026-08-08T10:00:00.000Z",
  })]).plans[0]!;
  assert.equal(plan.ready, false);
  assert.ok(plan.issues.some((issue) => issue.classification === "IN_PROGRESS_FIELDS_CONTRADICTORY"));
  assert.equal(plan.canonicalTask, null);
});

test("owner-approved stale workflow reset initializes normal workflow state", () => {
  const taskId = "stale-workflow-reset";
  const plan = packageFor([task(taskId, {
    status: "missed",
    due_on: "2026-08-10",
    repeat_frequency: "weekly",
    repeat_interval: 2,
    repeat_days_of_week: [1],
    active_status_logical_date: "2026-08-06",
    active_occurrence_due_on: "2026-08-06",
  })], [
    history("stale-old-done", taskId, "done", "2026-08-01"),
    history("stale-old-delay", taskId, "delayed", "2026-08-02", { occurrence_due_on: "2026-08-02" }),
  ], {
    entityDispositions: { [taskId]: { ...OWNER_APPROVED_HISTORY_EXCLUSION, resetStaleLegacyWorkflowProjection: true } },
  }).plans[0]!;
  assert.equal(plan.ready, true);
  assert.equal(plan.canonicalTask?.workflowState, "none");
  assert.equal(plan.classification?.workflowProjectionDisposition, "owner_approved_reset");
});

test("a prior Delay is represented by the current prospective schedule only", () => {
  const taskId = "delayed-current";
  const plan = packageFor([
    task(taskId, { status: "pending", due_on: "2026-08-12", repeat_frequency: "weekly", repeat_days_of_week: [3] }),
  ], [history("delay-history", taskId, "delayed", "2026-08-07", { occurrence_due_on: "2026-08-07" })]).plans[0]!;
  assert.equal(plan.ready, true);
  assert.equal(plan.scheduleBoundary?.anchorKind, "migration_prospective");
  assert.deepEqual(plan.delayOverrides, []);
  assert.deepEqual(plan.occurrences, []);
});

test("legacy History is copied as raw evidence and owner exclusion suppresses canonical reconstruction", () => {
  const excludedId = "excluded-history";
  const retainedId = "retained-history";
  const result = packageFor([
    task(excludedId, { active_status_logical_date: "2026-08-08", status: "done" }),
    task(retainedId, { active_status_logical_date: "2026-08-08", status: "done" }),
  ], [
    history("excluded-row", excludedId, "done", "2026-08-08", { source_marker: "preserve-me" }),
    history("retained-row", retainedId, "done", "2026-08-07"),
  ]);
  const excluded = buildBackfillPackage(sources([
    task(excludedId, { active_status_logical_date: "2026-08-08", status: "done" }),
  ], [history("excluded-row", excludedId, "done", "2026-08-08", { source_marker: "preserve-me" })]), USER_ID, {
    logicalDate: "2026-08-08",
    canonicalizationTime: CANONICAL_TIME,
    entityDispositions: { [excludedId]: OWNER_APPROVED_HISTORY_EXCLUSION },
  });
  assert.equal(result.report.legacyHistoryEvidenceRowsPlanned, 2);
  assert.equal(result.plans.find((plan) => plan.entityId === excludedId)?.legacyHistoryEvidence[0]?.sourceSnapshot.source_marker, "preserve-me");
  assert.deepEqual(excluded.plans[0]?.currentDayHistoryFacts, []);
  assert.equal(excluded.plans[0]?.classification?.historyDisposition, "owner_approved_excluded");
});

test("raw was_completed remains false when legacy status is handled", () => {
  const taskId = "raw-history-values";
  const plan = packageFor([task(taskId)], [history("raw-history", taskId, "done", "2026-08-07", { was_completed: false })]).plans[0]!;
  assert.equal(plan.legacyHistoryEvidence[0]?.legacyWasCompleted, false);
  assert.equal(plan.legacyHistoryEvidence[0]?.sourceSnapshot.was_completed, false);
});

test("missing raw History values are reported instead of manufactured", () => {
  const taskId = "malformed-history-values";
  const plan = packageFor([task(taskId)], [history("malformed-history", taskId, "done", "2026-08-07", { updated_at: undefined })]).plans[0]!;
  assert.equal(plan.ready, false);
  assert.ok(plan.issues.some((issue) => issue.classification === "MALFORMED_LEGACY_HISTORY" && issue.severity === "blocking"));
  assert.equal(plan.legacyHistoryEvidence[0]?.legacyUpdatedAt, null);
});

test("malformed active and trashed recurrence fail closed without normalized guesses", () => {
  const active = packageFor([task("bad-active", { status: "pending", due_on: "2026-08-10", repeat_frequency: "weekly", repeat_days_of_week: [7] })]).plans[0]!;
  const trashed = packageFor([task("bad-trashed", { status: "trashed", trashed_at: "2026-08-01T12:00:00.000Z", due_on: "2026-08-10", repeat_frequency: "weekly", repeat_days_of_week: [7] })]).plans[0]!;
  assert.equal(active.ready, false);
  assert.ok(active.issues.some((issue) => issue.classification === "INVALID_RECURRENCE_CONFIGURATION"));
  assert.equal(trashed.ready, true);
  assert.equal(trashed.scheduleBoundary, null);
  assert.ok(trashed.issues.some((issue) => issue.classification === "TRASHED_SCHEDULE_REPAIR_REQUIRED_BEFORE_RESTORE" && issue.severity === "warning"));
});

test("retry identity is deterministic and applying a dry-run plan performs no writes", async () => {
  const packageResult = packageFor([task("retry", { due_on: "2026-08-10" })]);
  const plan = packageResult.plans[0]!;
  const calls: Record<string, unknown>[] = [];
  const client = { rpc: async (_name: string, args: Record<string, unknown>) => { calls.push(args); return { data: { state: "already_committed" }, error: null }; } };
  await applyBackfillPlans(client, [plan], { leaseToken: "lease", leaseOwner: "owner", leaseExpiresAt: CANONICAL_TIME });
  await applyBackfillPlans(client, [plan], { leaseToken: "lease", leaseOwner: "owner", leaseExpiresAt: CANONICAL_TIME });
  assert.equal(calls[0]?.p_plan && (calls[0].p_plan as BackfillPlanLike).operationIdentity, (calls[1]?.p_plan as BackfillPlanLike).operationIdentity);
  assert.equal(packageResult.report.occurrencesPlanned, 0);
  assert.equal(packageResult.report.historicalRewardRecordsPlanned, 0);
});

type BackfillPlanLike = { operationIdentity: string };

test("source drift is detectable and does not become a completed run", () => {
  assert.equal(sourceFingerprintsChanged({ tasks: "a", history: "b", rewards: "c" }, { tasks: "a", history: "x", rewards: "c" }), true);
  assert.equal(sourceFingerprintsChanged({ tasks: "a", history: "b", rewards: "c" }, { tasks: "a", history: "b", rewards: "c" }), false);
  assert.equal(sourceFingerprintsChanged({ tasks: "a", history: "b", rewards: "c" }, { tasks: "a", history: "b", rewards: "changed" }), false);
});

test("lease expiry is refreshed from a stable run clock for each bounded group", () => {
  assert.equal(migrationLeaseExpiresAt(Date.parse("2026-08-08T12:00:00.000Z")), "2026-08-08T12:10:00.000Z");
  assert.equal(migrationLeaseExpiresAt(Date.parse("2026-08-08T12:10:00.000Z")), "2026-08-08T12:20:00.000Z");
});

test("backfill RPC groups request a fresh lease expiry while retaining token and owner", async () => {
  const plans = packageFor([task("lease-a"), task("lease-b")]).plans;
  const calls: Array<{ expiration: unknown; token: unknown; owner: unknown }> = [];
  let now = Date.parse("2026-08-08T12:00:00.000Z");
  const client = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      calls.push({ expiration: args.p_lease_expires_at, token: args.p_lease_token, owner: args.p_lease_owner });
      return { data: { state: "committed" }, error: null };
    },
  };
  await applyBackfillPlans(client, plans, {
    leaseToken: "lease-token",
    leaseOwner: "lease-owner",
    leaseExpiresAt: () => migrationLeaseExpiresAt((now += 60_000)),
  });
  assert.deepEqual(calls, [
    { expiration: "2026-08-08T12:11:00.000Z", token: "lease-token", owner: "lease-owner" },
    { expiration: "2026-08-08T12:12:00.000Z", token: "lease-token", owner: "lease-owner" },
  ]);
});

test("cross-user source scope is rejected before plan construction", () => {
  assert.throws(
    () => packageFor([task("foreign", { user_id: OTHER_USER_ID })]),
    (error: unknown) => error instanceof MigrationBackfillDiagnostic && error.code === "CROSS_USER_SCOPE_REJECTED",
  );
});

test("write mode requires explicit authorization and dry run is the default", () => {
  const dryRun = parseBackfillCliArgs(["--user-id", USER_ID]);
  assert.equal(dryRun.execute, false);
  assert.equal(dryRun.userId, USER_ID);
  assert.throws(
    () => parseBackfillCliArgs(["--user-id", USER_ID, "--write"]),
    (error: unknown) => error instanceof MigrationBackfillDiagnostic && error.code === "WRITE_MODE_REJECTED",
  );
  assert.equal(BACKFILL_VERSION, "task-state-migration-backfill-v1");
});
