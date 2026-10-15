import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canCreateHomeRecoveryPoint,
  compareHomeRecoveryLists,
  createHomeOnlyBackupDocument,
  createManualHomeRecoveryPoint,
  HOME_RECOVERY_APP_VERSION,
  getHomeRecoveryListIds,
  getHomeRecoveryTaskLabel,
  getHomeRecoveryTaskTitleLookupIds,
  getNextHomeRecoveryEligibility,
  HOME_RECOVERY_TASK_TITLE_BATCH_SIZE,
  loadHomeRecoveryTaskTitles,
  loadHomeRecoveryPoints,
  loadHomeRecoveryPreview,
  loadHomeRecoveryStatus,
  type HomeRecoveryPoint,
  type HomeRecoveryRpcClient,
  type HomeRecoveryStatus,
} from "@/lib/home-recovery-dashboard";
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

test("Settings uses authenticated recovery RPCs without table access or a Restore call", () => {
  assert.match(settingsPage, /<SettingsHomeBackupRecovery client=\{client\} key=\{userId \?\? "no-authenticated-user"\} tasks=\{tasks\} userId=\{userId\}/);
  assert.match(settingsComponent, /loadHomeRecoveryStatus\(rpcClient\)/);
  assert.match(settingsComponent, /loadHomeRecoveryPoints\(rpcClient\)/);
  assert.match(settingsComponent, /loadHomeRecoveryPreview\(rpcClient, pointId\)/);
  assert.match(settingsComponent, /loadHomeRecoveryTaskTitles\(client, userId, titleLookupIds\)/);
  assert.match(recoveryModule, /\.from\("adhdice_clean_tasks"\)[\s\S]*?\.eq\("user_id", userId\)[\s\S]*?\.in\("id", batch\)/);
  assert.match(settingsComponent, /createManualHomeRecoveryPoint\(rpcClient\)/);
  assert.match(settingsComponent, /disabled[^>]*type="button">Restore/);
  assert.doesNotMatch(settingsComponent, /restore_home_recovery_point|\.from\("adhdice_(?:recovery|home_todo_state)/);
  assert.doesNotMatch(recoveryModule, /\.from\("adhdice_(?:recovery|home_todo_state)/);
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
