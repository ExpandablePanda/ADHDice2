import assert from "node:assert/strict";
import test from "node:test";
import {
  CLASSIFIER_VERSION,
  MigrationClassifierDiagnostic,
  SCHEMA_CONTRACT_VERSION,
  buildMigrationRunReport,
  classifyUser,
  deriveCurrentLogicalDate,
  emptySourceEvidence,
  fingerprintEvidence,
  loadAuthenticatedOwnerScopedEvidence,
  type LegacyRow,
  type MigrationSourceEvidence,
} from "../scripts/task-state-migration-dry-run.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function task(overrides: LegacyRow = {}): LegacyRow {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    user_id: USER_ID,
    parent_task_id: null,
    status: "pending",
    due_on: null,
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
    updated_at: "2026-08-08T12:00:00Z",
    ...overrides,
  };
}

function sources(tasks: LegacyRow[], history: LegacyRow[] = [], overrides: Partial<MigrationSourceEvidence> = {}): MigrationSourceEvidence {
  return {
    ...emptySourceEvidence(),
    tasks,
    history,
    profile: { user_id: USER_ID, timezone: "America/New_York", day_start_time: "06:00" },
    ...overrides,
  };
}

function oneEntity(s: MigrationSourceEvidence, logicalDate = "2026-08-08") {
  return classifyUser(s, { userId: USER_ID, logicalDate, classifierVersion: CLASSIFIER_VERSION, schemaContractVersion: SCHEMA_CONTRACT_VERSION }).entities[0];
}

function historicalDailyScheduleEvent(taskId: string): LegacyRow {
  return {
    id: `schedule-${taskId}`,
    task_id: taskId,
    user_id: USER_ID,
    event_type: "schedule_boundary",
    effective_from_logical_date: "2026-08-08",
    schedule_snapshot: { repeat_frequency: "daily", repeat_interval: 1 },
  };
}

test("unauthenticated and owner-mismatched identities are rejected before owner reads", async () => {
  for (const identity of [
    { data: { user: null }, error: null, code: "AUTHENTICATION_REQUIRED" },
    { data: { user: { id: "22222222-2222-4222-8222-222222222222" } }, error: null, code: "OWNER_IDENTITY_MISMATCH" },
  ]) {
    let readCount = 0;
    const client = {
      auth: { getUser: async () => ({ data: identity.data, error: identity.error }) },
      from: () => {
        readCount += 1;
        throw new Error("owner read should not execute");
      },
    };
    await assert.rejects(
      () => loadAuthenticatedOwnerScopedEvidence(client as never, USER_ID, "user-access-token", 10),
      (error: unknown) => error instanceof MigrationClassifierDiagnostic && error.code === identity.code,
    );
    assert.equal(readCount, 0);
  }
});

test("current Logical Day uses profile timezone and configured day-start", () => {
  const profile = sources([]).profile;
  assert.equal(deriveCurrentLogicalDate(profile, "2026-08-08T09:59:00Z"), "2026-08-07");
  assert.equal(deriveCurrentLogicalDate(profile, "2026-08-08T10:00:00Z"), "2026-08-08");
});

test("a future due date cannot become the current Logical Day", () => {
  const report = classifyUser(sources([task({ due_on: "2026-08-20" })]), {
    userId: USER_ID,
    currentInstant: "2026-08-08T12:00:00Z",
    classifierVersion: CLASSIFIER_VERSION,
    schemaContractVersion: SCHEMA_CONTRACT_VERSION,
  });
  assert.equal(report.logicalDate, "2026-08-08");
});

test("missing profile context does not invent a Logical Day", () => {
  const report = classifyUser({ ...sources([task()]), profile: null }, { userId: USER_ID });
  assert.equal(report.logicalDate, null);
  assert.equal(report.eligibility.commandCutoverEligible, false);
  assert.ok(report.entities[0]?.blockingIssueCodes.includes("INVALID_LOGICAL_DAY_SETTINGS"));
});

test("none plus no due is unscheduled, while none plus due is one-time", () => {
  const unscheduled = oneEntity(sources([task({ id: "task-unscheduled" })]));
  const oneTime = oneEntity(sources([task({ id: "task-one-time", due_on: "2026-08-10" })]));
  assert.equal(unscheduled.scheduleModel, "unscheduled");
  assert.equal(oneTime.scheduleModel, "one_time");
  assert.equal(oneTime.anchor.classification, "proven");
});

test("daily/custom/daily-until-complete are rolling and valid weekly/monthly rules are fixed", () => {
  const rolling = oneEntity(sources([task({ repeat_frequency: "daily", due_on: "2026-08-08" })]));
  const fixedWeekly = oneEntity(sources([task({ id: "weekly", repeat_frequency: "weekly", due_on: "2026-08-10", repeat_days_of_week: [1] })]));
  const fixedMonthly = oneEntity(sources([task({ id: "monthly", repeat_frequency: "monthly", due_on: "2026-08-15", repeat_day_of_month: 15 })]));
  assert.equal(rolling.scheduleModel, "rolling");
  assert.equal(fixedWeekly.scheduleModel, "fixed");
  assert.equal(fixedMonthly.scheduleModel, "fixed");
});

test("malformed recurrence is ambiguous and stale fields do not create a fifth model", () => {
  const malformed = oneEntity(sources([task({ repeat_frequency: "weekly", due_on: "2026-08-10", repeat_days_of_week: [7] })]));
  const stale = oneEntity(sources([task({ repeat_frequency: "none", due_on: null, repeat_days_of_week: [1], repeat_day_of_month: 15 })]));
  assert.equal(malformed.scheduleModel, "ambiguous");
  assert.ok(malformed.blockingIssueCodes.includes("INVALID_RECURRENCE_CONFIGURATION"));
  assert.equal(stale.scheduleModel, "unscheduled");
});

test("automatic Missed remains compatibility evidence while explicit Missed is promotable", () => {
  const missedTask = task({ id: "missed-task", repeat_frequency: "daily", due_on: "2026-08-08" });
  const explicitTask = task({ id: "explicit-missed", repeat_frequency: "daily", due_on: "2026-08-08" });
  const report = classifyUser(sources([missedTask, explicitTask], [
    { id: "history-auto", task_id: missedTask.id, user_id: USER_ID, entry_date: "2026-08-07", status: "missed", event_type: "status" },
    { id: "history-explicit", task_id: explicitTask.id, user_id: USER_ID, entry_date: "2026-08-07", status: "missed", event_type: "status", actor_kind: "user" },
  ], { rolloverEvidence: [{ user_id: USER_ID, task_id: missedTask.id, logical_date: "2026-08-07" }] }), { userId: USER_ID, logicalDate: "2026-08-08" });
  const automatic = report.entities.find((entity) => entity.entityId === missedTask.id)!;
  const explicit = report.entities.find((entity) => entity.entityId === explicitTask.id)!;
  assert.equal(automatic.historyClassifications[0]?.classification, "automatic_missed");
  assert.equal(automatic.historyClassifications[0]?.canonicalEligible, false);
  assert.equal(explicit.historyClassifications[0]?.classification, "explicit");
  assert.equal(explicit.historyClassifications[0]?.canonicalEligible, true);
});

test("Done, Did My Best, and Delayed without writer proof remain ambiguous", () => {
  for (const status of ["done", "did_my_best", "delayed"]) {
    const entity = oneEntity(sources([task({ id: `ambiguous-${status}` })], [{
      id: `history-${status}`,
      task_id: `ambiguous-${status}`,
      user_id: USER_ID,
      entry_date: "2026-08-08",
      status,
      event_type: "status",
    }]));
    assert.equal(entity.historyClassifications[0]?.classification, "ambiguous");
    assert.equal(entity.historyClassifications[0]?.canonicalEligible, false);
    assert.equal(entity.historyClassifications[0]?.confidence, "not_promotable");
  }
});

test("proven writer context promotes explicit Done, Did My Best, and Delayed History", () => {
  for (const status of ["done", "did_my_best", "delayed"]) {
    const id = `proven-${status}`;
    const entity = oneEntity(sources([task({ id })], [{
      id: `history-${status}`,
      task_id: id,
      user_id: USER_ID,
      entry_date: "2026-08-08",
      status,
      event_type: "status",
      actor_kind: "user",
    }]));
    assert.equal(entity.historyClassifications[0]?.classification, "explicit");
    assert.equal(entity.historyClassifications[0]?.canonicalEligible, true);
  }
});

test("unknown recurrence anchor stays prospective or ambiguous, never historical proven", () => {
  const prospective = oneEntity(sources([task({ repeat_frequency: "daily", due_on: "2026-08-12" })]));
  const ambiguous = oneEntity(sources([task({ repeat_frequency: "daily", due_on: null })]));
  assert.equal(prospective.anchor.classification, "prospective");
  assert.notEqual(prospective.anchor.classification, "proven");
  assert.equal(ambiguous.anchor.classification, "ambiguous");
});

test("matching occurrence identity reconstructs a high-confidence occurrence and anchor", () => {
  const id = "occurrence-task";
  const entity = oneEntity(sources([task({ id, repeat_frequency: "daily", due_on: "2026-08-10" })], [{
    id: "occurrence-history",
    task_id: id,
    user_id: USER_ID,
    entry_date: "2026-08-08",
    status: "done",
    event_type: "status",
    actor_kind: "user",
    occurrence_due_on: "2026-08-08",
    occurrence_key: `task:${id}:occurrence:2026-08-08`,
  }], { taskEvents: [historicalDailyScheduleEvent(id)] }));
  assert.equal(entity.occurrenceClassifications[0]?.classification, "proven");
  assert.equal(entity.anchor.classification, "reconstructable");
  assert.equal(entity.anchor.confidence, "high_confidence");
});

test("a changed current recurrence rule cannot manufacture a historical anchor", () => {
  const id = "changed-recurrence";
  const entity = oneEntity(sources([task({ id, repeat_frequency: "daily", due_on: "2026-08-08" })], [{
    id: "old-occurrence",
    task_id: id,
    user_id: USER_ID,
    entry_date: "2026-08-08",
    status: "done",
    event_type: "status",
    actor_kind: "user",
    occurrence_due_on: "2026-08-08",
    occurrence_key: `task:${id}:occurrence:2026-08-08`,
  }]));
  assert.equal(entity.occurrenceClassifications[0]?.classification, "proven");
  assert.equal(entity.anchor.classification, "ambiguous");
  assert.ok(entity.anchor.evidence.includes("historical_schedule_provenance_unavailable"));
});

test("stale In Progress stays stale and is never reclassified as Did My Best", () => {
  const entity = oneEntity(sources([task({ status: "in_progress", active_status_logical_date: "2026-08-07" })]), "2026-08-08");
  assert.equal(entity.workflowState, "stale");
  assert.ok(entity.blockingIssueCodes.includes("STALE_IN_PROGRESS_NOT_DID_MY_BEST"));
  assert.equal(entity.historyClassifications.some((item) => item.status === "did_my_best"), false);
});

test("hierarchy reports orphan, cycle, and cross-user references", () => {
  const root = task({ id: "root" });
  const orphan = task({ id: "orphan", parent_task_id: "missing-parent" });
  const cycleA = task({ id: "cycle-a", parent_task_id: "cycle-b" });
  const cycleB = task({ id: "cycle-b", parent_task_id: "cycle-a" });
  const crossUserParent = task({ id: "foreign-parent", user_id: "22222222-2222-4222-8222-222222222222" });
  const crossUserChild = task({ id: "cross-user-child", parent_task_id: crossUserParent.id });
  const report = classifyUser(sources([root, orphan, cycleA, cycleB, crossUserParent, crossUserChild]), { userId: USER_ID });
  const orphanEntity = report.entities.find((entity) => entity.entityId === orphan.id)!;
  const cycleEntity = report.entities.find((entity) => entity.entityId === cycleA.id)!;
  const crossEntity = report.entities.find((entity) => entity.entityId === crossUserChild.id)!;
  assert.ok(orphanEntity.blockingIssueCodes.includes("ORPHAN_PARENT_REFERENCE"));
  assert.ok(cycleEntity.blockingIssueCodes.includes("HIERARCHY_CYCLE"));
  assert.ok(crossEntity.blockingIssueCodes.includes("CROSS_USER_PARENT"));
  assert.ok(report.counts.hierarchy.orphan >= 2);
  assert.equal(report.counts.hierarchy.cycle, 2);
});

test("an owner-scoped missing parent is unresolved, not specifically cross-user", () => {
  const child = task({ id: "owner-scoped-child", parent_task_id: "invisible-parent" });
  const entity = oneEntity(sources([child]));
  assert.ok(entity.blockingIssueCodes.includes("ORPHAN_PARENT_REFERENCE"));
  assert.equal(entity.blockingIssueCodes.includes("CROSS_USER_PARENT"), false);
});

test("Delay without a proven origin is ambiguous", () => {
  const entity = oneEntity(sources([task({ repeat_frequency: "daily", due_on: "2026-08-12" })], [
    { id: "delay", task_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", user_id: USER_ID, entry_date: "2026-08-08", status: "delayed", event_type: "status" },
  ]));
  assert.equal(entity.delayState, "ambiguous");
  assert.ok(entity.blockingIssueCodes.includes("DELAY_ORIGIN_OR_TARGET_UNPROVEN"));
});

test("Delay with a proven origin and later target is safe", () => {
  const id = "safe-delay";
  const entity = oneEntity(sources([task({ id, repeat_frequency: "daily", due_on: "2026-08-12" })], [{
    id: "delay-safe",
    task_id: id,
    user_id: USER_ID,
    entry_date: "2026-08-08",
    status: "delayed",
    event_type: "status",
    actor_kind: "user",
    occurrence_due_on: "2026-08-08",
    occurrence_key: `task:${id}:occurrence:2026-08-08`,
    delay_target_on: "2026-08-12",
  }], { taskEvents: [historicalDailyScheduleEvent(id)] }));
  assert.equal(entity.delayState, "safe");
  assert.equal(entity.blockingIssueCodes.includes("DELAY_ORIGIN_OR_TARGET_UNPROVEN"), false);
});

test("Complete followed by active History is a terminal contradiction", () => {
  const id = "complete-contradiction";
  const entity = oneEntity(sources([task({ id, status: "complete", completed_at: "2026-08-01T12:00:00Z" })], [
    { id: "complete-history", task_id: id, user_id: USER_ID, entry_date: "2026-08-01", status: "complete", event_type: "completed_permanently" },
    { id: "later-done", task_id: id, user_id: USER_ID, entry_date: "2026-08-02", status: "done", event_type: "status" },
  ]));
  assert.equal(entity.lifecycleState.terminal, "permanently_complete");
  assert.ok(entity.blockingIssueCodes.includes("COMPLETE_TERMINAL_CONTRADICTION"));
  assert.equal(oneEntity(sources([task({ id: "projection-only", status: "complete", completed_at: "2026-08-01T12:00:00Z" })])).lifecycleState.terminal, "ambiguous");
});

test("success History without economy proof does not become reward entitlement-safe", () => {
  const id = "reward-without-proof";
  const entity = oneEntity(sources([task({ id })], [{ id: "success", task_id: id, user_id: USER_ID, entry_date: "2026-08-08", status: "done", event_type: "status", actor_kind: "user" }]));
  assert.equal(entity.rewardBootstrapState, "none");
  assert.ok(entity.blockingIssueCodes.includes("REWARD_ENTITLEMENT_UNPROVEN"));
  assert.equal(entity.migrationEligibility, "partial");
});

test("legacy Subtask promotion is mapped to the promoted Task rather than the old parent", () => {
  const parentId = "legacy-parent";
  const promotedId = "promoted-task";
  const subtaskId = "legacy-subtask";
  const report = classifyUser(sources([
    task({ id: parentId }),
    task({ id: promotedId }),
  ], [], {
    subtasks: [{ id: subtaskId, task_id: parentId, user_id: USER_ID, parent_subtask_id: null }],
    promotions: [{ legacy_subtask_id: subtaskId, task_id: promotedId, user_id: USER_ID }],
  }), { userId: USER_ID });
  assert.equal(report.counts.legacySubtasks.promoted, 1);
  assert.ok(report.entities.find((entity) => entity.entityId === promotedId)?.blockingIssueCodes.includes("LEGACY_SUBTASK_PROMOTED"));
  assert.equal(report.entities.find((entity) => entity.entityId === parentId)?.blockingIssueCodes.includes("LEGACY_SUBTASK_PROMOTED"), false);
});

test("a proven success claim requires a matching reward roll and date", () => {
  const id = "reward-proof";
  const rollId = "reward-roll";
  const entity = oneEntity(sources([task({ id })], [{ id: "success", task_id: id, user_id: USER_ID, entry_date: "2026-08-08", status: "done", event_type: "status", actor_kind: "user" }], {
    rewardRolls: [{ id: rollId, user_id: USER_ID, reward_date: "2026-08-08", eligible_task_count: 1 }],
    rewardClaims: [{ id: "claim", user_id: USER_ID, task_id: id, reward_roll_id: rollId, reward_date: "2026-08-08" }],
  }));
  assert.equal(entity.rewardBootstrapState, "consumed_proven");
  assert.equal(entity.blockingIssueCodes.includes("REWARD_ENTITLEMENT_UNPROVEN"), false);
});

test("an unavailable required source prevents command-cutover eligibility", () => {
  const report = classifyUser(sources([task()], [], {
    availability: { history: { available: false, code: "HISTORY_READ_FAILED" } },
  }), { userId: USER_ID, logicalDate: "2026-08-08" });
  assert.deepEqual(report.sourceAvailability.history, { available: false, code: "HISTORY_READ_FAILED" });
  assert.equal(report.eligibility.commandCutoverEligible, false);
  assert.ok(report.entities[0]?.blockingIssueCodes.includes("SOURCE_UNAVAILABLE_HISTORY"));
});

test("fingerprints ignore row-return order and global counts reconcile", () => {
  const first = [task({ id: "b" }), task({ id: "a" })];
  const second = [...first].reverse();
  assert.equal(fingerprintEvidence(first), fingerprintEvidence(second));
  const report = buildMigrationRunReport([
    { userId: USER_ID, sources: sources([task({ id: "one" })]), logicalDate: "2026-08-08" },
    { userId: "22222222-2222-4222-8222-222222222222", sources: sources([task({ id: "two", user_id: "22222222-2222-4222-8222-222222222222" })]), logicalDate: "2026-08-08" },
  ], { generatedAt: "2026-08-08T12:00:00.000Z" });
  assert.deepEqual(report.global.counts, {
    ...report.userReports.reduce((total, userReport) => {
      total.taskEntities += userReport.counts.taskEntities;
      return total;
    }, { ...report.global.counts, taskEntities: 0 }),
  });
  assert.equal(report.global.userCount, 2);
  assert.equal(report.global.counts.taskEntities, 2);
  assert.equal(report.entityRecords.length, 2);
});
