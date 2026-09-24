import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/add_task_current_projection_realtime_7_15_25.sql", import.meta.url),
  "utf8",
);
const verification = readFileSync(
  new URL("../supabase/verify_task_current_projection_7_15_25.sql", import.meta.url),
  "utf8",
);
const workspaceSource = readFileSync(
  new URL("../src/hooks/useWorkspaceData.ts", import.meta.url),
  "utf8",
);
const taskAppSource = readFileSync(
  new URL("../src/components/task-app.tsx", import.meta.url),
  "utf8",
);
const executableMigration = migration.replace(/--.*$/gm, "");

test("7.15.25 adds only the current projection table to the existing Realtime publication", () => {
  assert.match(migration, /alter publication supabase_realtime\s+add table public\.adhdice_task_current_projections/i);
  assert.match(migration, /not exists[\s\S]*pg_publication_tables[\s\S]*supabase_realtime/i);
  assert.doesNotMatch(executableMigration, /drop publication|create publication/i);
  assert.doesNotMatch(executableMigration, /insert\s+into|update\s+public\.|delete\s+from|backfill|adhdice_upsert_task_current_projection/i);
  assert.doesNotMatch(executableMigration, /alter publication supabase_realtime\s+add table(?! public\.adhdice_task_current_projections)/i);
});

test("7.15.25 verification remains read-only and checks publication, validity, and all freshness fences", () => {
  assert.doesNotMatch(verification, /\b(insert|update|delete|alter|create|drop)\b/i);
  for (const field of [
    "canonical_revision_match",
    "history_sync_epoch_match",
    "settings_revision_match",
    "logical_date_match",
    "schema_version_match",
    "algorithm_version_match",
  ]) {
    assert.match(verification, new RegExp(field));
  }
  assert.match(verification, /projection_table_appears_once/);
  assert.match(verification, /repair_required_count/);
  assert.match(verification, /unavailable_count/);
  assert.match(verification, /missing_count/);
});

test("workspace startup and the dedicated projection Realtime channel use the owner-scoped lifecycle", () => {
  assert.match(workspaceSource, /from\("adhdice_task_current_projections"\)[\s\S]*select\(CURRENT_TASK_PROJECTION_READ_COLUMNS\)[\s\S]*eq\("user_id", userId\)/);
  assert.match(workspaceSource, /from\("adhdice_task_history_sync_state"\)[\s\S]*select\("sync_epoch,protocol_version"\)/);
  assert.match(workspaceSource, /Promise\.all\(\[[\s\S]*currentTaskProjectionRequest[\s\S]*historySyncStateRequest/);
  assert.match(workspaceSource, /setIsCurrentTaskProjectionReadReady\(true\)/);
  assert.match(workspaceSource, /client\.channel\(`adhdice_task_current_projections:\$\{userId\}`\)/);
  assert.match(workspaceSource, /event: "INSERT"[\s\S]*table: "adhdice_task_current_projections"[\s\S]*filter: `user_id=eq\.\$\{userId\}`/);
  assert.match(workspaceSource, /event: "UPDATE"[\s\S]*table: "adhdice_task_current_projections"[\s\S]*filter: `user_id=eq\.\$\{userId\}`/);
  assert.match(workspaceSource, /createCurrentTaskProjectionEventBuffer/);
  assert.match(workspaceSource, /mergeCurrentTaskProjectionRows/);
  assert.match(workspaceSource, /projectionEventBuffer\.dispose\(\)/);
  const projectionLifecycleSource = workspaceSource.match(/const projectionEventBuffer[\s\S]*?const workspaceChannel/)?.[0] ?? "";
  assert.doesNotMatch(projectionLifecycleSource, /requestCoreWorkspaceRefresh/);
  assert.match(projectionLifecycleSource, /shouldReconnectProjectionChannel/);
  assert.match(projectionLifecycleSource, /projectionChannelRemovalPromiseRef/);
  const workspaceChannelSource = workspaceSource.slice(
    workspaceSource.indexOf("const workspaceChannel = client.channel"),
    workspaceSource.indexOf("return () => {", workspaceSource.indexOf("const workspaceChannel = client.channel")),
  );
  assert.doesNotMatch(workspaceChannelSource, /table: "adhdice_task_current_projections"/);
  assert.match(taskAppSource, /const isInitialTaskStateProjectionReady = isCurrentTaskProjectionReadReady && isBehaviorAuthorityReady/);
  assert.doesNotMatch(taskAppSource, /const isInitialTaskStateProjectionReady = isTaskHistoryLoaded/);
});
