import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SQL_PATH = "supabase/diagnostic_task_state_date_repair_7_6_17.sql";
const FORWARD_RESET_SQL_PATH = "supabase/patch_task_state_forward_reset_7_6_18.sql";
const FORWARD_RESET_PREVIEW_SQL_PATH = "supabase/preview_task_state_forward_reset_7_6_18.sql";
const FORWARD_RESET_7_6_19_SQL_PATH = "supabase/patch_task_state_forward_reset_7_6_19.sql";
const FORWARD_RESET_7_6_19_PREVIEW_SQL_PATH = "supabase/preview_task_state_forward_reset_7_6_19.sql";
const HISTORICAL_REPAIR_REPORT_IDS = [
  "96d688b4-54f5-4884-9971-38b43cba4aa5", "40dfaed0-4c1c-4ab0-a930-3bc0accbed94",
  "b421f72a-2745-46df-81a1-d8c8416e1951", "87a9e225-b385-44c7-b336-c3b9c6c5ea1b",
  "8ee7441c-2e4d-439a-be7f-d1e19fdb2a41", "81b64697-4291-4d3d-913a-c9d0e2f8d804",
  "27035f67-c008-4e54-9761-c7f01cf0604d", "0c3ccc7b-fcce-4a6a-aa77-9c5cfd471fc7",
  "723be9b2-64c0-43a9-b49a-5b7f648f57ea", "a1eb2348-99ed-42bd-867b-ceb246128066",
  "b4940db0-5217-4f53-99d0-60e46933e58e", "09180da0-58bb-46e4-8ec2-53c1cc4d2f21",
  "7fb30d0c-1d12-4c3e-9c82-f39a82ff6055", "f4e11d51-6bba-4eff-a05f-7c2e81f19a92",
  "c72a281c-5932-4b7b-8e49-4ee4397acf6e", "058390ab-cc42-49ec-a458-8da05773732b",
  "8b50fb4b-a634-4c15-afb3-70307ebc528a", "d5d2d1ba-94f1-47d3-a7af-11fd3f208db1",
  "df4ef91d-fcee-4411-970c-0c1cf9520ff5", "dba6e6d4-981f-4941-a5c9-e78e8def250f",
  "a3e34bd7-35dd-44b0-82e0-7677c957c5f0", "713cfd40-287c-4531-bba5-46d9f6f2a496",
  "a415dc65-b841-448b-b8a8-4b299987cb8a", "01eda993-ddfc-4fb1-b817-1fb986d1b7b2",
  "52e90aba-364a-4b9f-8c03-e512a099fe44", "46c06353-7930-4ed3-9449-4ae2084ffa57",
  "c48c40ee-296a-4bd5-aec4-eec75ccf48ba", "9f69b644-4943-4329-9162-53fefe1bc7dc",
] as const;

const EXPECTED_CORRECTIONS = [
  ["96d688b4-54f5-4884-9971-38b43cba4aa5", "2027-05-31", "2026-08-03"],
  ["40dfaed0-4c1c-4ab0-a930-3bc0accbed94", "2027-05-31", "2026-08-03"],
  ["b421f72a-2745-46df-81a1-d8c8416e1951", "2027-05-31", "2026-08-03"],
  ["8ee7441c-2e4d-439a-be7f-d1e19fdb2a41", "2027-05-31", "2026-08-03"],
  ["81b64697-4291-4d3d-913a-c9d0e2f8d804", "2027-05-31", "2026-08-03"],
  ["27035f67-c008-4e54-9761-c7f01cf0604d", "2027-05-31", "2026-08-03"],
  ["058390ab-cc42-49ec-a458-8da05773732b", "2027-06-07", "2026-08-10"],
  ["8b50fb4b-a634-4c15-afb3-70307ebc528a", "2027-06-07", "2026-08-10"],
  ["d5d2d1ba-94f1-47d3-a7af-11fd3f208db1", "2027-06-07", "2026-08-10"],
  ["52e90aba-364a-4b9f-8c03-e512a099fe44", "2027-06-01", "2026-08-04"],
  ["46c06353-7930-4ed3-9449-4ae2084ffa57", "2027-06-03", "2026-08-06"],
] as const;

test("7.6.17 dry run contains the exact 11 correction triples once", async () => {
  const sql = await readFile(SQL_PATH, "utf8");
  const ids = [...sql.matchAll(/'([0-9a-f-]{36})'::uuid/g)].map((match) => match[1]);
  assert.deepEqual(ids, EXPECTED_CORRECTIONS.map(([id]) => id));
  assert.equal(new Set(ids).size, 11);

  for (const [id, corrupted, proposed] of EXPECTED_CORRECTIONS) {
    const row = new RegExp(`\\('${id}'::uuid, date '${corrupted}', date '${proposed}'`);
    assert.match(sql, row);
  }
});

test("7.6.17 dry run is CTE-and-select only and fails closed", async () => {
  const sql = await readFile(SQL_PATH, "utf8");
  assert.doesNotMatch(sql, /\b(update|insert|delete|merge)\b/i);
  assert.doesNotMatch(sql, /\b(call|do|create|alter|drop|truncate|grant|revoke)\b/i);
  assert.doesNotMatch(sql, /\badhdice_[a-z0-9_]*\s*\(/i);
  assert.match(sql, /^\s*--[\s\S]*\bwith\s+expected_raw\b/i);
  assert.equal((sql.match(/;\s*(?:--[^\n]*\s*)*$/g) ?? []).length, 1);

  assert.match(sql, /checked\.\*,\s*task_exists\s+and current_date_matches_expected_corruption/);
  for (const guard of [
    "current_date_matches_expected_corruption",
    "recurrence_configuration_matches_report",
    "recurrence_supports_proposed_date",
    "active_recurring_task",
    "expected_id_is_unique",
  ]) {
    assert.match(sql, new RegExp(`and ${guard}`));
  }
});

test("7.6.18 forward reset contains the exact unique 28-ID repair-report scope", async () => {
  const sql = await readFile(FORWARD_RESET_SQL_PATH, "utf8");
  const sqlIds = [...sql.matchAll(/'([0-9a-f-]{36})'::uuid/g)].map((match) => match[1]);

  assert.equal(sqlIds.length, 28);
  assert.equal(new Set(sqlIds).size, 28);
  assert.deepEqual(sqlIds, HISTORICAL_REPAIR_REPORT_IDS);
});

test("7.6.18 forward reset guards every ID by its exact live corruption snapshot", async () => {
  const sql = await readFile(FORWARD_RESET_SQL_PATH, "utf8");
  const expectedPairs = [...sql.matchAll(/\('([0-9a-f-]{36})'::uuid, date '(\d{4}-\d{2}-\d{2})'\)/g)]
    .map((match) => [match[1], match[2]] as const);

  assert.equal(expectedPairs.length, 28);
  assert.equal(new Set(expectedPairs.map(([id]) => id)).size, 28);
  assert.equal(expectedPairs.filter(([, date]) => date === "2026-10-01").length, 7);
  assert.equal(expectedPairs.filter(([, date]) => date.startsWith("2027-")).length, 21);
  assert.match(sql, /current_due_on = expected_corrupted_due_on\s+as current_date_is_affected_corruption/i);
  assert.match(sql, /task\.due_on = snapshot\.expected_corrupted_due_on/i);
  assert.doesNotMatch(sql, /extract\(year from (?:current_due_on|task\.due_on)\) = 2027/i);
});

test("7.6.18 preview, guarded update, and verification share one snapshot", async () => {
  const sql = await readFile(FORWARD_RESET_SQL_PATH, "utf8");
  assert.match(sql, /begin;[\s\S]*create temporary table adhdice_task_state_forward_reset_7_6_18_snapshot[\s\S]*on commit drop/i);
  assert.match(sql, /-- 1\. READ-ONLY PREVIEW[\s\S]*select[\s\S]*eligible_count[\s\S]*unchanged[\s\S]*skipped[\s\S]*missing/i);
  assert.match(sql, /-- 2\. GUARDED UPDATE[\s\S]*update public\.adhdice_clean_tasks/i);
  assert.match(sql, /-- 3\. POST-UPDATE VERIFICATION[\s\S]*verification_result/i);
  assert.match(sql, /commit;\s*$/i);

  for (const output of [
    "task_id", "title", "current_due_on", "proposed_forward_due_on", "logical_date",
    "recurrence_configuration", "explicit_future_occurrences_consumed", "repair_reason",
    "current_revision", "eligible", "skip_reason",
  ]) {
    assert.match(sql, new RegExp(`\\b${output}\\b`));
  }
});

test("7.6.18 standalone preview rolls back and contains no persistent mutation", async () => {
  const [previewSql, patchSql] = await Promise.all([
    readFile(FORWARD_RESET_PREVIEW_SQL_PATH, "utf8"),
    readFile(FORWARD_RESET_SQL_PATH, "utf8"),
  ]);
  const previewIds = [...previewSql.matchAll(/'([0-9a-f-]{36})'::uuid/g)].map((match) => match[1]);
  const patchIds = [...patchSql.matchAll(/'([0-9a-f-]{36})'::uuid/g)].map((match) => match[1]);

  assert.deepEqual(previewIds, patchIds);
  assert.equal(new Set(previewIds).size, 28);
  assert.match(previewSql, /^-- ADHDice 7\.6\.18[\s\S]*\bbegin;[\s\S]*-- 1\. READ-ONLY PREVIEW/i);
  assert.match(previewSql, /rollback;\s*$/i);
  assert.doesNotMatch(previewSql, /-- 2\. GUARDED UPDATE|-- 3\. POST-UPDATE VERIFICATION/i);
  assert.doesNotMatch(previewSql, /\bupdate\s+public\.|\binsert\s+into\s+public\.|\bdelete\s+from\s+public\.|\bcall\b/i);
});

test("7.6.18 calculation covers logical-day and fixed recurrence contracts", async () => {
  const sql = await readFile(FORWARD_RESET_SQL_PATH, "utf8");

  assert.match(sql, /adhdice_effective_logical_date\([\s\S]*statement_timestamp\(\)[\s\S]*timezone[\s\S]*rollover_time/i);
  assert.match(sql, /coalesce\(nullif\(profile\.timezone, ''\), 'America\/New_York'\)/i);
  assert.match(sql, /coalesce\(nullif\(profile\.day_start_time, ''\), '06:00'\)/i);

  assert.match(sql, /recurrence_type = 'weekly'[\s\S]*cardinality\(validity\.recurrence_weekdays\) = 0[\s\S]*extract\(dow from validity\.current_due_on\)/i);
  assert.match(sql, /any\([\s\S]*validity\.recurrence_weekdays/i);
  assert.match(sql, /mod\([\s\S]*validity\.recurrence_interval/i);
  assert.match(sql, /recurrence_type = 'monthly'[\s\S]*repeat_monthly_mode = 'day_of_month'/i);
  assert.match(sql, /repeat_monthly_mode = 'ordinal_weekday'[\s\S]*repeat_monthly_ordinal = 'last'/i);
  assert.match(sql, /array\['first', 'second', 'third', 'fourth'\]/i);
});

test("7.6.18 last ordinal weekday subtracts its offset from an explicit date", async () => {
  const sql = await readFile(FORWARD_RESET_SQL_PATH, "utf8");

  assert.match(
    sql,
    /make_date\([\s\S]*?extract\(day from \(date_trunc\('month', candidate\.occurrence_date\) \+ interval '1 month - 1 day'\)\)::integer[\s\S]*?\) as month_end_date/i,
  );
  assert.match(
    sql,
    /repeat_monthly_ordinal = 'last'\s+and candidate\.occurrence_date = month_boundary\.month_end_date - mod\(\s*extract\(dow from month_boundary\.month_end_date\)::integer/i,
  );
  assert.doesNotMatch(sql, /candidate\.occurrence_date = case/i);
  assert.doesNotMatch(sql, /(?:cast\(|\)::date\s*- mod\()/i);
  assert.match(sql, /array_position\(\s*array\['first', 'second', 'third', 'fourth'\],[\s\S]*?repeat_monthly_ordinal::text/i);
  assert.match(sql, /extract\(day from month_boundary\.month_end_date\)::integer/i);
});

test("7.6.18 consumes only explicit successful future occurrence identity", async () => {
  const sql = await readFile(FORWARD_RESET_SQL_PATH, "utf8");
  assert.match(sql, /history\.status::text in \('done', 'did_my_best', 'complete'\)/i);
  assert.match(sql, /history\.counted_as_due_occurrence/i);
  assert.match(sql, /history\.occurrence_due_on is not null/i);
  assert.match(sql, /history\.occurrence_key = 'occurrence:' \|\| history\.occurrence_due_on::text/i);
  assert.match(sql, /history\.occurrence_key = 'task:' \|\| history\.task_id::text \|\| ':occurrence:' \|\| history\.occurrence_due_on::text/i);
  assert.match(sql, /min\(candidate\.occurrence_date\) filter \([\s\S]*consumed\.occurrence_date is null/i);
  assert.doesNotMatch(sql, /history\.status::text in \([^)]*missed/i);
  assert.doesNotMatch(sql, /history\.status::text in \([^)]*delayed/i);
});

test("7.6.18 lifecycle, optimistic concurrency, and idempotency guards fail closed", async () => {
  const sql = await readFile(FORWARD_RESET_SQL_PATH, "utf8");
  for (const guard of [
    "snapshot.eligible",
    "snapshot.affected_id_is_unique",
    "snapshot.active_recurring_lifecycle",
    "snapshot.current_date_is_affected_corruption",
    "snapshot.recurrence_configuration_valid",
    "snapshot.proposed_date_valid_under_recurrence",
    "task.revision = snapshot.revision",
    "task.updated_at = snapshot.updated_at",
    "task.due_on = snapshot.current_due_on",
    "task.due_on = snapshot.expected_corrupted_due_on",
    "task.repeat_frequency::text = snapshot.recurrence_type",
    "task.repeat_interval = snapshot.recurrence_interval",
    "task.due_on is distinct from snapshot.proposed_forward_due_on",
  ]) {
    assert.ok(sql.includes(guard), `missing guard: ${guard}`);
  }
  assert.match(sql, /current_status not in \('complete', 'archived', 'trashed'\)/i);
  assert.match(sql, /task\.status::text not in \('complete', 'archived', 'trashed'\)/i);
  assert.match(sql, /when proposed_forward_due_on is not null and current_due_on = proposed_forward_due_on then 'unchanged'/i);
});

test("7.6.18 writes only Task due-date concurrency metadata", async () => {
  const sql = await readFile(FORWARD_RESET_SQL_PATH, "utf8");
  assert.equal((sql.match(/\bupdate\s+public\./gi) ?? []).length, 1);
  assert.match(sql, /update public\.adhdice_clean_tasks as task\s+set\s+due_on = snapshot\.proposed_forward_due_on,\s+revision = snapshot\.revision \+ 1,\s+updated_at = statement_timestamp\(\)/i);
  assert.doesNotMatch(sql, /\b(insert into|delete from|merge into|truncate|call)\b/i);
  assert.doesNotMatch(sql, /update public\.adhdice_task_history/i);
  assert.doesNotMatch(sql, /update public\.[a-z0-9_]*(reward|streak|archive|trash)/i);
  assert.doesNotMatch(sql, /set[\s\S]{0,200}\b(status|repeat_frequency|repeat_interval|repeat_days_of_week|repeat_day_of_month|repeat_monthly_mode|trashed_at|completed_at)\s*=/i);
});

test("7.6.19 correction contains the exact 26 re-advanced live rows", async () => {
  const sql = await readFile(FORWARD_RESET_7_6_19_SQL_PATH, "utf8");
  const rows = [...sql.matchAll(/\('([0-9a-f-]{36})'::uuid, date '(\d{4}-\d{2}-\d{2})', (\d+), date '(\d{4}-\d{2}-\d{2})'/g)];
  assert.equal(rows.length, 26);
  assert.equal(new Set(rows.map((row) => row[1])).size, 26);
  assert.equal(rows.every((row) => row[2] !== row[4]), true);
  assert.equal(rows.every((row) => Number(row[3]) > 0), true);
  assert.doesNotMatch(sql, /713cfd40-287c-4531-bba5-46d9f6f2a496|a415dc65-b841-448b-b8a8-4b299987cb8a/);
});

test("7.6.19 correction is separately previewed, guarded, verified, and rerunnable", async () => {
  const sql = await readFile(FORWARD_RESET_7_6_19_SQL_PATH, "utf8");
  assert.match(sql, /begin;[\s\S]*create temporary table adhdice_task_state_forward_reset_7_6_19_snapshot[\s\S]*on commit drop/i);
  assert.match(sql, /-- 1\. PREVIEW ONLY[\s\S]*eligible_count[\s\S]*unchanged_count[\s\S]*skipped[\s\S]*missing/i);
  assert.match(sql, /-- 2\. SEPARATE GUARDED UPDATE[\s\S]*update public\.adhdice_clean_tasks/i);
  assert.match(sql, /-- 3\. POST-UPDATE VERIFICATION[\s\S]*verification_result/i);
  assert.match(sql, /when eligible then 'eligible' when unchanged then 'unchanged'/i);
  assert.match(sql, /current_due_on = corrected_due_on[\s\S]*current_revision = expected_revision \+ 1[\s\S]*as unchanged/i);
  assert.match(sql, /commit;\s*$/i);
});

test("7.6.19 correction fails closed on live identity, recurrence, lifecycle, and boundary evidence", async () => {
  const sql = await readFile(FORWARD_RESET_7_6_19_SQL_PATH, "utf8");
  for (const guard of [
    "snapshot.eligible",
    "snapshot.expected_id_is_unique",
    "snapshot.active_recurring_lifecycle",
    "snapshot.recurrence_configuration_unchanged",
    "snapshot.corrected_forward_boundary_valid",
    "snapshot.exact_expected_recurrence_transitions",
    "task.due_on = snapshot.expected_readvanced_due_on",
    "task.revision = snapshot.expected_revision",
    "task.repeat_frequency::text = snapshot.recurrence_type",
    "task.repeat_interval = snapshot.recurrence_interval",
  ]) {
    assert.ok(sql.includes(guard), `missing guard: ${guard}`);
  }
  assert.match(sql, /current_status not in \('complete', 'archived', 'trashed'\)/i);
  assert.match(sql, /task\.status::text not in \('complete', 'archived', 'trashed'\)/i);
  assert.match(sql, /task\.trashed_at is null/i);
  assert.match(sql, /corrected_due_on >= logical_date/i);
});

test("7.6.20 correction permits only the three exact twice-advanced weekly Monday rows", async () => {
  const [patchSql, previewSql] = await Promise.all([
    readFile(FORWARD_RESET_7_6_19_SQL_PATH, "utf8"),
    readFile(FORWARD_RESET_7_6_19_PREVIEW_SQL_PATH, "utf8"),
  ]);
  const twiceAdvancedIds = [
    "058390ab-cc42-49ec-a458-8da05773732b",
    "8b50fb4b-a634-4c15-afb3-70307ebc528a",
    "d5d2d1ba-94f1-47d3-a7af-11fd3f208db1",
  ];

  for (const sql of [patchSql, previewSql]) {
    const transitionScope = sql.match(/case when task_id = any\(array\[([\s\S]*?)\]\) then 2 else 1 end as expected_transition_count/i);
    assert.ok(transitionScope);
    const scopedIds = [...transitionScope[1].matchAll(/'([0-9a-f-]{36})'::uuid/g)].map((match) => match[1]);
    assert.deepEqual(scopedIds, twiceAdvancedIds);

    for (const [id, revision] of [[twiceAdvancedIds[0], 71], [twiceAdvancedIds[1], 67], [twiceAdvancedIds[2], 67]] as const) {
      assert.match(
        sql,
        new RegExp(`\\('${id}'::uuid, date '2026-08-17', ${revision}, date '2026-08-03', 'weekly', 1, array\\[1\\]::smallint\\[\\]`),
      );
    }

    assert.match(sql, /count\(\*\)[\s\S]*occurrence_date > corrected_due_on[\s\S]*= expected_transition_count/i);
    assert.match(sql, /max\(occurrence_date\)[\s\S]*= expected_readvanced_due_on[\s\S]*as exact_expected_recurrence_transitions/i);
    assert.doesNotMatch(sql, /exactly_one_recurrence_transition|arbitrary|then [3-9]/i);
  }
});

test("7.6.19 correction writes only due_on and revision metadata", async () => {
  const sql = await readFile(FORWARD_RESET_7_6_19_SQL_PATH, "utf8");
  assert.equal((sql.match(/\bupdate\s+public\./gi) ?? []).length, 1);
  assert.match(sql, /update public\.adhdice_clean_tasks as task\s+set\s+due_on = snapshot\.corrected_due_on,\s+revision = snapshot\.expected_revision \+ 1,\s+updated_at = statement_timestamp\(\)/i);
  assert.doesNotMatch(sql, /\b(insert into|delete from|merge into|truncate|call)\b/i);
  assert.doesNotMatch(sql, /update public\.adhdice_task_history/i);
  assert.doesNotMatch(sql, /set[\s\S]{0,220}\b(status|repeat_frequency|repeat_interval|repeat_days_of_week|repeat_day_of_month|repeat_monthly_mode|repeat_monthly_ordinal|repeat_monthly_weekday|trashed_at|completed_at)\s*=/i);
});

test("7.6.19 standalone preview has the same 26 rows, no persistent mutation, and rolls back", async () => {
  const [previewSql, patchSql] = await Promise.all([
    readFile(FORWARD_RESET_7_6_19_PREVIEW_SQL_PATH, "utf8"),
    readFile(FORWARD_RESET_7_6_19_SQL_PATH, "utf8"),
  ]);
  const ids = (sql: string) => [...sql.matchAll(/\('([0-9a-f-]{36})'::uuid, date /g)].map((match) => match[1]);
  assert.deepEqual(ids(previewSql), ids(patchSql));
  assert.equal(new Set(ids(previewSql)).size, 26);
  assert.match(previewSql, /^-- ADHDice 7\.6\.20 safe preview[\s\S]*\bbegin;/i);
  assert.match(previewSql, /rollback;\s*$/i);
  assert.doesNotMatch(previewSql, /-- 2\. SEPARATE GUARDED UPDATE|-- 3\. POST-UPDATE VERIFICATION/i);
  assert.doesNotMatch(previewSql, /\bupdate\s+public\.|\binsert\s+into\s+public\.|\bdelete\s+from\s+public\.|\bcall\b/i);
});
