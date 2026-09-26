import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  executeRecordsPipeline,
  RecordsSourceChangedError,
} from "../src/lib/record-repository.ts";
import {
  isRecordsSourceState,
  recordsSourceStatesMatch,
  type RecordsSourceState,
} from "../src/lib/records/source-state.ts";

const sql = readFileSync(new URL("../supabase/patch_records_source_freshness_7_15_49.sql", import.meta.url), "utf8");
const repository = readFileSync(new URL("../src/lib/record-repository.ts", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/hooks/useRecords.ts", import.meta.url), "utf8");
const recordsTab = readFileSync(new URL("../src/components/task-app/records-tab.tsx", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../src/lib/records/persistence.ts", import.meta.url), "utf8");
const evaluator = readFileSync(new URL("../src/lib/records/evaluator.ts", import.meta.url), "utf8");

const sourceState: RecordsSourceState = {
  schema_version: "records-source-state-v1",
  history_sync_epoch: "00000000-0000-4000-8000-000000000001",
  history_revision: 12,
  task_row_count: 522,
  task_digest: `sha256:${"1".repeat(64)}`,
  focus_row_count: 859,
  focus_digest: `sha256:${"2".repeat(64)}`,
};

test("source state uses the History sync fence and Records-relevant Task fields only", () => {
  assert.match(sql, /state\.sync_epoch/);
  assert.match(sql, /state\.current_revision/);
  for (const field of ["task.id", "task.parent_task_id", "task.title", "task.repeat_frequency", "task.exclude_from_tracking"]) {
    assert.match(sql, new RegExp(field.replaceAll(".", "\\.")));
  }
  assert.match(sql, /task\.permanently_deleted_at is null/);
  assert.match(sql, /select count\(\*\)::integer/);
  for (const unrelatedField of ["task.notes", "task.priority", "task.tags", "task\.updated_at"]) {
    assert.doesNotMatch(sql, new RegExp(unrelatedField.replace("\\.", "\\.")));
  }
});

test("source state includes every mutable Focus input consumed by evaluation", () => {
  for (const field of [
    "session.id", "session.category_id", "session.title_snapshot", "session.session_date",
    "session.duration_seconds", "session.started_at", "session.ended_at", "session.source",
    "session.runtime_session_id", "session.created_at",
  ]) {
    assert.match(sql, new RegExp(field.replaceAll(".", "\\.")));
  }
  assert.match(evaluator, /duration_seconds/);
  assert.match(evaluator, /runtime_session_id/);
  assert.match(evaluator, /started_at/);
  assert.match(evaluator, /ended_at/);
  assert.match(evaluator, /created_at/);
});

test("source states are deterministic, owner-scoped, and change for each source fence", () => {
  assert.equal(isRecordsSourceState(sourceState), true);
  assert.equal(recordsSourceStatesMatch(sourceState, { ...sourceState }), true);
  assert.equal(recordsSourceStatesMatch(sourceState, { ...sourceState, history_revision: 13 }), false);
  assert.equal(recordsSourceStatesMatch(sourceState, { ...sourceState, history_sync_epoch: "00000000-0000-4000-8000-000000000002" }), false);
  assert.equal(recordsSourceStatesMatch(sourceState, { ...sourceState, task_row_count: 521 }), false);
  assert.equal(recordsSourceStatesMatch(sourceState, { ...sourceState, task_digest: `sha256:${"3".repeat(64)}` }), false);
  assert.equal(recordsSourceStatesMatch(sourceState, { ...sourceState, focus_row_count: 858 }), false);
  assert.equal(recordsSourceStatesMatch(sourceState, { ...sourceState, focus_digest: `sha256:${"4".repeat(64)}` }), false);

  assert.match(sql, /create or replace function public\.adhdice_get_records_source_state\(\)/);
  assert.match(sql, /adhdice_records_source_state_for_owner\([\s\S]*security invoker/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /p_user_id is null or auth\.uid\(\) is distinct from p_user_id/);
  assert.match(sql, /revoke all on function public\.adhdice_get_records_source_state\(\) from public, anon/);
  assert.match(sql, /grant execute on function public\.adhdice_get_records_source_state\(\) to authenticated/);
});

test("completed Runs persist and return the source fence, with legacy rows remaining nullable", () => {
  assert.match(sql, /add column if not exists source_state jsonb/);
  assert.match(sql, /source_state is null/);
  assert.match(sql, /source_state, expires_at/);
  assert.match(sql, /v_now \+ interval '45 minutes'/);
  assert.match(sql, /v_run\.source_state is not null/);
  assert.match(sql, /adhdice_get_latest_completed_records_run[\s\S]*source_state jsonb/);
  assert.match(sql, /run\.logical_day_start, run\.source_state/);
  assert.match(persistence, /source_state\?: RecordsSourceState/);
});

test("source changes during evaluation cannot be certified and the production pipeline retries once", async () => {
  let sourceReads = 0;
  let reconciliations = 0;
  const changed = { ...sourceState, focus_digest: `sha256:${"5".repeat(64)}` };
  await assert.rejects(
    () => executeRecordsPipeline({
      evaluate: () => ({}),
      loadCurrentRecords: async () => [],
      loadFocusSessions: async () => [],
      loadRecordEvents: async () => [],
      loadRecordsSourceState: async () => (sourceReads++ === 0 ? sourceState : changed),
      loadTaskHistory: async () => [],
      loadTasks: async () => [],
      reconcile: async () => { reconciliations += 1; },
    }),
    (error: unknown) => error instanceof RecordsSourceChangedError,
  );
  assert.equal(reconciliations, 0);
  assert.match(repository, /sourceStateBefore/);
  assert.match(repository, /sourceStateAfter/);
  assert.match(repository, /attempt < 2/);
  assert.match(sql, /using errcode = '40001'/);
});

test("source-certified opens bypass the 12-hour timer and the full evaluator, while legacy or changed sources do not", () => {
  assert.match(hook, /const durableIsFresh = sourceStateAvailable\s*\n\s*\? Boolean\(durableRun && rulesMatch && durableRun\.source_state && sourceStateMatched\)/);
  assert.match(hook, /if \(durableIsFresh\)[\s\S]*loadPersistedRecords/);
  assert.match(hook, /decision = sourceStateAvailable && durableRun\?\.source_state \? "source_changed" : "legacy_uncertified"/);
  assert.match(hook, /if \(!explicitRefresh\)/);
  assert.match(hook, /decision: input\.decision/);
  assert.match(hook, /isRecordsFresh\(durableRun\.evaluated_at\)/);
  assert.match(hook, /isRecordsInvalidatedAfter\(durableRun\.evaluated_at, invalidatedAt\)/);
});

test("matching server state clears local invalidation, and diagnostics stay compact", () => {
  const savedBranch = hook.slice(hook.indexOf("if (durableIsFresh)"), hook.indexOf("decision = sourceStateAvailable"));
  assert.match(savedBranch, /clearRecordsInvalidation/);
  assert.match(hook, /sourceStateFingerprint/);
  assert.match(hook, /persistedCurrentRowCount/);
  assert.match(hook, /validEventRowCount/);
  assert.match(hook, /invalidatedEventsLoaded/);
  assert.doesNotMatch(hook, /console\.info\([^)]*taskHistory|console\.info\([^)]*sourceRows/);
});

test("normal persisted event loading is valid-only; invalidated events are a separate lazy request", () => {
  const persistedLoader = repository.slice(repository.indexOf("export async function loadPersistedRecords"), repository.indexOf("export async function loadRecordsSourceState"));
  assert.match(persistedLoader, /loadRecordEvents\(client, userId\)/);
  assert.match(repository, /loadRecordEvents\(client: RecordsClient, userId: string\)/);
  assert.match(repository, /\.eq\("validity_state", "valid"\)/);
  assert.match(repository, /loadInvalidatedRecordEvents/);
  assert.match(repository, /\.in\("validity_state", \["invalid", "superseded"\]\)/);
  assert.match(hook, /loadInvalidatedRecordEvents\(client, userId\)/);
  assert.match(hook, /invalidatedEventsRequestRef/);
  assert.match(recordsTab, /const history = records\.events\.filter/);
  assert.match(recordsTab, /loadInvalidatedEvents\(\)/);
  assert.match(recordsTab, /showInvalidated \|\| event\.validity_state === "valid"/);
});

test("lazy invalidated state is owner/session fenced and card previous values remain valid-only", () => {
  assert.match(hook, /latestOwnerRef\.current !== userId \|\| latestSessionKeyRef\.current !== sessionKey/);
  assert.match(hook, /invalidatedEventsLoadedKeyRef\.current !== sessionKey/);
  assert.match(recordsTab, /events\n\s+\.filter\(\(event\) => event\.validity_state === "valid"/);
  assert.match(recordsTab, /event\.validity_state === "valid" && matchesRecord/);
  assert.match(recordsTab, /setShowInvalidated\(false\)/);
  assert.match(persistence, /evidence_snapshot/);
  assert.match(hook, /resolveSavedDetails/);
  assert.match(hook, /provisionalCandidates/);
});
