import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function canonicalTaskInsert(source: string) {
  const start = source.indexOf("insert into public.adhdice_clean_tasks (");
  const end = source.indexOf("returning * into v_task;", start);
  assert.ok(start >= 0 && end > start, "canonical Task INSERT must be present");
  return source.slice(start, end);
}

test("canonical Task creation maps monthly and quota values in positional order across deployment sources", () => {
  const sources = [
    readFileSync(new URL("../supabase/add_task_canonical_creation.sql", import.meta.url), "utf8"),
    readFileSync(new URL("../supabase/patch_task_quota_recurrence_runtime_7_16_23.sql", import.meta.url), "utf8"),
  ];
  for (const source of sources) {
    const insert = canonicalTaskInsert(source);
    const columns = [
      "repeat_day_of_month", "repeat_monthly_mode", "repeat_monthly_ordinal", "repeat_monthly_weekday",
      "repeat_quota_count", "repeat_quota_balance_enabled", "repeat_quota_balance", "repeat_quota_balance_period",
    ];
    let prior = -1;
    for (const column of columns) {
      const index = insert.indexOf(column, prior + 1);
      assert.ok(index > prior, `${column} must preserve canonical recurrence order`);
      prior = index;
    }
    assert.match(insert, /v_task_input\.repeat_monthly_ordinal, v_task_input\.repeat_monthly_weekday,/);
    assert.match(insert, /case when v_repeat_frequency in \('per_week', 'per_month'\) then v_repeat_quota_count else null end,/);
    assert.match(insert, /case when v_repeat_frequency in \('per_week', 'per_month'\) then v_repeat_quota_balance_enabled else false end,/);
    assert.match(insert, /case when v_repeat_frequency in \('per_week', 'per_month'\) and v_repeat_quota_balance_enabled then 0 else null end,/);
    assert.match(insert, /v_repeat_frequency = 'per_week'[\s\S]*v_repeat_frequency = 'per_month'/);
  }
});
