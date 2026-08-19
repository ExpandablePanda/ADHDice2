import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSource = readFileSync(new URL("../supabase/patch_task_permanent_tombstones_7_9_54.sql", import.meta.url), "utf8");
const mutationSource = readFileSync(new URL("../src/lib/task-db-mutations.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const workspaceSource = readFileSync(new URL("../src/hooks/useWorkspaceData.ts", import.meta.url), "utf8");

test("permanent Trash deletion is an owner-scoped tombstone and preserves child facts", () => {
  assert.match(migrationSource, /add column if not exists permanently_deleted_at timestamptz/);
  assert.match(migrationSource, /security invoker/);
  assert.match(migrationSource, /auth\.uid\(\)/);
  assert.match(migrationSource, /task\.status = 'trashed'/);
  assert.match(migrationSource, /set permanently_deleted_at = clock_timestamp\(\)/);
  assert.doesNotMatch(migrationSource, /delete\s+from\s+public\.adhdice_clean_tasks/i);
  assert.match(migrationSource, /grant execute on function public\.adhdice_mark_tasks_permanently_deleted\(uuid\[\]\) to authenticated/);

  assert.match(mutationSource, /adhdice_mark_tasks_permanently_deleted/);
  assert.match(mutationSource, /if \(expectedTask\?\.status === "trashed"\)/);
  assert.match(appSource, /markTaskRowsPermanentlyDeleted\(client, taskIds\)/);
  assert.match(workspaceSource, /\.is\("permanently_deleted_at", null\)/);
});
