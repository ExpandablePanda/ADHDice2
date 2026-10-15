import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canCreateHomeRecoveryPoint,
  checkHomeRecoveryRestoreService,
  compareHomeRecoveryLists,
  compareHomeRecoveryStateDetails,
  createHomeOnlyBackupDocument,
  createManualHomeRecoveryPoint,
  HOME_RECOVERY_APP_VERSION,
  getHomeRecoveryListIds,
  getHomeRecoveryTaskLabel,
  getHomeRecoveryTaskTitleLookupIds,
  getNextHomeRecoveryEligibility,
  HOME_RECOVERY_TASK_TITLE_BATCH_SIZE,
  loadAuthoritativeHomeTodoState,
  loadHomeRecoveryTaskTitles,
  loadHomeRecoveryPoints,
  loadHomeRecoveryPreview,
  loadHomeRecoveryStatus,
  restoreHomeRecoveryPoint,
  sameAuthoritativeHomeState,
  type HomeRecoveryPoint,
  type HomeRecoveryRpcClient,
  type HomeRecoveryStatus,
} from "@/lib/home-recovery-dashboard";
import { isHomeRecoveryRestoreEnabled } from "@/lib/home-recovery-restore-gate";
import type { Database, Task } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const settingsComponent = readFileSync(new URL("../src/components/task-app/settings-home-backup-recovery.tsx", import.meta.url), "utf8");
const settingsPage = readFileSync(new URL("../src/components/task-app/settings-page.tsx", import.meta.url), "utf8");
const settingsStyles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const recoveryModule = readFileSync(new URL("../src/lib/home-recovery-dashboard.ts", import.meta.url), "utf8");

const status: HomeRecoveryStatus = {
  recovery_storage_bytes: 12_000,
  recovery_warning_bytes: 40 * 1024 * 1024,
  recovery_limit_bytes: 50 * 1024 * 1024,
  recovery_warning: false,
  recovery_capacity_exhausted: false,
  database_capture_suspended: false,
  database_bytes: 100_000,
  database_limit_bytes: 400 * 1024 * 1024,
  recovery_point_count: 0,
  max_recovery_points: 10,
  latest_successful_point_at: null,
  latest_attempt_at: null,
  latest_attempt_trigger: null,
  latest_attempt_result: null,
  latest_failure_at: null,
  latest_failure_reason: null,
  last_scheduled_attempt_at: null,
};

const state = {
  schemaVersion: 8,
  clientUpdatedAt: "2026-10-15T12:00:00.000Z",
  taskIds: ["todo-a", "todo-b"],
  taskDayOffsets: { "todo-b": 2 },
  tasksPerDay: 10,
  urgentTaskIds: ["urgent-a"],
  routineTaskIds: ["routine-a", "routine-b"],
  routineSections: [{ id: "section-a", name: "Morning" }],
  routineSectionIdByTaskId: { "routine-a": "section-a" },
  scratchpadText: "private scratchpad",
  scratchpadItems: [{ id: "scratch-a", text: "private note", createdAt: "2026-10-15T10:00:00.000Z" }],
};

const point: HomeRecoveryPoint = {
  id: "point-a",
  created_at: "2026-10-15T12:00:00.000Z",
  app_version: "7.16.166",
  schema_version: 1,
  trigger_type: "manual",
  domain_manifest: { homeTodo: { schemaVersion: 8 } },
  payload_schema_version: 1,
  payload_bytes: 2048,
  checksum_algorithm: "sha256",
  verification_status: "verified",
  is_protected: false,
  protected_at: null,
  protected_reason: null,
};

function mockRpc(handler: (name: string, args?: Record<string, unknown>) => unknown | Promise<unknown>) {
  const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
  const client: HomeRecoveryRpcClient = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      const response = await handler(name, args);
      if (response && typeof response === "object" && "data" in response && "error" in response) {
        return response as Awaited<ReturnType<HomeRecoveryRpcClient["rpc"]>>;
      }
      return { data: response, error: null };
    },
  };
  return { client, calls };
}

function successfulPreview(id = point.id, homeState: Record<string, unknown> = state) {
  return {
    status: "preview",
    id,
    created_at: point.created_at,
    app_version: point.app_version,
    schema_version: 1,
    trigger_type: "manual",
    domain_manifest: point.domain_manifest,
    payload_bytes: point.payload_bytes,
    verification_status: "verified",
    is_protected: false,
    integrity_valid: true,
    schema_compatible: true,
    home_state: homeState,
    missing_task_ids: [],
    restorable: true,
    current_state_revision: 2,
    current_restore_generation: 0,
    current_client_updated_at: "2026-10-15T12:00:00.000Z",
  };
}

function mockTaskTitleClient(handler: (userId: string, taskIds: string[]) => unknown | Promise<unknown>) {
  const calls: Array<{ table: string; columns: string; ownerColumn: string; userId: string; idColumn: string; taskIds: string[] }> = [];
  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(ownerColumn: string, userId: string) {
              return {
                async in(idColumn: string, taskIds: string[]) {
                  calls.push({ table, columns, ownerColumn, userId, idColumn, taskIds });
                  return await handler(userId, taskIds);
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

function mockCurrentHomeStateClient(
  authenticatedUserId: string | null,
  row: Record<string, unknown> | null,
  rowError: unknown = null,
) {
  const calls: Array<{ table: string; columns: string; ownerColumn: string; userId: string }> = [];
  const client = {
    auth: {
      async getUser() {
        return { data: { user: authenticatedUserId ? { id: authenticatedUserId } : null }, error: null };
      },
    },
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(ownerColumn: string, userId: string) {
              return {
                async maybeSingle() {
                  calls.push({ table, columns, ownerColumn, userId });
                  return { data: row, error: rowError };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

test("an available empty point list is distinct from a missing recovery RPC", async () => {
  const empty = mockRpc(async (name) => name === "list_home_recovery_points" ? [] : null);
  assert.deepEqual(await loadHomeRecoveryPoints(empty.client), { kind: "available", value: [] });
  assert.deepEqual(empty.calls, [{ name: "list_home_recovery_points", args: { p_limit: 10 } }]);

  const unavailable = mockRpc(async () => ({
    data: null,
    error: { code: "PGRST202", message: "Could not find function in schema cache" },
  }));
  const result = await loadHomeRecoveryStatus(unavailable.client);
  assert.equal(result.kind, "unavailable");
  if (result.kind === "unavailable") assert.match(result.message, /not available in this database/);
});

test("status and point loading validate RPC payloads and distinguish authorization errors", async () => {
  const loaded = mockRpc(async (name) => {
    if (name === "home_recovery_status") return status;
    if (name === "list_home_recovery_points") return [point];
    return null;
  });
  assert.deepEqual(await loadHomeRecoveryStatus(loaded.client), { kind: "available", value: status });
  const points = await loadHomeRecoveryPoints(loaded.client);
  assert.equal(points.kind, "available");
  if (points.kind === "available") assert.deepEqual(points.value, [point]);

  const denied = mockRpc(async () => ({ data: null, error: { code: "42501", message: "permission denied" } }));
  const denial = await loadHomeRecoveryPoints(denied.client);
  assert.equal(denial.kind, "error");
  if (denial.kind === "error") assert.match(denial.message, /access was denied/);
});

test("manual captures only report confirmed creation and surface database failures", async () => {
  const created = mockRpc(async () => ({ status: "created", recovery_point_id: "new-point" }));
  assert.deepEqual(await createManualHomeRecoveryPoint(created.client), {
    kind: "created", recoveryPointId: "new-point", unchanged: false,
  });
  assert.deepEqual(created.calls, [{
    name: "create_home_recovery_point",
    args: { p_app_version: HOME_RECOVERY_APP_VERSION },
  }]);

  const unchanged = mockRpc(async () => ({ status: "unchanged", recovery_point_id: "existing-point" }));
  const reused = await createManualHomeRecoveryPoint(unchanged.client);
  assert.equal(reused.kind, "created");
  if (reused.kind === "created") assert.equal(reused.unchanged, true);

  const failed = mockRpc(async () => ({ status: "failed", reason: "recovery_storage_limit_reached" }));
  const failure = await createManualHomeRecoveryPoint(failed.client);
  assert.equal(failure.kind, "failed");
  if (failure.kind === "failed") assert.match(failure.message, /storage limit/);

  const noState = mockRpc(async () => ({ status: "no_state" }));
  assert.equal((await createManualHomeRecoveryPoint(noState.client)).kind, "failed");
});

test("preview retains ordered Home lists and reports missing Task references", async () => {
  const previewData = { ...successfulPreview(), missing_task_ids: ["todo-b"] };
  const mock = mockRpc(async (name) => name === "preview_home_recovery_point" ? previewData : null);
  const result = await loadHomeRecoveryPreview(mock.client, point.id);
  assert.equal(result.kind, "available");
  if (result.kind !== "available") return;
  assert.deepEqual(getHomeRecoveryListIds(result.value.home_state), {
    todo: ["todo-a", "todo-b"], urgent: ["urgent-a"], routine: ["routine-a", "routine-b"],
  });
  assert.deepEqual(result.value.missing_task_ids, ["todo-b"]);
  assert.equal(result.value.integrity_valid, true);

  const mismatched = mockRpc(async () => successfulPreview("another-owner-point"));
  assert.equal((await loadHomeRecoveryPreview(mismatched.client, point.id)).kind, "error");
});

test("live Home comparison uses a fresh matching auth identity and an owner-scoped read", async () => {
  const mock = mockCurrentHomeStateClient("owner-a", {
    state,
    client_updated_at: state.clientUpdatedAt,
    state_revision: 4,
    restore_generation: 2,
  });
  assert.deepEqual(await loadAuthoritativeHomeTodoState(mock.client, "owner-a"), {
    kind: "available",
    value: { state, stateRevision: 4, restoreGeneration: 2, clientUpdatedAt: state.clientUpdatedAt },
  });
  assert.deepEqual(mock.calls, [{
    table: "adhdice_home_todo_state",
    columns: "state,client_updated_at,state_revision,restore_generation",
    ownerColumn: "user_id",
    userId: "owner-a",
  }]);

  const wrongOwner = mockCurrentHomeStateClient("owner-b", {
    state, client_updated_at: state.clientUpdatedAt, state_revision: 4, restore_generation: 2,
  });
  assert.equal((await loadAuthoritativeHomeTodoState(wrongOwner.client, "owner-a")).kind, "error");
  assert.equal(wrongOwner.calls.length, 0);

  const noSavedRow = mockCurrentHomeStateClient("owner-a", null);
  assert.deepEqual(await loadAuthoritativeHomeTodoState(noSavedRow.client, "owner-a"), {
    kind: "available",
    value: { state: null, stateRevision: null, restoreGeneration: 0, clientUpdatedAt: null },
  });
});

test("restore service readiness is a non-mutating confirmation-required RPC and unavailable RPCs fail closed", async () => {
  const available = mockRpc(async () => ({ status: "confirmation_required" }));
  assert.deepEqual(await checkHomeRecoveryRestoreService(available.client, point.id), { kind: "available" });
  assert.deepEqual(available.calls, [{
    name: "restore_home_recovery_point",
    args: {
      p_recovery_point_id: point.id,
      p_expected_state_revision: null,
      p_expected_restore_generation: 0,
      p_confirm_restore: false,
    },
  }]);
  const unavailable = mockRpc(async () => ({ data: null, error: { code: "PGRST202", message: "function missing" } }));
  assert.equal((await checkHomeRecoveryRestoreService(unavailable.client, point.id)).kind, "unavailable");
});

test("restore sends the fresh revision fence and accepts only a complete success", async () => {
  const restoredState = { ...state, taskIds: ["todo-b"] };
  const success = mockRpc(async () => ({
    status: "restored",
    state: restoredState,
    client_updated_at: "2026-10-15T13:00:00.000Z",
    state_revision: 5,
    restore_generation: 3,
    pre_restore_checkpoint: { status: "created" },
  }));
  assert.deepEqual(await restoreHomeRecoveryPoint(success.client, point.id, 4, 2), {
    kind: "restored",
    state: restoredState,
    clientUpdatedAt: "2026-10-15T13:00:00.000Z",
    stateRevision: 5,
    restoreGeneration: 3,
  });
  assert.deepEqual(success.calls, [{
    name: "restore_home_recovery_point",
    args: {
      p_recovery_point_id: point.id,
      p_expected_state_revision: 4,
      p_expected_restore_generation: 2,
      p_confirm_restore: true,
    },
  }]);

  const conflict = mockRpc(async () => ({ status: "restore_conflict" }));
  assert.equal((await restoreHomeRecoveryPoint(conflict.client, point.id, 4, 2)).kind, "conflict");
  const checkpointFailure = mockRpc(async () => ({ status: "restore_failed", reason: "pre_restore_checkpoint_failed" }));
  const checkpoint = await restoreHomeRecoveryPoint(checkpointFailure.client, point.id, 4, 2);
  assert.equal(checkpoint.kind, "failed");
  if (checkpoint.kind === "failed") assert.match(checkpoint.message, /pre-restore.*checkpoint.*Home was not changed/i);
  const missingTask = mockRpc(async () => ({ status: "missing_task_references", missing_task_ids: ["gone"] }));
  assert.equal((await restoreHomeRecoveryPoint(missingTask.client, point.id, 4, 2)).kind, "failed");
  const unavailable = mockRpc(async () => ({ data: null, error: { code: "PGRST202", message: "function missing" } }));
  assert.equal((await restoreHomeRecoveryPoint(unavailable.client, point.id, 4, 2)).kind, "unavailable");
});

test("live comparison covers lists, Routine assignments, offsets, Scratchpad, and other persisted fields", () => {
  const current = {
    ...state,
    taskIds: ["todo-a"],
    routineSections: [{ id: "section-b", name: "Evening" }],
    routineSectionIdByTaskId: { "routine-b": "section-b" },
    taskDayOffsets: { "todo-a": 1 },
    scratchpadText: "current text",
    scratchpadItems: [{ id: "scratch-b", text: "current item", createdAt: "2026-10-14T10:00:00.000Z" }],
    tasksPerDay: 12,
    extraHomeField: { enabled: true },
  };
  const details = compareHomeRecoveryStateDetails(state, current);
  assert.equal(compareHomeRecoveryLists(state, current).todo.orderChanged, false);
  assert.equal(details.routineDetailsChanged, true);
  assert.equal(details.offsetsChanged, true);
  assert.equal(details.scratchpadTextChanged, true);
  assert.equal(details.scratchpadItemsChanged, true);
  assert.equal(details.tasksPerDayChanged, true);
  assert.deepEqual(details.otherFields, [{ key: "extraHomeField", snapshotValue: undefined, currentValue: { enabled: true } }]);
  const currentRow = { state: current, stateRevision: 4, restoreGeneration: 2, clientUpdatedAt: state.clientUpdatedAt };
  assert.equal(sameAuthoritativeHomeState(currentRow, { ...currentRow, state: { ...current } }), true);
  assert.equal(sameAuthoritativeHomeState(currentRow, { ...currentRow, state }), false);
});

test("Restore gate defaults off and requires an explicit staging or development origin allowlist", () => {
  assert.equal(isHomeRecoveryRestoreEnabled("https://staging.adhdice.example", { enabled: undefined, environment: undefined, allowedOrigins: undefined }), false);
  assert.equal(isHomeRecoveryRestoreEnabled("https://app.adhdice.example", { enabled: "true", environment: "production", allowedOrigins: "https://app.adhdice.example" }), false);
  assert.equal(isHomeRecoveryRestoreEnabled("https://other.adhdice.example", { enabled: "true", environment: "staging", allowedOrigins: "https://staging.adhdice.example" }), false);
  assert.equal(isHomeRecoveryRestoreEnabled("https://staging.adhdice.example", { enabled: "true", environment: "staging", allowedOrigins: "https://staging.adhdice.example" }), true);
});

test("rapid point selection cannot commit a stale preview or submit a different selected point", () => {
  const loadStart = settingsComponent.indexOf("const loadPointPreview = useCallback");
  const loadEnd = settingsComponent.indexOf("const refresh = useCallback", loadStart);
  const loader = settingsComponent.slice(loadStart, loadEnd);
  const restoreStart = settingsComponent.indexOf("async function handleConfirmRestore");
  const restoreEnd = settingsComponent.indexOf("function handleRefreshComparison", restoreStart);
  const restoreHandler = settingsComponent.slice(restoreStart, restoreEnd);
  assert.match(loader, /const generation = \+\+previewGeneration\.current/);
  assert.match(loader, /generation !== previewGeneration\.current/);
  assert.match(restoreHandler, /selectedPointIdRef\.current !== pointId \|\| selectionGeneration !== previewGeneration\.current/);
  assert.match(settingsComponent, /function handleCancelRestoreConfirmation\(\)[\s\S]*?setIsRestoreConfirming\(false\)[\s\S]*?setRestoreAcknowledged\(false\)/);
  assert.match(settingsComponent, /disabled=\{!restoreAcknowledged \|\| !restoreRequirementsMet \|\| isRestoring\}/);
});

test("partially loaded Task projections request only titles missing from the projection", () => {
  const projection: Pick<Task, "id" | "title">[] = [
    { id: "projected-task", title: "Already loaded" },
    { id: "blank-title-task", title: "   " },
  ];
  assert.deepEqual(
    getHomeRecoveryTaskTitleLookupIds(
      ["projected-task", "canonical-task", "blank-title-task", "deleted-task", "canonical-task"],
      projection,
    ),
    ["canonical-task", "blank-title-task", "deleted-task"],
  );
  assert.equal(getHomeRecoveryTaskLabel("projected-task", projection, []), "Already loaded");
});

test("valid referenced IDs absent from the Task projection resolve through owner-scoped batches", async () => {
  const ids = Array.from({ length: HOME_RECOVERY_TASK_TITLE_BATCH_SIZE + 1 }, (_, index) => `task-${index}`);
  const mock = mockTaskTitleClient(async (_userId, taskIds) => ({
    data: taskIds.includes("task-0") ? [{ id: "task-0", title: "Canonical Task title" }] : [],
    error: null,
  }));
  const result = await loadHomeRecoveryTaskTitles(mock.client, "owner-a", ids);

  assert.equal(mock.calls.length, 2);
  assert.ok(mock.calls.every((call) => (
    call.table === "adhdice_clean_tasks"
    && call.columns === "id,title"
    && call.ownerColumn === "user_id"
    && call.userId === "owner-a"
    && call.idColumn === "id"
  )));
  assert.deepEqual(mock.calls.map((call) => call.taskIds.length), [HOME_RECOVERY_TASK_TITLE_BATCH_SIZE, 1]);
  assert.equal(result.titleById["task-0"], "Canonical Task title");
  assert.equal(result.unresolvedIds.length, HOME_RECOVERY_TASK_TITLE_BATCH_SIZE);
  assert.equal(getHomeRecoveryTaskLabel("task-0", [], [], result.titleById), "Canonical Task title");
});

test("confirmed deleted Tasks stay distinct from titles that are temporarily unresolved", () => {
  const projection: Pick<Task, "id" | "title">[] = [{ id: "stale-task", title: "Stale projection title" }];
  assert.equal(getHomeRecoveryTaskLabel("stale-task", projection, ["stale-task"]), "Missing Task · stale-task");
  assert.equal(
    getHomeRecoveryTaskLabel("unresolved-task", [], [], {}, true),
    "Task title temporarily unavailable · unresolved-task",
  );
  assert.equal(
    getHomeRecoveryTaskLabel("unresolved-task", [], [], {}, false),
    "Resolving Task title · unresolved-task",
  );
});

test("list changes compare the selected point to the preceding point, including order", () => {
  const current = { taskIds: ["b", "a", "c"], urgentTaskIds: ["u2"], routineTaskIds: ["r1"] };
  const previous = { taskIds: ["a", "b"], urgentTaskIds: ["u1"], routineTaskIds: ["r1", "r2"] };
  const changes = compareHomeRecoveryLists(current, previous);
  assert.deepEqual(changes.todo, { added: ["c"], removed: [], orderChanged: true });
  assert.deepEqual(changes.urgent, { added: ["u2"], removed: ["u1"], orderChanged: false });
  assert.deepEqual(changes.routine, { added: [], removed: ["r2"], orderChanged: false });
});

test("download payload is explicitly Home-only and carries schema, source, and privacy metadata", () => {
  const preview = successfulPreview();
  const document = createHomeOnlyBackupDocument({ ...preview, missing_task_ids: ["missing"] }, "2026-10-15T13:00:00.000Z");
  assert.ok(document);
  assert.equal(document.backup_type, "adhdice_home_only_backup");
  assert.equal(document.format_version, 1);
  assert.equal(document.scope, "Home-only backup");
  assert.equal(document.exported_at, "2026-10-15T13:00:00.000Z");
  assert.equal(document.app_version, HOME_RECOVERY_APP_VERSION);
  assert.equal(document.homeTodo.schema_version, 8);
  assert.deepEqual(document.homeTodo.state, state);
  assert.match(document.privacy_notice, /Scratchpad.*private/);
  assert.deepEqual(Object.keys(document), ["backup_type", "format_version", "scope", "exported_at", "app_version", "recovery_point", "homeTodo", "privacy_notice"]);
  assert.equal(createHomeOnlyBackupDocument({ ...preview, integrity_valid: false }), null);
  assert.equal(createHomeOnlyBackupDocument({ ...preview, schema_compatible: false }), null);
});

test("checkpoint eligibility is derived only from a recorded scheduled attempt and manual capture is owner gated", () => {
  assert.equal(getNextHomeRecoveryEligibility(null), null);
  assert.equal(getNextHomeRecoveryEligibility("2026-10-15T00:00:00.000Z"), "2026-10-15T04:00:00.000Z");
  assert.equal(canCreateHomeRecoveryPoint({ clientAvailable: true, userId: null, statusAvailable: true, pointsAvailable: true }), false);
  assert.equal(canCreateHomeRecoveryPoint({ clientAvailable: true, userId: "user-a", statusAvailable: false, pointsAvailable: true }), false);
  assert.equal(canCreateHomeRecoveryPoint({ clientAvailable: true, userId: "user-a", statusAvailable: true, pointsAvailable: true }), true);
});

test("Settings uses authenticated recovery RPCs, a live owner-scoped preview, and gated RPC restoration", () => {
  assert.match(settingsPage, /<SettingsHomeBackupRecovery client=\{client\} key=\{userId \?\? "no-authenticated-user"\} tasks=\{tasks\} userId=\{userId\}/);
  assert.match(settingsComponent, /loadHomeRecoveryStatus\(rpcClient\)/);
  assert.match(settingsComponent, /loadHomeRecoveryPoints\(rpcClient\)/);
  assert.match(settingsComponent, /loadHomeRecoveryPreview\(rpcClient, pointId\)/);
  assert.match(settingsComponent, /loadAuthoritativeHomeTodoState\(client, userId\)/);
  assert.match(settingsComponent, /loadHomeRecoveryTaskTitles\(client, userId, titleLookupIds\)/);
  assert.match(recoveryModule, /\.from\("adhdice_clean_tasks"\)[\s\S]*?\.eq\("user_id", userId\)[\s\S]*?\.in\("id", batch\)/);
  assert.match(recoveryModule, /\.from\("adhdice_home_todo_state"\)[\s\S]*?\.eq\("user_id", userId\)[\s\S]*?\.maybeSingle\(\)/);
  assert.match(recoveryModule, /p_confirm_restore: false/);
  assert.match(recoveryModule, /p_confirm_restore: true/);
  assert.match(settingsComponent, /createManualHomeRecoveryPoint\(rpcClient\)/);
  assert.match(settingsComponent, /Restore Home/);
  assert.match(settingsComponent, /I understand this will replace the entire saved Home state/);
  assert.match(settingsComponent, /Restore the snapshot from \{formatHomeRecoveryDate\(selectedPoint\.created_at\)\}/);
  assert.match(settingsComponent, /Refresh comparison/);
  assert.match(settingsComponent, /isHomeRecoveryRestoreEnabled\(window\.location\.origin\)/);
  assert.match(recoveryModule, /p_expected_state_revision: expectedStateRevision/);
  assert.match(recoveryModule, /p_expected_restore_generation: expectedRestoreGeneration/);
  assert.match(settingsComponent, /announceHomeTodoRestored/);
  assert.doesNotMatch(recoveryModule, /\.from\("adhdice_recovery_points"\)/);
  assert.doesNotMatch(recoveryModule, /\.from\("adhdice_home_todo_state"\)[\s\S]*?\.(?:insert|update|upsert|delete)\(/);
});

test("Settings width and recovery grids follow the rendered PageShell width", () => {
  assert.match(settingsPage, /layout\.isCanonical \? "max-w-\[70rem\]" : "max-w-none"/);
  assert.match(settingsPage, /settings-page mx-auto w-full/);
  assert.match(settingsStyles, /\.settings-page \.page-shell-body > \* \{\s*min-width: max\(100%, 16rem\);/);
  assert.match(settingsComponent, /settings-recovery-stats-grid/);
  assert.match(settingsComponent, /settings-recovery-panels-grid/);
  assert.match(settingsComponent, /settings-recovery-preview-lists/);
  assert.doesNotMatch(settingsComponent, /(?:sm|md|xl):grid-cols/);
  assert.match(settingsStyles, /@container page-shell \(min-width: 36rem\) \{\s*\.settings-recovery-stats-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(settingsStyles, /@container page-shell \(min-width: 64rem\) \{\s*\.settings-recovery-stats-grid \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(settingsStyles, /@container page-shell \(min-width: 64rem\) \{[\s\S]*?\.settings-recovery-panels-grid \{\s*grid-template-columns: minmax\(16rem, 0\.85fr\) minmax\(0, 1\.4fr\);/);
  assert.match(settingsStyles, /@container page-shell \(min-width: 80rem\) \{\s*\.settings-recovery-preview-lists,\s*\.settings-recovery-changes-grid \{/);
});
