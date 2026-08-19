import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Task, TaskInsert } from "../src/lib/database.types.ts";
import { useTaskCrudActions } from "../src/hooks/useTaskCrudActions.ts";
import { useTaskCreateAction } from "../src/hooks/useTaskCreateAction.ts";
import { useTaskEditorSaveAction } from "../src/hooks/useTaskEditorSaveAction.ts";
import {
  buildCanonicalTaskCreationPlan,
  CanonicalTaskCreationValidationError,
} from "../src/lib/task-state-canonical/task-creation.ts";
import {
  insertTaskRowWithCanonicalCreation,
  type CanonicalTaskCreationRow,
} from "../src/lib/task-db-mutations.ts";
import type { CanonicalTaskScheduleBoundary } from "../src/lib/task-state-canonical/types.ts";
import { planTaskStateCommand, type CanonicalTaskStateCommand } from "../src/lib/task-state-canonical/command-service.ts";

const ownerId = "00000000-0000-4000-8000-000000000001";
const parentId = "00000000-0000-4000-8000-000000000002";
const now = "2026-08-11T14:00:00.000Z";
const profile = { timezone: "America/New_York", day_start_time: "06:00", settings_revision: 3 };

function draft(overrides: Partial<TaskInsert> = {}): Omit<TaskInsert, "user_id"> {
  return {
    title: "New Task",
    status: "pending",
    priority: "normal",
    priority_level: 3,
    energy: "none",
    is_urgent: false,
    is_important: false,
    due_on: null,
    due_time: null,
    estimated_minutes: null,
    actual_seconds: 0,
    tags: [],
    notes: null,
    parent_task_id: null,
    repeat_frequency: "none",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    scheduled_on: null,
    active_status_logical_date: null,
    active_occurrence_due_on: null,
    external_link_label: null,
    external_link_url: null,
    one_step_at_a_time: false,
    subtasks_auto_reset: false,
    pinned_at: null,
    pin_order: null,
    sort_order: 0,
    completed_at: null,
    trashed_at: null,
    ...overrides,
  };
}

function canonicalBoundary(overrides: Partial<CanonicalTaskScheduleBoundary> = {}): CanonicalTaskScheduleBoundary {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    user_id: ownerId,
    entity_id: parentId,
    entity_kind: "parent",
    effective_from_logical_date: "2026-08-11",
    boundary_sequence: 1,
    boundary_type: "initial",
    schedule_model: "unscheduled",
    repeat_frequency: "none",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    one_time_due_on: null,
    due_time: null,
    anchor_date: null,
    anchor_kind: "unknown",
    anchor_confidence: "unavailable",
    historical_scope_known: false,
    prospective_only: true,
    prior_boundary_id: null,
    affected_occurrence_id: null,
    logical_day_settings_revision: profile.settings_revision,
    timezone: profile.timezone,
    day_start_time: profile.day_start_time,
    actor_kind: "user",
    actor_id: ownerId,
    source: "task_creation",
    command_id: null,
    idempotence_identity: `task-create:${parentId}`,
    migration_operation_id: null,
    migration_version: null,
    classifier_version: null,
    schema_contract_version: "task-state-schema-v1",
    source_task_revision: 1,
    revision: 1,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function canonicalTask(overrides: Partial<CanonicalTaskCreationRow> = {}): CanonicalTaskCreationRow {
  return {
    id: parentId,
    user_id: ownerId,
    parent_task_id: null,
    revision: 1,
    title: "New Task",
    notes: null,
    status: "pending",
    priority: "normal",
    priority_level: 3,
    energy: "none",
    is_urgent: false,
    is_important: false,
    due_on: null,
    active_status_logical_date: null,
    active_occurrence_due_on: null,
    scheduled_on: null,
    due_time: null,
    estimated_minutes: null,
    actual_seconds: 0,
    tags: [],
    external_link_label: null,
    external_link_url: null,
    one_step_at_a_time: false,
    subtasks_auto_reset: false,
    repeat_frequency: "none",
    repeat_interval: 1,
    repeat_days_of_week: [],
    repeat_day_of_month: null,
    repeat_monthly_mode: "day_of_month",
    repeat_monthly_ordinal: null,
    repeat_monthly_weekday: null,
    pinned_at: null,
    pin_order: null,
    sort_order: 0,
    completed_at: null,
    trashed_at: null,
    created_at: now,
    updated_at: now,
    canonicalization_status: "canonical_runtime",
    entity_kind: "parent",
    terminal_state: "active",
    container_state: "active",
    prior_container_state: null,
    prior_container_state_status: "not_applicable",
    terminal_completed_at: null,
    container_trashed_at: null,
    workflow_state: "none",
    workflow_started_at: null,
    workflow_logical_date: null,
    workflow_occurrence_id: null,
    workflow_command_id: null,
    workflow_revision: 1,
    canonical_revision: 1,
    canonical_created_at: now,
    canonical_updated_at: now,
    projection_source_canonical_revision: 1,
    projection_source_fingerprint: "canonical-task-create-v1:test",
    projection_version: "task-state-create-v1",
    canonical_schedule_anchor_date: null,
    canonical_schedule_boundary: canonicalBoundary(),
    ...overrides,
  };
}

function noDirectTaskInsertClient() {
  return {
    from() {
      throw new Error("legacy Task insert was reached");
    },
  } as never;
}

test("canonical creation plan initializes runtime state without action facts or rewards", () => {
  const plan = buildCanonicalTaskCreationPlan({ draft: draft(), entityKind: "parent", now, profile });
  assert.equal(plan.canonical.canonical_revision, 1);
  assert.equal(plan.canonical.terminal_state, "active");
  assert.equal(plan.canonical.container_state, "active");
  assert.equal(plan.canonical.workflow_state, "none");
  assert.equal(plan.canonical.workflow_revision, 1);
  assert.equal(plan.schedule.schedule_model, "unscheduled");
  assert.equal(plan.schedule.historical_scope_known, false);
  assert.equal(plan.schedule.prospective_only, true);
  assert.equal(plan.task.status, "pending");
  assert.equal(plan.task.completed_at, null);
  assert.equal(plan.task.trashed_at, null);

  const importedOpenPlan = buildCanonicalTaskCreationPlan({
    draft: draft({ due_on: "2026-08-20", repeat_frequency: "daily", tags: ["planning"] }),
    entityKind: "parent",
    now,
    profile,
    source: "task_import",
  });
  assert.equal(importedOpenPlan.task.due_on, "2026-08-20");
  assert.equal(importedOpenPlan.task.repeat_frequency, "daily");
  assert.deepEqual(importedOpenPlan.task.tags, ["planning"]);
  assert.equal(importedOpenPlan.schedule.schedule_model, "rolling");
});

test("normal addTask uses trusted canonical creation and fails closed without legacy fallback", async () => {
  const calls: Array<{ payload: TaskInsert; source?: string }> = [];
  let tasks: Task[] = [];
  const creator = async (payload: TaskInsert, source?: "task_creation" | "task_import") => {
    calls.push({ payload, source });
    return { data: canonicalTask({ title: payload.title }), error: null, usedEnergyFallback: false, usedActualSecondsFallback: false as const };
  };
  const action = useTaskCreateAction({
    canonicalCommandsEnabled: true,
    canonicalTaskCreator: creator,
    client: noDirectTaskInsertClient(),
    currentUserId: ownerId,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: (next) => { tasks = typeof next === "function" ? next(tasks) : next; },
    shouldRouteTaskToInbox: () => false,
    sortTasksForUi: (value) => value,
  });

  const created = await action.addTask({ title: "Trusted Task" });
  assert.equal(created?.canonical_revision, 1);
  assert.equal(created?.canonicalization_status, "canonical_runtime");
  assert.equal(created?.terminal_state, "active");
  assert.equal(created?.container_state, "active");
  assert.equal(created?.workflow_state, "none");
  assert.equal(calls[0]?.source, "task_creation");
  assert.equal("user_id" in (calls[0]?.payload ?? {}), true);
  assert.equal(tasks.length, 1);

  let fallbackCalls = 0;
  const failedAction = useTaskCreateAction({
    canonicalCommandsEnabled: true,
    canonicalTaskCreator: async () => ({ data: null, error: { message: "trusted creator unavailable" }, usedEnergyFallback: false, usedActualSecondsFallback: false as const }),
    client: {
      from() {
        fallbackCalls += 1;
        throw new Error("legacy fallback must not run");
      },
    } as never,
    currentUserId: ownerId,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: () => {},
    shouldRouteTaskToInbox: () => false,
    sortTasksForUi: (value) => value,
  });
  assert.equal(await failedAction.addTask({ title: "Must fail" }), null);
  assert.equal(fallbackCalls, 0);
});

test("canonical creation returns the persisted boundary and local state without reload", async () => {
  const cases: Array<{
    label: string;
    source: "task_creation" | "task_import";
    entityKind: "parent" | "step" | "substep";
    boundary: CanonicalTaskScheduleBoundary;
  }> = [
    {
      label: "unscheduled parent",
      source: "task_creation",
      entityKind: "parent",
      boundary: canonicalBoundary(),
    },
    {
      label: "one-time due parent",
      source: "task_creation",
      entityKind: "parent",
      boundary: canonicalBoundary({
        schedule_model: "one_time",
        one_time_due_on: "2026-08-20",
        due_time: "09:30:00",
        anchor_kind: "user_selected",
        anchor_confidence: "proven",
      }),
    },
    {
      label: "recurring parent",
      source: "task_creation",
      entityKind: "parent",
      boundary: canonicalBoundary({
        schedule_model: "rolling",
        repeat_frequency: "daily",
        anchor_date: "2026-08-20",
        anchor_kind: "user_selected",
        anchor_confidence: "proven",
      }),
    },
    {
      label: "Step import",
      source: "task_import",
      entityKind: "step",
      boundary: canonicalBoundary({
        entity_id: "00000000-0000-4000-8000-000000000011",
        entity_kind: "step",
        source: "task_import",
      }),
    },
    {
      label: "Substep import",
      source: "task_import",
      entityKind: "substep",
      boundary: canonicalBoundary({
        entity_id: "00000000-0000-4000-8000-000000000012",
        entity_kind: "substep",
        source: "task_import",
      }),
    },
  ];

  for (const testCase of cases) {
    const responseTask = canonicalTask({
      id: testCase.boundary.entity_id,
      entity_kind: testCase.entityKind,
      user_id: ownerId,
      parent_task_id: testCase.entityKind === "parent"
        ? null
        : testCase.entityKind === "step"
          ? parentId
          : "00000000-0000-4000-8000-000000000011",
    });
    const client = {
      functions: {
        invoke: async () => ({
          data: {
            task: { ...responseTask, canonical_schedule_boundary: testCase.boundary },
            used_energy_fallback: false,
          },
          error: null,
        }),
      },
    } as never;
    const result = await insertTaskRowWithCanonicalCreation(client, draft({ parent_task_id: testCase.entityKind === "parent" ? null : parentId }), testCase.source);
    assert.equal(result.error, null, testCase.label);
    assert.deepEqual(result.data?.canonical_schedule_boundary, testCase.boundary, testCase.label);
    assert.equal(result.data?.canonical_schedule_boundary.entity_id, responseTask.id, testCase.label);
  }

  let localTasks: Task[] = [];
  const localStateClient = {
    functions: {
      invoke: async () => ({
        data: {
          task: { ...canonicalTask(), canonical_schedule_boundary: cases[0]!.boundary },
          used_energy_fallback: false,
        },
        error: null,
      }),
    },
  } as never;
  const action = useTaskCreateAction({
    canonicalCommandsEnabled: true,
    client: localStateClient,
    currentUserId: ownerId,
    routeTask: () => {},
    setMessage: () => {},
    setTasks: (next) => { localTasks = typeof next === "function" ? next(localTasks) : next; },
    shouldRouteTaskToInbox: () => false,
    sortTasksForUi: (value) => value,
  });
  const created = await action.addTask({ title: "Hydrated immediately" });
  assert.equal(created?.canonical_schedule_boundary.id, cases[0]!.boundary.id);
  assert.equal(localTasks[0]?.canonical_schedule_boundary?.id, cases[0]!.boundary.id);
});

test("canonical editor creation does not synthesize History or rewards", async () => {
  let historyCalls = 0;
  let rewardCalls = 0;
  let creatorCalls = 0;
  const action = useTaskEditorSaveAction({
    canonicalCommandsEnabled: true,
    canonicalTaskCreator: async (payload) => {
      creatorCalls += 1;
      return { data: canonicalTask({ title: payload.title }), error: null, usedEnergyFallback: false, usedActualSecondsFallback: false as const };
    },
    currentDayKey: "2026-08-11",
    currentUserId: ownerId,
    dayStartTime: "06:00",
    focusedTaskIds: [],
    insertTaskRowWithLegacyEnergyFallback: async () => { throw new Error("legacy editor insert must not run"); },
    onTasksCompleted: async () => { rewardCalls += 1; },
    replaceTaskSubtasks: async () => ({ saved: true }),
    reconcileOverdueTaskMisses: async () => true,
    saveFocusSelection: async () => {},
    setMessage: () => {},
    setTasks: () => {},
    sortTasksForUi: (value) => value,
    syncTaskHistoryEntry: async () => { historyCalls += 1; return true; },
    syncTaskNoteLinks: async () => true,
    tasks: [],
    timezone: "America/New_York",
    updateTaskRowWithLegacyEnergyFallback: async () => { throw new Error("legacy editor update must not run"); },
  });
  const result = await action.saveTaskEditor({ title: "Editor Task" });
  assert.equal(result?.canonical_revision, 1);
  assert.equal(creatorCalls, 1);
  assert.equal(historyCalls, 0);
  assert.equal(rewardCalls, 0);
});

test("Import routes parents, Steps, and Substeps through canonical creation and preserves metadata", async () => {
  const calls: Array<{ payload: TaskInsert; source?: string }> = [];
  const createdRows: Array<{ id: string; parent_task_id: string | null }> = [];
  let nextId = 10;
  let tasks: Task[] = [];
  const creator = async (payload: TaskInsert, source?: "task_creation" | "task_import") => {
    calls.push({ payload, source });
    const entityKind = payload.parent_task_id === null || payload.parent_task_id === undefined
      ? "parent"
      : createdRows.find((row) => row.id === payload.parent_task_id)?.parent_task_id === null ? "step" : "substep";
    const rowId = `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
    const row = canonicalTask({
      id: rowId,
      title: payload.title,
      parent_task_id: payload.parent_task_id ?? null,
      due_on: payload.due_on ?? null,
      repeat_frequency: payload.repeat_frequency ?? "none",
      entity_kind: entityKind,
      canonical_schedule_boundary: canonicalBoundary({
        id: `${rowId.slice(0, -2)}99`,
        entity_id: rowId,
        entity_kind: entityKind,
        source: source ?? "task_import",
      }),
    });
    createdRows.push({ id: row.id, parent_task_id: row.parent_task_id });
    return { data: row, error: null, usedEnergyFallback: false, usedActualSecondsFallback: false as const };
  };
  const action = useTaskCrudActions({
    canonicalCommandsEnabled: true,
    canonicalTaskCreator: creator,
    client: noDirectTaskInsertClient(),
    currentUserId: ownerId,
    deleteTaskRow: async () => ({ data: null, error: null, conflict: null }),
    setMessage: () => {},
    setTaskRouting: () => {},
    setTasks: (next) => { tasks = typeof next === "function" ? next(tasks) : next; },
    shouldRouteTaskToInbox: () => false,
    sortTasksForUi: (value) => value,
    tasks: [],
    updateTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false }),
  });

  const result = await action.importTasks([
    "Parent *due-2026-08-20 *repeat-daily",
    "- Step *due-2026-08-21",
    "-- Substep",
  ]);
  assert.deepEqual(result, { errorCount: 0, importedCount: 1, warningCount: 0 });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.source), ["task_import", "task_import", "task_import"]);
  assert.equal(calls[0]?.payload.due_on, "2026-08-20");
  assert.equal(calls[0]?.payload.repeat_frequency, "daily");
  assert.equal(calls[1]?.payload.parent_task_id, tasks[0]?.id);
  assert.equal(calls[2]?.payload.parent_task_id, tasks[1]?.id);
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks.map((task) => task.entity_kind), ["parent", "step", "substep"]);
  assert.equal(tasks.every((task) => task.canonical_schedule_boundary?.entity_id === task.id), true);
  assert.equal(tasks.every((task) => task.canonicalization_status !== "legacy_uninitialized" && task.canonical_revision === 1), true);
});

test("unsafe imported snapshot status fails closed instead of guessing provenance", async () => {
  let planError: unknown = null;
  try {
    buildCanonicalTaskCreationPlan({ draft: draft({ status: "done" }), entityKind: "parent", now, profile, source: "task_import" });
  } catch (error) {
    planError = error;
  }
  assert.ok(planError instanceof CanonicalTaskCreationValidationError);
  assert.equal((planError as CanonicalTaskCreationValidationError).code, "UNSAFE_IMPORTED_STATUS");

  let directInsertCalls = 0;
  const action = useTaskCrudActions({
    canonicalCommandsEnabled: true,
    canonicalTaskCreator: async () => ({ data: null, error: { message: "UNSAFE_IMPORTED_STATUS" }, usedEnergyFallback: false, usedActualSecondsFallback: false as const }),
    client: {
      from() {
        directInsertCalls += 1;
        throw new Error("legacy import insert must not run");
      },
    } as never,
    currentUserId: ownerId,
    deleteTaskRow: async () => ({ data: null, error: null, conflict: null }),
    setMessage: () => {},
    setTaskRouting: () => {},
    setTasks: () => {},
    shouldRouteTaskToInbox: () => false,
    sortTasksForUi: (value) => value,
    tasks: [],
    updateTaskRowWithLegacyEnergyFallback: async () => ({ data: null, error: null, conflict: null, reappliedOnLatestRevision: false, usedActualSecondsFallback: false, usedEnergyFallback: false }),
  });
  const result = await action.importTasks(["Done *status-done"]);
  assert.equal(result.importedCount, 0);
  assert.equal(result.errorCount, 1);
  assert.equal(directInsertCalls, 0);
});

test("trusted creation source and RPC contracts are service-role-only and do not write History or rewards", () => {
  const sql = readFileSync(new URL("../supabase/add_task_canonical_creation.sql", import.meta.url), "utf8");
  const edge = readFileSync(new URL("../supabase/functions/task-create-canonical/index.ts", import.meta.url), "utf8");
  assert.match(sql, /current_user <> 'service_role'/i);
  assert.match(sql, /insert into public\.adhdice_clean_tasks/i);
  assert.match(sql, /insert into public\.adhdice_task_schedule_boundaries/i);
  assert.match(sql, /'canonical_schedule_boundary',\s*to_jsonb\(v_boundary\)/i);
  assert.doesNotMatch(sql, /'schedule_boundary_id'/i);
  assert.match(sql, /canonicalization_status/i);
  assert.match(sql, /canonical_revision/i);
  assert.match(sql, /terminal_state/i);
  assert.match(sql, /container_state/i);
  assert.match(sql, /workflow_state/i);
  assert.match(sql, /revoke all on function public\.adhdice_create_canonical_task\(uuid, jsonb\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.adhdice_create_canonical_task\(uuid, jsonb\) to service_role/i);
  assert.doesNotMatch(sql, /adhdice_task_history|adhdice_task_reward_entitlements|adhdice_task_reward_grants/i);
  assert.doesNotMatch(sql, /canonical_revision\s*\?\?|task\.revision/i);
  assert.match(edge, /withSupabase\(\{ auth: "user" \},/);
  assert.match(edge, /userIdFromContext\(context\)/);
  assert.match(edge, /\.rpc\("adhdice_create_canonical_task"/);
  assert.match(edge, /canonical_schedule_boundary/);
  assert.doesNotMatch(edge, /\.from\("adhdice_clean_tasks"\)[\s\S]*\.insert\(/);
  assert.doesNotMatch(edge, /body\.user_id|body\.task\.user_id/);
});

test("canonical creation source parsing accepts creation/import forms and rejects unsupported values", () => {
  const edge = readFileSync(new URL("../supabase/functions/task-create-canonical/index.ts", import.meta.url), "utf8");
  assert.match(
    edge,
    /const source =\s*\n\s*body\.source === "task_import"\s*\n\s*\? "task_import"\s*\n\s*:\s*body\.source === "task_creation" \|\| body\.source === undefined\s*\n\s*\? "task_creation"\s*\n\s*:\s*null;/,
  );
  assert.match(edge, /body\.source === "task_creation"/);
  assert.match(edge, /body\.source === undefined/);
  assert.match(edge, /body\.source === "task_import"/);
  assert.match(edge, /: null;/);
});

test("canonical command planning rejects legacy revision substitution", () => {
  const legacyTask = canonicalTask({ canonical_revision: null, revision: 19 });
  const command = {
    type: "archive",
    commandId: "00000000-0000-4000-8000-000000000099",
    userId: ownerId,
    taskId: legacyTask.id,
    entityKind: "parent",
    acceptedIntent: { type: "archive_task", task_id: legacyTask.id },
    expectedRevision: 19,
    logicalDay: {
      identity: "logical-day",
      logicalDate: "2026-08-11",
      timezone: profile.timezone,
      dayStartTime: profile.day_start_time,
      settingsRevision: profile.settings_revision,
    },
  } satisfies CanonicalTaskStateCommand;
  assert.throws(
    () => planTaskStateCommand({ task: legacyTask }, command),
    /legacy revision is not a substitute/i,
  );
});
