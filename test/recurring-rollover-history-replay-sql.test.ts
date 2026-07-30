import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canonical = readFileSync("supabase/patch_daily_until_complete_rollover_rpc.sql", "utf8");
const forward = readFileSync("supabase/fix_recurring_rollover_history_replay_7_1_0.sql", "utf8");
const achievementRuntime = readFileSync("supabase/add_achievement_mvp_runtime.sql", "utf8");

const regularStart = canonical.lastIndexOf("if v_task.status not in ('pending'");
const regularEnd = canonical.indexOf("insert into public.adhdice_task_rollover_ledger", regularStart);
const regularBranch = canonical.slice(regularStart, regularEnd);

type HistoryRow = {
  occurrenceKey: string | null;
  status: "complete" | "did_my_best" | "done" | "missed";
  updatedAt: string;
};

function insertMissingHistory(rows: Map<string, HistoryRow>, generatedDates: string[]) {
  let achievementTriggerCalls = 0;
  let insertedHistoryCount = 0;
  for (const date of generatedDates) {
    if (rows.has(date)) continue;
    rows.set(date, { occurrenceKey: null, status: "missed", updatedAt: "new" });
    achievementTriggerCalls += 1;
    insertedHistoryCount += 1;
  }
  return { achievementTriggerCalls, insertedHistoryCount, rows };
}

test("continuous-overdue SQL inserts every completed logical day without updating conflicts", () => {
  assert.match(regularBranch, /on conflict \(user_id, task_id, entry_date\) do nothing;/);
  assert.match(regularBranch, /get diagnostics v_row_count = row_count;\s+v_inserted_history_count := v_inserted_history_count \+ v_row_count;/);
  assert.doesNotMatch(regularBranch, /on conflict \(user_id, task_id, entry_date\) do update/);
  assert.match(regularBranch, /v_history_date := v_task\.due_on/);
  assert.match(regularBranch, /v_history_date := v_history_date \+ 1/);
  assert.match(regularBranch, /status = 'missed'/);
  assert.doesNotMatch(regularBranch, /adhdice_task_next_due_date/);
  assert.doesNotMatch(regularBranch, /(^|\n)\s*due_on\s*=/);
  assert.doesNotMatch(regularBranch, /status\s*=\s*'(pending|upcoming|not_due)'/);
});

test("existing outcomes, occurrence identity, and timestamps remain authoritative", () => {
  const rows = new Map<string, HistoryRow>([
    ["2026-07-01", { occurrenceKey: "occurrence:2026-07-01", status: "done", updatedAt: "done-at" }],
    ["2026-07-02", { occurrenceKey: "occurrence:2026-07-02", status: "did_my_best", updatedAt: "best-at" }],
    ["2026-07-03", { occurrenceKey: null, status: "missed", updatedAt: "missed-at" }],
    ["2026-07-04", { occurrenceKey: "lifetime:task", status: "complete", updatedAt: "complete-at" }],
  ]);
  const before = structuredClone([...rows]);
  const first = insertMissingHistory(rows, ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05", "2026-07-06"]);
  assert.deepEqual([...rows].slice(0, 4), before);
  assert.equal(first.insertedHistoryCount, 2);
  assert.equal(first.achievementTriggerCalls, 2);
  const second = insertMissingHistory(rows, ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05", "2026-07-06"]);
  assert.equal(second.insertedHistoryCount, 0);
  assert.equal(second.achievementTriggerCalls, 0);
});

test("legacy forward migration remains guarded and transactional", () => {
  const afterStart = forward.indexOf("$after$") + "$after$".length;
  const afterEnd = forward.indexOf("$after$;", afterStart);
  const correctedBlock = forward.slice(afterStart, afterEnd);
  assert.match(forward, /^begin;/m);
  assert.match(forward, /pg_get_functiondef\(v_target\)/);
  assert.match(forward, /v_match_count <> 1/);
  assert.match(forward, /v_rewritten := replace\(v_definition, v_before, v_after\)/);
  assert.match(forward, /execute v_rewritten;/);
  assert.match(forward, /notify pgrst, 'reload schema';\s+commit;/);
  assert.match(forward, /\$after\$[\s\S]*on conflict \(user_id, task_id, entry_date\) do nothing;[\s\S]*v_inserted_history_count := v_inserted_history_count \+ v_row_count;/);
  assert.match(forward, /\$before\$[\s\S]*on conflict \(user_id, task_id, entry_date\) do update[\s\S]*v_inserted_history_count := v_inserted_history_count \+ 1;/);
  assert.match(correctedBlock, /on conflict \(user_id, task_id, entry_date\) do nothing/);
});

test("active-status, all repeat modes, ledger, and Achievement trigger contracts stay intact", () => {
  const activeBranch = canonical.slice(canonical.indexOf("if v_task.status = 'in_progress'\n      and v_task.active_status_logical_date"), regularStart);
  assert.match(activeBranch, /v_task\.active_status_logical_date,\s+'did_my_best'/);
  assert.match(activeBranch, /coalesce\(v_task\.active_occurrence_due_on, v_task\.due_on, v_task\.active_status_logical_date\)/);
  assert.match(activeBranch, /if v_task\.repeat_frequency = 'none' then/);
  assert.doesNotMatch(activeBranch, /repeat_frequency = 'none' or v_task\.active_occurrence_due_on is null/);
  assert.match(activeBranch, /on conflict \(user_id, task_id, entry_date\) do nothing/);
  assert.match(activeBranch, /adhdice_task_next_due_date/);
  assert.match(regularBranch, /on conflict \(user_id, task_id, entry_date\) do nothing/);
  assert.match(canonical, /p_repeat_monthly_mode[\s\S]*p_repeat_monthly_ordinal[\s\S]*p_repeat_monthly_weekday/);
  assert.ok(canonical.indexOf("insert into public.adhdice_task_rollover_ledger") > regularEnd - 1);
  assert.match(achievementRuntime, /after insert or update of status, was_completed, occurrence_key, occurrence_due_on[\s\S]*on public\.adhdice_task_history for each row/);
  assert.doesNotMatch(forward, /create trigger|drop trigger|adhdice_evaluate_achievements\s*\(/i);
});
