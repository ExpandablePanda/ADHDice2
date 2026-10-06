import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

const repositoryRoot = process.cwd();
const rebuildPatch = readFileSync(new URL("../supabase/patch_achievement_rebuild_performance_7_16_32.sql", import.meta.url), "utf8");
const forwardPatch = readFileSync(new URL("../supabase/patch_achievement_rebuild_performance_7_16_33.sql", import.meta.url), "utf8");
const psql = process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const psqlDirectory = dirname(psql);
const createdb = join(psqlDirectory, "createdb");
const dropdb = join(psqlDirectory, "dropdb");
const host = process.env.ADHDICE_SQL_COMPILE_PGHOST;
const port = process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";
const historyFunctionMarker = "-- The legacy p_history_id name is intentional:";

function extractRebuild(source: string) {
  const start = source.indexOf("create or replace function public.adhdice_rebuild_achievement_progress(");
  const end = source.indexOf("$function$;", start) + "$function$;".length;
  assert.ok(start >= 0 && end > start, "Achievement rebuild function must be defined");
  return source.slice(start, end);
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function connectionArgs(database: string): string[] {
  return ["-h", host!, "-p", port, "-d", database];
}

function utilityConnectionArgs(): string[] {
  return ["-h", host!, "-p", port];
}

function writeOrderedBaselineSchema(outputPath: string): void {
  const schema = readFileSync(join(repositoryRoot, "supabase/schema.sql"), "utf8");
  const canonicalSchema = readFileSync(join(repositoryRoot, "supabase/add_task_state_canonical_schema.sql"), "utf8");
  const markerIndex = schema.indexOf(historyFunctionMarker);
  assert.ok(markerIndex > 0, "expected canonical History function marker in schema source");
  writeFileSync(outputPath, `${schema.slice(0, markerIndex)}\n${canonicalSchema}\n${schema.slice(markerIndex)}`);
}

test("7.16.33 rebuild keeps the 7.16.32 evidence snapshot and dedupe architecture", () => {
  const rebuild = extractRebuild(rebuildPatch);
  assert.match(rebuild, /create temporary table pg_temp\.adhdice_achievement_qualifying_occurrences[\s\S]*on commit drop/);
  assert.match(rebuild, /drop table if exists pg_temp\.adhdice_achievement_qualifying_occurrences/);
  assert.match(rebuild, /analyze pg_temp\.adhdice_achievement_qualifying_occurrences/);
  assert.match(rebuild, /count\(\*\) over \(\) as occurrence_count/);
  assert.match(rebuild, /select coalesce\(max\(occurrence_count\), 0\) into v_occurrence_count/);
  assert.doesNotMatch(rebuild, /max\(occurrence\.occurrence_count\)/);
  assert.match(rebuild, /where occurrence\.user_id = p_user_id;/);
  assert.match(rebuild, /where occurrence\.is_currently_qualifying and occurrence\.entity_kind/);
  assert.equal((rebuild.match(/from public\.adhdice_achievement_occurrences/g) ?? []).length, 1);
  assert.doesNotMatch(rebuild, /adhdice_achievement_streak_metadata\(/);
  assert.match(rebuild, /from pg_temp\.adhdice_achievement_qualifying_occurrences/);
  assert.match(rebuild, /on conflict \(occurrence_id, track_id\) do nothing/);
  assert.match(rebuild, /on conflict \(user_id, track_id, tier\) do nothing/);
  assert.match(rebuild, /on conflict \(user_id, collection_id, mastery_version\) do nothing/);
  assert.match(rebuild, /on conflict \(user_id, dedupe_key\) do nothing/g);
  assert.doesNotMatch(rebuild, /delete from public\.adhdice_achievement_(tier_awards|collection_awards|notifications)/);
  assert.doesNotMatch(rebuild, /statement_timeout/i);
  assert.match(rebuildPatch, /SOURCE ONLY/i);
  assert.match(forwardPatch, /replace\(v_definition, v_old, 'max\(occurrence_count\)'\)/);
  assert.doesNotMatch(forwardPatch, /(?:insert|update|delete|truncate)\s+into\s+public\./i);
});

test("7.16.33 Achievement rebuild compiles and executes through the temp occurrence-count query", (t) => {
  if (!host) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL Achievement rebuild execution regression");
    return;
  }
  assert.ok(host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host));

  const scratch = mkdtempSync(join(tmpdir(), "adhdice-sql-compile-achievement-7-16-33-"));
  const database = `adhdice_compile_71633_${process.pid}_${Date.now()}`;
  const fixtureSetup = join(scratch, "fixture-setup.sql");
  const baselineSchema = join(scratch, "baseline-schema.sql");
  const sourcePatchPath = join(scratch, "achievement-rebuild-7-16-32.sql");
  const buggyPatchPath = join(scratch, "achievement-rebuild-7-16-32-installed.sql");
  const forwardPatchPath = join(scratch, "achievement-rebuild-7-16-33.sql");
  const fixtureData = join(scratch, "fixture-data.sql");
  const verificationPath = join(scratch, "verification.sql");
  const userId = "00000000-0000-4000-8000-000000000001";
  const operationId = "00000000-0000-4000-8000-000000000002";
  const runId = "00000000-0000-4000-8000-000000000003";

  try {
    run(createdb, [...utilityConnectionArgs(), database]);
    writeFileSync(fixtureSetup, `create schema auth;
create schema extensions;
create extension pgcrypto schema extensions;
create table auth.users (id uuid primary key);
create publication supabase_realtime;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`);
    writeOrderedBaselineSchema(baselineSchema);
    writeFileSync(sourcePatchPath, rebuildPatch);
    assert.equal(rebuildPatch.split("max(occurrence_count)").length - 1, 1);
    writeFileSync(buggyPatchPath, rebuildPatch.replace("max(occurrence_count)", "max(occurrence.occurrence_count)"));
    writeFileSync(forwardPatchPath, forwardPatch);
    writeFileSync(fixtureData, `insert into auth.users(id) values ('${userId}') on conflict (id) do nothing;
insert into public.adhdice_achievement_profiles(
  user_id, activation_operation_id, activated_at, catalog_version, rules_version,
  launch_mastery_version, timezone, logical_day_start
) values (
  '${userId}', '${operationId}', clock_timestamp() - interval '1 day',
  'achievement-catalog-v1', 'achievement-rules-v1', 'achievement-launch-v1',
  'UTC', time '00:00'
) on conflict (user_id) do nothing;
select public.adhdice_rebuild_achievement_progress('${userId}'::uuid, '${runId}'::uuid, clock_timestamp());
`);
    writeFileSync(verificationPath, `select
  position('max(occurrence.occurrence_count)' in pg_get_functiondef('public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz)'::regprocedure)) = 0,
  position('max(occurrence_count)' in pg_get_functiondef('public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz)'::regprocedure)) > 0,
  (select count(*) > 0 from public.adhdice_achievement_progress where user_id = '${userId}'::uuid),
  (select count(*) from public.adhdice_achievement_tier_awards where user_id = '${userId}'::uuid) = 0,
  (select count(*) from public.adhdice_achievement_notifications where user_id = '${userId}'::uuid) = 0;
`);

    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", fixtureSetup]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", baselineSchema, "-f", sourcePatchPath]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", fixtureData]);

    // Reinstall the exact 7.16.32 bad reference in this disposable database,
    // then prove the 7.16.33 forward correction repairs it before execution.
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", buggyPatchPath, "-f", forwardPatchPath, "-f", fixtureData]);
    assert.deepEqual(
      run(psql, [...connectionArgs(database), "-At", "-v", "ON_ERROR_STOP=1", "-f", verificationPath]).trim().split("|"),
      ["t", "t", "t", "t", "t"],
    );
  } finally {
    try {
      run(dropdb, ["--if-exists", ...utilityConnectionArgs(), database]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});
