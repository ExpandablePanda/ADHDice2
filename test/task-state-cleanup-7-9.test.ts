import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const app = readFileSync("src/components/task-app.tsx", "utf8");
const create = readFileSync("src/hooks/useTaskCreateAction.ts", "utf8");
const crud = readFileSync("src/hooks/useTaskCrudActions.ts", "utf8");
const subtasks = readFileSync("src/hooks/useTaskSubtaskActions.ts", "utf8");
const editorSave = readFileSync("src/hooks/useTaskEditorSaveAction.ts", "utf8");
const cleanupMigration = readFileSync("supabase/patch_task_state_cleanup_2_7_9_41.sql", "utf8");

const retiredRolloverRpcNames = [
  "adhdice_reconcile_task_rollover",
  "adhdice_apply_task_state_engine_rollover",
] as const;

function sourceFilesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return /\.(?:js|mjs|ts|tsx|sql)$/.test(entry.name) ? [path] : [];
  });
}

test("canonical Task creation and import have no direct Task-table fallback", () => {
  assert.match(create, /insertTaskRowWithCanonicalCreation/);
  assert.match(crud, /insertImportedTaskRow/);
  assert.match(crud, /canonicalTaskCreator\(payload, "task_import"\)/);
  assert.doesNotMatch(create, /from\(["']adhdice_clean_tasks["']\)|\.insert\(/);
  assert.doesNotMatch(crud, /from\(["']adhdice_clean_tasks["']\)|\.insert\(/);
});

test("child rows use canonical same-table Task State", () => {
  assert.doesNotMatch(subtasks, /adhdice_task_subtasks|adhdice_legacy_subtask_promotions/);
  assert.match(subtasks, /buildChildTaskCreationDraft/);
  assert.match(subtasks, /canonicalTaskStateUpdate/);
});

test("production Task State cleanup removes the runtime gate module and legacy rollover callers", () => {
  assert.equal(existsSync("src/lib/task-state-runtime-gate.ts"), false);
  assert.equal(existsSync("src/lib/task-state-engine/legacy-adapter.ts"), false);
  assert.equal(existsSync("src/lib/task-state-engine/due-date-authority.ts"), false);
  assert.doesNotMatch(app, /TASK_STATE_CANONICAL_COMMANDS_ENABLED|adhdice_reconcile_task_rollover|adhdice_apply_task_state_engine_rollover/);
  assert.doesNotMatch(editorSave, /usedNestedFallback|nested-subtask support|subtask parent migration/);
});

test("7.9.41 migration drops each obsolete rollover function by its live signature", () => {
  assert.match(cleanupMigration, /drop function if exists public\.adhdice_reconcile_task_rollover\(\s*uuid,\s*timestamp with time zone\s*\);/i);
  assert.match(cleanupMigration, /drop function if exists public\.adhdice_apply_task_state_engine_rollover\(\s*uuid,\s*jsonb,\s*timestamp with time zone\s*\);/i);
  assert.match(cleanupMigration, /drop function if exists public\.adhdice_task_next_due_date\(\s*public\.adhdice_clean_task_repeat_frequency,\s*integer,\s*smallint\[\],\s*integer,\s*date\s*\);/i);
  assert.match(cleanupMigration, /drop function if exists public\.adhdice_task_next_due_date\(\s*public\.adhdice_clean_task_repeat_frequency,\s*integer,\s*smallint\[\],\s*integer,\s*date,\s*public\.adhdice_clean_task_repeat_monthly_mode,\s*public\.adhdice_clean_task_repeat_monthly_ordinal,\s*smallint\s*\);/i);
  assert.match(cleanupMigration, /drop function if exists public\.adhdice_resolve_recurring_due_status\(\s*date,\s*time without time zone,\s*date,\s*time without time zone\s*\);/i);
  assert.doesNotMatch(cleanupMigration, /cascade/i);
  assert.doesNotMatch(cleanupMigration, /adhdice_execute_task_state_command|adhdice_task_history|adhdice_clean_tasks|adhdice_task_rollover_ledger/i);
});

test("production source has no callers for retired rollover RPCs", () => {
  const productionFiles = ["src", "scripts", "supabase/functions"].flatMap(sourceFilesUnder);
  for (const file of productionFiles) {
    const source = readFileSync(file, "utf8");
    for (const rpcName of retiredRolloverRpcNames) {
      assert.doesNotMatch(source, new RegExp(`\\b${rpcName}\\b`), `${file} must not call ${rpcName}`);
    }
  }
});
