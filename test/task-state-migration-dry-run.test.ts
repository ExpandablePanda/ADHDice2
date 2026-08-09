import assert from "node:assert/strict";
import test from "node:test";
import {
  CLASSIFIER_VERSION,
  MigrationClassifierDiagnostic,
  OWNER_APPROVED_HISTORY_EXCLUSION,
  SCHEMA_CONTRACT_VERSION,
  buildMigrationRunReport,
  classifyUser,
  deriveCurrentLogicalDate,
  emptySourceEvidence,
  fingerprintEvidence,
  loadAuthenticatedOwnerScopedEvidence,
  m2TaskSourceSnapshot,
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

test("HH:MM:SS profile day-start matches the equivalent HH:MM Logical Day boundary", () => {
  const minuteProfile = sources([]).profile;
  const secondProfile = { ...minuteProfile, day_start_time: "06:00:00" };
  for (const instant of ["2026-08-08T09:59:00Z", "2026-08-08T10:00:00Z"]) {
    assert.equal(
      deriveCurrentLogicalDate(secondProfile, instant),
      deriveCurrentLogicalDate(minuteProfile, instant),
    );
  }
  assert.equal(deriveCurrentLogicalDate(secondProfile, "2026-08-08T09:59:00Z"), "2026-08-07");
  assert.equal(deriveCurrentLogicalDate(secondProfile, "2026-08-08T10:00:00Z"), "2026-08-08");
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
  assert.equal(malformed.migrationEligibility, "blocked");
  assert.equal(malformed.migrationDisposition, "genuinely_blocked");
  assert.equal(stale.scheduleModel, "unscheduled");
});

test("trashed malformed recurrence stays quarantined and requires repair before restore", () => {
  const legacyTask = task({
    id: "trashed-malformed-recurrence",
    status: "trashed",
    trashed_at: "2026-08-01T12:00:00Z",
    repeat_frequency: "weekly",
    repeat_interval: 1,
    repeat_days_of_week: [7],
    due_on: "2026-08-10",
  });
  const entity = oneEntity(sources([legacyTask]));

  assert.equal(entity.lifecycleState.container, "trashed");
  assert.equal(entity.scheduleModel, "ambiguous");
  assert.equal(entity.anchor.classification, "ambiguous");
  assert.equal(entity.anchor.date, null);
  assert.deepEqual(entity.occurrenceClassifications, []);
  assert.ok(entity.blockingIssueCodes.includes("INVALID_RECURRENCE_CONFIGURATION"));
  assert.ok(entity.anchor.evidence.includes("invalid_recurrence_configuration"));
  assert.ok(entity.anchor.evidence.includes("trashed_recurrence_anchor_requires_restore_repair"));
  assert.equal(entity.anchor.evidence.some((evidence) => evidence.startsWith("prospective_weekday_from_due_on:")), false);
  assert.equal(entity.migrationEligibility, "partial");
  assert.equal(entity.migrationDisposition, "historical_uncertainty_retained");
  assert.equal(legacyTask.due_on, "2026-08-10");
  assert.deepEqual(legacyTask.repeat_days_of_week, [7]);
});

test("trashed recurrence quarantine does not suppress an unrelated ownership blocker", () => {
  const foreignParent = task({ id: "foreign-parent-for-trashed-malformed", user_id: "22222222-2222-4222-8222-222222222222" });
  const id = "trashed-malformed-with-foreign-parent";
  const report = classifyUser(sources([foreignParent, task({
    id,
    parent_task_id: foreignParent.id,
    status: "trashed",
    trashed_at: "2026-08-01T12:00:00Z",
    repeat_frequency: "weekly",
    repeat_interval: 1,
    repeat_days_of_week: [7],
    due_on: "2026-08-10",
  })]), { userId: USER_ID, logicalDate: "2026-08-08", classifierVersion: CLASSIFIER_VERSION, schemaContractVersion: SCHEMA_CONTRACT_VERSION });
  const entity = report.entities.find((candidate) => candidate.entityId === id)!;

  assert.ok(entity.blockingIssueCodes.includes("CROSS_USER_PARENT"));
  assert.equal(entity.migrationEligibility, "blocked");
  assert.equal(entity.migrationDisposition, "genuinely_blocked");
});

test("weekly recurrence with missing weekdays uses due_on only for prospective schedule evidence", () => {
  const entity = oneEntity(sources([task({
    id: "weekly-prospective",
    repeat_frequency: "weekly",
    repeat_interval: 2,
    repeat_days_of_week: [],
    due_on: "2026-08-09",
  })]));
  assert.equal(entity.scheduleModel, "fixed");
  assert.equal(entity.anchor.classification, "prospective");
  assert.ok(entity.anchor.evidence.includes("legacy_weekly_schedule_from_current_due_on"));
  assert.ok(entity.anchor.evidence.includes("prospective_weekday_from_due_on:0"));
  assert.ok(entity.anchor.evidence.includes("historical_scope_unknown"));
  assert.equal(entity.blockingIssueCodes.includes("INVALID_RECURRENCE_CONFIGURATION"), false);
});

test("monthly day-of-month recurrence with missing day uses due_on only for prospective schedule evidence", () => {
  const entity = oneEntity(sources([task({
    id: "monthly-prospective",
    repeat_frequency: "monthly",
    repeat_interval: 1,
    repeat_monthly_mode: "day_of_month",
    repeat_day_of_month: null,
    due_on: "2026-08-15",
  })]));
  assert.equal(entity.scheduleModel, "fixed");
  assert.equal(entity.anchor.classification, "prospective");
  assert.ok(entity.anchor.evidence.includes("legacy_monthly_day_of_month_from_current_due_on"));
  assert.ok(entity.anchor.evidence.includes("prospective_day_of_month_from_due_on:15"));
  assert.ok(entity.anchor.evidence.includes("historical_scope_unknown"));
});

test("prospective recurrence reconstruction never claims historical certainty", () => {
  const entity = oneEntity(sources([task({
    id: "prospective-only",
    repeat_frequency: "weekly",
    repeat_interval: 1,
    repeat_days_of_week: [],
    due_on: "2026-08-09",
  })]));
  assert.equal(entity.anchor.classification, "prospective");
  assert.equal(entity.anchor.confidence, "high_confidence");
  assert.equal(entity.anchor.date, null);
  assert.equal(entity.anchor.evidence.includes("historical_schedule_boundary"), false);
  assert.ok(entity.anchor.evidence.includes("historical_scope_unknown"));
});

test("unknown historical writer provenance is retained without blocking deterministic current and future state", () => {
  const id = "unknown-history-provenance";
  const entity = oneEntity(sources([task({ id, repeat_frequency: "daily", due_on: "2026-08-08" })], [{
    id: "unknown-history",
    task_id: id,
    user_id: USER_ID,
    entry_date: "2026-08-07",
    status: "done",
    event_type: "status",
  }]));
  const history = entity.historyClassifications[0]!;
  assert.equal(history.classification, "ambiguous");
  assert.equal(history.historicalEvidenceEligible, true);
  assert.equal(history.provenance, "unknown");
  assert.equal(entity.migrationEligibility, "partial");
  assert.equal(entity.migrationDisposition, "historical_uncertainty_retained");
  assert.equal(entity.blockingIssueCodes.includes("AMBIGUOUS_HISTORY_PROVENANCE"), true);
});

test("ambiguous Delay remains historical evidence without manufacturing origin or target", () => {
  const id = "ambiguous-delay-history";
  const entity = oneEntity(sources([task({ id, repeat_frequency: "daily", due_on: "2026-08-12" })], [{
    id: "ambiguous-delay",
    task_id: id,
    user_id: USER_ID,
    entry_date: "2026-08-08",
    status: "delayed",
    event_type: "status",
  }]));
  assert.equal(entity.delayState, "ambiguous");
  assert.deepEqual(entity.occurrenceClassifications, []);
  assert.deepEqual(entity.delayEvidence, ["historical_delay_provenance_unknown"]);
  assert.equal(entity.anchor.classification, "prospective");
  assert.equal(entity.migrationEligibility, "partial");
  assert.equal(entity.migrationDisposition, "historical_uncertainty_retained");
});

test("known History outcomes remain useful historical evidence without command provenance", () => {
  const statuses = ["done", "did_my_best", "missed", "complete"] as const;
  const tasks = statuses.map((status) => task({ id: `known-${status}` }));
  const history = statuses.map((status) => ({
    id: `known-history-${status}`,
    task_id: `known-${status}`,
    user_id: USER_ID,
    entry_date: "2026-08-08",
    status,
    event_type: "status",
  }));
  const report = classifyUser(sources(tasks, history), { userId: USER_ID, logicalDate: "2026-08-08" });
  for (const status of statuses) {
    const entity = report.entities.find((candidate) => candidate.entityId === `known-${status}`)!;
    const classification = entity.historyClassifications[0]!;
    assert.equal(classification.historicalEvidenceEligible, true);
    assert.equal(classification.provenance, "unknown");
    assert.equal(classification.canonicalEligible, false);
    assert.notEqual(entity.migrationEligibility, "blocked");
  }
});

test("owner-approved History exclusion preserves the entity and excludes canonical reconstruction", () => {
  const id = "owner-excluded-history";
  const excluded = classifyUser(sources([task({ id })], [
    { id: "excluded-complete", task_id: id, user_id: USER_ID, entry_date: "2026-08-01", status: "complete", event_type: "status" },
    { id: "excluded-done", task_id: id, user_id: USER_ID, entry_date: "2026-08-02", status: "done", event_type: "status" },
  ]), {
    userId: USER_ID,
    logicalDate: "2026-08-08",
    entityDispositions: { [id]: OWNER_APPROVED_HISTORY_EXCLUSION },
  }).entities[0]!;
  assert.equal(excluded.entityId, id);
  assert.deepEqual(excluded.entityDisposition, OWNER_APPROVED_HISTORY_EXCLUSION);
  assert.equal(excluded.historyDisposition, "owner_approved_excluded");
  assert.equal(excluded.migrationDisposition, "owner_approved_history_exclusion");
  assert.equal(excluded.migrationEligibility, "safe");
  assert.equal(excluded.lifecycleState.terminal, "active");
  assert.ok(excluded.historyClassifications.every((item) => item.excludedFromCanonicalReconstruction));
  assert.ok(excluded.historyClassifications.every((item) => item.canonicalEligible === false && item.historicalEvidenceEligible === false));
  assert.deepEqual(excluded.occurrenceClassifications, []);
});

test("History exclusion is keyed by stable entity identity rather than title", () => {
  const excludedId = "same-title-excluded";
  const retainedId = "same-title-retained";
  const report = classifyUser(sources([
    task({ id: excludedId, title: "Gummy Vitamins" }),
    task({ id: retainedId, title: "Gummy Vitamins" }),
  ], [{
    id: "same-title-history",
    task_id: retainedId,
    user_id: USER_ID,
    entry_date: "2026-08-08",
    status: "done",
    event_type: "status",
  }]), {
    userId: USER_ID,
    logicalDate: "2026-08-08",
    entityDispositions: { [excludedId]: OWNER_APPROVED_HISTORY_EXCLUSION },
  });
  assert.equal(report.entities.find((entity) => entity.entityId === excludedId)?.historyDisposition, "owner_approved_excluded");
  assert.equal(report.entities.find((entity) => entity.entityId === retainedId)?.historyDisposition, "retained");
});

test("owner-approved current Complete projection preserves a complete Task after History exclusion", () => {
  const id = "owner-approved-complete-projection";
  const entity = classifyUser(sources([task({
    id,
    title: "fixture-complete",
    status: "complete",
    completed_at: "2026-08-01T12:00:00Z",
  })], [
    { id: "complete-history", task_id: id, user_id: USER_ID, entry_date: "2026-08-01", status: "complete", event_type: "status" },
    { id: "later-history", task_id: id, user_id: USER_ID, entry_date: "2026-08-02", status: "done", event_type: "status" },
  ]), {
    userId: USER_ID,
    logicalDate: "2026-08-08",
    entityDispositions: {
      [id]: { ...OWNER_APPROVED_HISTORY_EXCLUSION, preserveCurrentCompleteProjection: true },
    },
  }).entities[0]!;
  assert.equal(entity.entityId, id);
  assert.equal(entity.lifecycleState.terminal, "permanently_complete");
  assert.equal(entity.workflowState, "none");
  assert.equal(entity.migrationEligibility, "safe");
  assert.equal(entity.migrationDisposition, "owner_approved_history_exclusion");
  assert.equal(entity.blockingIssueCodes.includes("COMPLETE_PROJECTION_ONLY"), false);
  assert.equal(entity.blockingIssueCodes.includes("COMPLETE_TERMINAL_CONTRADICTION"), false);
  assert.equal(entity.entityDisposition?.preserveCurrentCompleteProjection, true);
});

test("the same current Complete projection without explicit owner approval remains ambiguous and blocked", () => {
  const id = "unapproved-complete-projection";
  const entity = oneEntity(sources([task({
    id,
    status: "complete",
    completed_at: "2026-08-01T12:00:00Z",
  })], [
    { id: "complete-history-unapproved", task_id: id, user_id: USER_ID, entry_date: "2026-08-01", status: "complete", event_type: "status" },
    { id: "later-history-unapproved", task_id: id, user_id: USER_ID, entry_date: "2026-08-02", status: "done", event_type: "status" },
  ]));
  assert.equal(entity.lifecycleState.terminal, "ambiguous");
  assert.equal(entity.migrationEligibility, "blocked");
  assert.equal(entity.migrationDisposition, "genuinely_blocked");
  assert.ok(entity.blockingIssueCodes.includes("COMPLETE_PROJECTION_ONLY"));
});

test("owner-approved stale Complete projection reset preserves Pending and Missed current state as active", () => {
  for (const status of ["pending", "missed"] as const) {
    const id = `stale-complete-reset-${status}`;
    const entity = classifyUser(sources([task({
      id,
      status,
      completed_at: "2026-08-01T12:00:00Z",
    })], [{
      id: `${id}-history`,
      task_id: id,
      user_id: USER_ID,
      entry_date: "2026-08-01",
      status: "complete",
      event_type: "status",
    }]), {
      userId: USER_ID,
      logicalDate: "2026-08-08",
      entityDispositions: {
        [id]: { ...OWNER_APPROVED_HISTORY_EXCLUSION, resetStaleLegacyCompleteProjection: true },
      },
    }).entities[0]!;
    assert.equal(entity.entityId, id);
    assert.equal(entity.lifecycleState.terminal, "active");
    assert.equal(entity.lifecycleProjectionDisposition, "owner_approved_stale_complete_reset");
    assert.equal(entity.workflowState, "none");
    assert.notEqual(entity.migrationEligibility, "blocked");
    assert.equal(entity.blockingIssueCodes.includes("COMPLETE_PROJECTION_ONLY"), false);
    assert.equal(entity.historyDisposition, "owner_approved_excluded");
    assert.ok(entity.historyClassifications.every((item) => item.excludedFromCanonicalReconstruction));
  }
});

test("stale Complete projection without explicit reset approval remains ambiguous and blocked", () => {
  for (const status of ["pending", "missed"] as const) {
    const entity = oneEntity(sources([task({
      id: `stale-complete-unapproved-${status}`,
      status,
      completed_at: "2026-08-01T12:00:00Z",
    })]));
    assert.equal(entity.lifecycleState.terminal, "ambiguous");
    assert.equal(entity.lifecycleProjectionDisposition, "retained");
    assert.equal(entity.migrationEligibility, "blocked");
    assert.ok(entity.blockingIssueCodes.includes("COMPLETE_PROJECTION_ONLY"));
  }
});

test("Voids-style stale workflow projection resets only with explicit owner approval", () => {
  const voids = task({
    id: "voids-stable-id",
    title: "fixture-missed-weekly",
    status: "missed",
    repeat_frequency: "weekly",
    repeat_interval: 2,
    repeat_days_of_week: [1],
    due_on: "2026-08-10",
    active_status_logical_date: "2026-08-06",
    active_occurrence_due_on: "2026-08-06",
    notes: "Lamprey work notes",
    list_id: "lamprey-list",
    tags: ["Lamprey", "voids"],
    lamprey_id: "lamprey-association",
  });
  const before = structuredClone(voids);
  const entity = classifyUser(sources([voids], [{
    id: "voids-old-done",
    task_id: voids.id,
    user_id: USER_ID,
    entry_date: "2026-08-01",
    status: "done",
    event_type: "status",
    actor_kind: "user",
    occurrence_due_on: "2026-08-01",
    occurrence_key: `task:${voids.id}:occurrence:2026-08-01`,
  }, {
    id: "voids-old-delay",
    task_id: voids.id,
    user_id: USER_ID,
    entry_date: "2026-08-02",
    status: "delayed",
    event_type: "status",
    occurrence_due_on: "2026-08-02",
    occurrence_key: `task:${voids.id}:occurrence:2026-08-02`,
    delay_target_on: "2026-08-10",
  }], {
    rewardRolls: [{ id: "voids-roll", user_id: USER_ID, reward_date: "2026-08-01" }],
    rewardClaims: [{ id: "voids-claim", user_id: USER_ID, task_id: voids.id, reward_roll_id: "voids-roll", reward_date: "2026-08-01" }],
  }), {
    userId: USER_ID,
    logicalDate: "2026-08-08",
    entityDispositions: {
      [voids.id as string]: { ...OWNER_APPROVED_HISTORY_EXCLUSION, resetStaleLegacyWorkflowProjection: true },
    },
  }).entities[0]!;
  assert.deepEqual(voids, before);
  assert.equal(entity.entityId, "voids-stable-id");
  assert.equal(entity.scheduleModel, "fixed");
  assert.equal(entity.workflowState, "none");
  assert.equal(entity.workflowProjectionDisposition, "owner_approved_reset");
  assert.equal(entity.lifecycleState.terminal, "active");
  assert.equal(entity.delayState, "none");
  assert.deepEqual(entity.occurrenceClassifications, []);
  assert.equal(entity.rewardBootstrapState, "none");
  assert.equal(entity.anchor.classification, "prospective");
  assert.equal(entity.anchor.evidence.includes("historical_schedule_boundary"), false);
  assert.ok(entity.historyClassifications.every((item) => item.excludedFromCanonicalReconstruction));
  assert.deepEqual(entity.entityDisposition, { ...OWNER_APPROVED_HISTORY_EXCLUSION, resetStaleLegacyWorkflowProjection: true });
  assert.equal(entity.historyDisposition, "owner_approved_excluded");
});

test("Voids-style stale workflow projection remains contradictory without owner-approved reset", () => {
  const id = "voids-stale-without-reset";
  const entity = classifyUser(sources([task({
    id,
    status: "missed",
    repeat_frequency: "weekly",
    repeat_interval: 1,
    repeat_days_of_week: [1],
    due_on: "2026-08-10",
    active_status_logical_date: "2026-08-06",
    active_occurrence_due_on: "2026-08-06",
  })]), {
    userId: USER_ID,
    logicalDate: "2026-08-08",
    entityDispositions: { [id]: OWNER_APPROVED_HISTORY_EXCLUSION },
  }).entities[0]!;
  assert.equal(entity.workflowState, "contradictory");
  assert.equal(entity.workflowProjectionDisposition, "retained");
  assert.equal(entity.migrationEligibility, "blocked");
  assert.ok(entity.blockingIssueCodes.includes("IN_PROGRESS_FIELDS_CONTRADICTORY"));
});

test("dangerous current or future recurrence ambiguity remains genuinely blocked", () => {
  const entity = oneEntity(sources([task({
    id: "dangerous-recurrence",
    repeat_frequency: "weekly",
    repeat_interval: 1,
    repeat_days_of_week: [],
    due_on: null,
  })]));
  assert.equal(entity.scheduleModel, "ambiguous");
  assert.equal(entity.migrationEligibility, "blocked");
  assert.equal(entity.migrationDisposition, "genuinely_blocked");
  assert.ok(entity.blockingIssueCodes.includes("INVALID_RECURRENCE_CONFIGURATION"));
});

test("hierarchy and ownership safety remains blocked alongside historical uncertainty", () => {
  const foreignParent = task({ id: "foreign-parent-after-policy", user_id: "22222222-2222-4222-8222-222222222222" });
  const child = task({ id: "child-after-policy", parent_task_id: foreignParent.id });
  const entity = oneEntity(sources([foreignParent, child], [{
    id: "child-unknown-history",
    task_id: child.id,
    user_id: USER_ID,
    entry_date: "2026-08-08",
    status: "done",
    event_type: "status",
  }]));
  assert.ok(entity.blockingIssueCodes.includes("CROSS_USER_PARENT"));
  assert.equal(entity.migrationEligibility, "blocked");
  assert.equal(entity.migrationDisposition, "genuinely_blocked");
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

test("a changed current recurrence rule uses a prospective anchor without manufacturing historical certainty", () => {
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
  assert.equal(entity.anchor.classification, "prospective");
  assert.ok(entity.anchor.evidence.includes("historical_schedule_provenance_unavailable"));
  assert.ok(entity.anchor.evidence.includes("historical_scope_unknown"));
  assert.equal(entity.anchor.evidence.includes("historical_schedule_boundary"), false);
  assert.notEqual(entity.migrationEligibility, "blocked");
});

test("rolling recurrence without usable current scheduling evidence remains blocked while active", () => {
  const entity = oneEntity(sources([task({
    id: "rolling-anchor-required",
    repeat_frequency: "daily",
    due_on: null,
  })]));
  assert.equal(entity.scheduleModel, "rolling");
  assert.equal(entity.anchor.classification, "ambiguous");
  assert.equal(entity.migrationEligibility, "blocked");
  assert.equal(entity.migrationDisposition, "genuinely_blocked");
});

test("trashed recurring entity keeps an unknown anchor without activating recurrence", () => {
  const entity = oneEntity(sources([task({
    id: "trashed-unknown-anchor",
    status: "trashed",
    trashed_at: "2026-08-01T12:00:00Z",
    repeat_frequency: "daily",
    due_on: null,
  })]));
  assert.equal(entity.scheduleModel, "rolling");
  assert.equal(entity.anchor.classification, "ambiguous");
  assert.equal(entity.anchor.date, null);
  assert.ok(entity.anchor.evidence.includes("trashed_recurrence_anchor_requires_restore_repair"));
  assert.equal(entity.workflowState, "none");
  assert.notEqual(entity.migrationEligibility, "blocked");
  assert.equal(entity.migrationDisposition, "historical_uncertainty_retained");
});

test("permanently Complete recurring entity keeps an unknown anchor without future obligation", () => {
  const id = "permanently-complete-unknown-anchor";
  const entity = oneEntity(sources([task({
    id,
    status: "complete",
    completed_at: "2026-08-01T12:00:00Z",
    repeat_frequency: "weekly",
    repeat_interval: 1,
    repeat_days_of_week: [1],
    due_on: null,
  })], [{
    id: "permanent-complete-history",
    task_id: id,
    user_id: USER_ID,
    entry_date: "2026-08-01",
    status: "complete",
    event_type: "completed_permanently",
  }]));
  assert.equal(entity.lifecycleState.terminal, "permanently_complete");
  assert.equal(entity.anchor.classification, "ambiguous");
  assert.equal(entity.anchor.date, null);
  assert.ok(entity.anchor.evidence.includes("terminal_recurrence_anchor_not_required"));
  assert.notEqual(entity.migrationEligibility, "blocked");
  assert.equal(entity.migrationDisposition, "historical_uncertainty_retained");
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

test("report headline categories separate safe, historical uncertainty, owner exclusion, and blocked entities", () => {
  const excludedId = "report-owner-excluded";
  const report = buildMigrationRunReport([{
    userId: USER_ID,
    sources: sources([
      task({ id: "report-safe" }),
      task({ id: "report-historical", repeat_frequency: "daily", due_on: "2026-08-08" }),
      task({ id: "report-blocked", repeat_frequency: "weekly", due_on: null, repeat_days_of_week: [] }),
      task({ id: excludedId }),
    ], [
      { id: "report-history", task_id: "report-historical", user_id: USER_ID, entry_date: "2026-08-08", status: "done", event_type: "status" },
      { id: "report-excluded-complete", task_id: excludedId, user_id: USER_ID, entry_date: "2026-08-01", status: "complete", event_type: "status" },
      { id: "report-excluded-done", task_id: excludedId, user_id: USER_ID, entry_date: "2026-08-02", status: "done", event_type: "status" },
    ]),
    logicalDate: "2026-08-08",
    entityDispositions: { [excludedId]: OWNER_APPROVED_HISTORY_EXCLUSION },
  }], { generatedAt: "2026-08-08T12:00:00.000Z" });
  assert.deepEqual(report.global.counts.migrationDisposition, {
    safeCurrentFutureDeterministic: 1,
    historicalUncertaintyRetained: 1,
    ownerApprovedHistoryExclusion: 1,
    genuinelyBlocked: 1,
  });
  assert.equal(report.global.blockedUserCount, 1);
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

test("M2 fingerprints exclude canonical-only Task writes but detect legacy authority changes", () => {
  const base = task({ id: "fingerprint-task", due_on: "2026-08-08", repeat_frequency: "daily" });
  const canonicalOnly = {
    ...base,
    revision: 2,
    updated_at: "2026-08-08T12:01:00Z",
    canonicalization_status: "canonical_proven",
    entity_kind: "parent",
    terminal_state: "active",
    container_state: "active",
    canonical_revision: 1,
    canonical_updated_at: "2026-08-08T12:00:00Z",
    prior_container_state: "active",
    prior_container_state_status: "proven",
    workflow_state: "none",
    workflow_started_at: "2026-08-08T10:00:00Z",
    workflow_logical_date: "2026-08-08",
    workflow_occurrence_id: "canonical-occurrence",
    workflow_command_id: "canonical-command",
    projection_source: "migration",
  };
  assert.equal(fingerprintEvidence(m2TaskSourceSnapshot(base)), fingerprintEvidence(m2TaskSourceSnapshot(canonicalOnly)));

  for (const legacyChange of [
    { status: "done" },
    { due_on: "2026-08-09" },
    { repeat_frequency: "weekly", repeat_days_of_week: [1] },
    { parent_task_id: "parent-id" },
    { completed_at: "2026-08-08T12:00:00Z" },
    { active_status_logical_date: "2026-08-08" },
  ]) {
    assert.notEqual(
      fingerprintEvidence(m2TaskSourceSnapshot(base)),
      fingerprintEvidence(m2TaskSourceSnapshot({ ...base, ...legacyChange })),
    );
  }
  assert.notEqual(
    fingerprintEvidence([{ id: "history", task_id: base.id, entry_date: "2026-08-08", status: "done" }]),
    fingerprintEvidence([{ id: "history", task_id: base.id, entry_date: "2026-08-08", status: "did_my_best" }]),
  );
});
