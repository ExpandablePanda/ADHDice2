import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

const repositoryRoot = process.cwd();
const migration = readFileSync(new URL("../supabase/patch_achievement_rebuild_performance_7_16_32.sql", import.meta.url), "utf8");
const psql = process.env.ADHDICE_SQL_COMPILE_PSQL_BIN ?? "psql";
const psqlDirectory = dirname(psql);
const createdb = join(psqlDirectory, "createdb");
const dropdb = join(psqlDirectory, "dropdb");
const host = process.env.ADHDICE_SQL_COMPILE_PGHOST;
const port = process.env.ADHDICE_SQL_COMPILE_PGPORT ?? "5432";

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

test("7.16.32 rebuild snapshots qualifying evidence and preserves idempotent award paths", () => {
  const rebuild = extractRebuild(migration);
  assert.match(rebuild, /create temporary table pg_temp\.adhdice_achievement_qualifying_occurrences[\s\S]*on commit drop/);
  assert.match(rebuild, /drop table if exists pg_temp\.adhdice_achievement_qualifying_occurrences/);
  assert.match(rebuild, /analyze pg_temp\.adhdice_achievement_qualifying_occurrences/);
  assert.match(rebuild, /count\(\*\) over \(\) as occurrence_count/);
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
  assert.match(migration, /SOURCE ONLY/i);
});

test("7.16.32 Achievement rebuild patch compiles over the canonical schema when local PostgreSQL is enabled", (t) => {
  if (!host) {
    t.skip("set ADHDICE_SQL_COMPILE_PGHOST to run the disposable local PostgreSQL Achievement rebuild compile regression");
    return;
  }
  assert.ok(host.startsWith("/") || ["localhost", "127.0.0.1", "::1"].includes(host));

  const scratch = mkdtempSync(join(tmpdir(), "adhdice-sql-compile-achievement-7-16-32-"));
  const database = `adhdice_compile_71632_${process.pid}_${Date.now()}`;
  const fixtureSetup = join(scratch, "fixture-setup.sql");
  const patchPath = join(scratch, "achievement-rebuild-patch.sql");
  const schemaPath = join(scratch, "schema.sql");
  const verificationPath = join(scratch, "verification.sql");

  try {
    run(createdb, [...utilityConnectionArgs(), database]);
    writeFileSync(fixtureSetup, `create schema auth;
create table auth.users (id uuid primary key);
create publication supabase_realtime;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`);
    writeFileSync(schemaPath, readFileSync(join(repositoryRoot, "supabase/schema.sql"), "utf8"));
    writeFileSync(patchPath, migration);
    writeFileSync(verificationPath, `select
  position('create temporary table pg_temp.adhdice_achievement_qualifying_occurrences' in pg_get_functiondef('public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz)'::regprocedure)) > 0,
  (length(pg_get_functiondef('public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz)'::regprocedure)) - length(replace(pg_get_functiondef('public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz)'::regprocedure), 'from public.adhdice_achievement_occurrences', ''))) = length('from public.adhdice_achievement_occurrences');
`);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", fixtureSetup]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", schemaPath]);
    run(psql, [...connectionArgs(database), "-v", "ON_ERROR_STOP=1", "-f", patchPath]);
    assert.deepEqual(
      run(psql, [...connectionArgs(database), "-At", "-v", "ON_ERROR_STOP=1", "-f", verificationPath]).trim().split("|"),
      ["t", "t"],
    );
  } finally {
    try {
      run(dropdb, ["--if-exists", ...utilityConnectionArgs(), database]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
});
