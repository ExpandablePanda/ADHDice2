import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sqlFiles = [
  "add_records_foundation.sql",
  "patch_records_reconciliation_timeout.sql",
  "patch_records_reconciliation_nonblocking.sql",
  "patch_records_reconciliation_temp_spill.sql",
  "patch_records_chunked_reconciliation.sql",
  "patch_records_validation_compatibility.sql",
] as const;
const recordsSql = sqlFiles.map((file) => [file, readFileSync(new URL(`../supabase/${file}`, import.meta.url), "utf8")] as const);
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const forward = recordsSql.find(([file]) => file === "patch_records_validation_compatibility.sql")![1];
const functionNames = [
  "adhdice_begin_records_reconciliation",
  "adhdice_upload_records_reconciliation_chunk",
  "adhdice_finalize_records_reconciliation",
] as const;

function extractFunction(source: string, name: typeof functionNames[number]) {
  const match = source.match(new RegExp(
    `create(?: or replace)? function public\\.${name}\\(p_payload jsonb\\)([\\s\\S]*?\\$function\\$;)`,
  ));
  assert.ok(match, `${name} must be defined`);
  return match[1];
}

const forwardFunctions = Object.fromEntries(functionNames.map((name) => [name, extractFunction(forward, name)]));
const schemaFunctions = Object.fromEntries(functionNames.map((name) => [name, extractFunction(schema, name)]));

test("7.2.27 Records SQL stays PostgreSQL 15 compatible and canonical", () => {
  for (const [file, source] of [...recordsSql, ["schema.sql", schema] as const]) {
    assert.doesNotMatch(source, /pg_input_is_valid/i, `${file} must not use pg_input_is_valid`);
    assert.doesNotMatch(source, /pg_input_error_info/i, `${file} must not use pg_input_error_info`);
  }

  for (const name of functionNames) {
    for (const source of [forward, schema]) {
      assert.equal(
        (source.match(new RegExp(`create(?: or replace)? function public\\.${name}\\(p_payload jsonb\\)`, "g")) ?? []).length,
        1,
        `${name} must retain exactly one p_payload jsonb signature`,
      );
    }
    assert.equal(forwardFunctions[name], schemaFunctions[name], `${name} must match canonical schema.sql`);
    assert.match(forwardFunctions[name], /security definer[\s\S]*set search_path = ''/);
  }
});

test("7.2.27 logical day-start and required containers validate without SQL NULL gaps", () => {
  const logicalDayStart = /^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
  for (const value of ["06:00", "06:00:00"]) assert.match(value, logicalDayStart);
  for (const value of ["6:00", "06:60", "24:00", "06:00:60", "06:00:00Z", ""]) {
    assert.doesNotMatch(value, logicalDayStart);
  }

  for (const source of [forward, schema]) {
    assert.ok(source.includes("'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'"));
    assert.match(source, /v_day_start := \(p_payload->>'logical_day_start'\)::time;[\s\S]*exception when data_exception then[\s\S]*Invalid Records reconciliation manifest values/);
    assert.match(source, /coalesce\(pg_catalog\.jsonb_typeof\(p_payload\), ''\) <> 'object'/);
    assert.match(source, /coalesce\(pg_catalog\.jsonb_typeof\(v_partitions\), ''\) <> 'array'/);
    assert.match(source, /coalesce\(pg_catalog\.jsonb_typeof\(partition\.value\), ''\) <> 'object'/);
    assert.match(source, /coalesce\(pg_catalog\.jsonb_typeof\(p_payload->'rows'\), ''\) <> 'array'/);
    assert.match(source, /coalesce\(pg_catalog\.jsonb_typeof\(row_item\.value\), ''\) <> 'object'/);
    assert.match(source, /coalesce\(pg_catalog\.jsonb_typeof\(row_item\.value->'evidence_snapshot'\), ''\) <> 'object'/);
  }
});

test("7.2.27 every Records payload cast is format-checked and guarded", () => {
  for (const source of [forward, schema]) {
    assert.ok(source.includes("'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'"));
    assert.match(source, /v_run_id := \(p_payload->>'run_id'\)::uuid;[\s\S]*exception when data_exception then[\s\S]*Invalid Records (?:chunk envelope values|finalization run ID)/);
    assert.match(source, /v_expected_chunk_count := \(p_payload->>'expected_chunk_count'\)::integer;[\s\S]*exception when data_exception then[\s\S]*Invalid Records reconciliation manifest values/);
    assert.match(source, /v_partition_chunk_count := \(v_partition->>'chunk_count'\)::integer;[\s\S]*exception when data_exception then[\s\S]*Records chunk is outside the manifest/);
    assert.match(source, /item\.value::bigint[\s\S]*item\.credited_date::date[\s\S]*item\.first_achieved_at::timestamptz/);
    assert.match(source, /begin[\s\S]*insert into public\.adhdice_record_current_stage[\s\S]*insert into public\.adhdice_record_event_stage[\s\S]*exception when unique_violation then[\s\S]*when data_exception then[\s\S]*Invalid Records chunk row\./);
    assert.match(source, /credited_date ~ '\^\[0-9\]\{4\}-\(0\[1-9\]\|1\[0-2\]\)/);
    assert.match(source, /first_achieved_at ~ '\^\[0-9\]\{4\}-[\s\S]*\(\[01\]\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]:\[0-5\]\[0-9\][\s\S]*\{1,6\}/);
  }
});

test("7.2.27 finalization try-lock precedes row locking and every write", () => {
  for (const source of [forwardFunctions.adhdice_finalize_records_reconciliation, schemaFunctions.adhdice_finalize_records_reconciliation]) {
    const lock = source.indexOf("pg_try_advisory_xact_lock");
    const busy = source.indexOf("return pg_catalog.jsonb_build_object('status', 'busy')", lock);
    const rowLock = source.indexOf("for update", busy);
    const currentPublish = source.indexOf("insert into public.adhdice_record_current", rowLock);
    const eventPublish = source.indexOf("insert into public.adhdice_record_events", currentPublish);
    assert.ok(lock >= 0 && busy > lock && rowLock > busy && currentPublish > rowLock && eventPublish > currentPublish);
    assert.doesNotMatch(source.slice(0, busy), /(?:insert into|update|delete from) public\.adhdice_record_(?:current|events|current_stage|event_stage|reconcile)/);
  }
});

test("7.2.27 compact upload and atomic publication contracts remain intact", () => {
  for (const source of [forward, schema]) {
    assert.match(source, /octet_length\(p_payload::text\)[\s\S]*1048576/);
    assert.match(source, /\^sha256:\[0-9a-f\]\{64\}\$/);
    assert.match(source, /evidence_snapshot->>'schemaVersion' = '2'/);
    assert.match(source, /evidence_snapshot->>'evidenceDigest' = item\.evidence_fingerprint/);
    assert.match(source, /octet_length\(item\.evidence_snapshot::text\) < 8192/);
    assert.match(source, /get diagnostics v_inserted = row_count;[\s\S]*v_inserted <> v_row_count/);
    assert.match(source, /Duplicate Records identity across chunks\./);
    assert.match(source, /Records reconciliation is incomplete\./);
    assert.match(source, /first_achieved_at = least/);
    assert.match(source, /absent_from_complete_recalculation/);
    assert.doesNotMatch(source, /delete from public\.adhdice_record_events/);
    assert.match(source, /revoke all on function public\.adhdice_begin_records_reconciliation\(jsonb\) from public, anon/);
    assert.match(source, /grant execute on function public\.adhdice_finalize_records_reconciliation\(jsonb\) to authenticated/);
    assert.match(source, /notify pgrst, 'reload schema'/);
  }
});
