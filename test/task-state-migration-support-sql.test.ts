import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSupport = readFileSync(
  new URL("../supabase/add_task_state_migration_support.sql", import.meta.url),
  "utf8",
);

const POSTGRES_IDENTIFIER_BYTE_LIMIT = 63;
const LEGACY_TRUNCATED_EFFECTIVE_OVERRIDES_FK =
  "adhdice_task_occurrence_effective_overrides_migration_operation";
const EFFECTIVE_OVERRIDES_MIGRATION_FK =
  "adhdice_task_occurrence_effective_overrides_operation_fkey";

function effectiveOverridesForeignKeyBlock(): string {
  const startMarker = [
    "  if not exists (",
    "    select 1 from pg_constraint",
    "    where conrelid = 'public.adhdice_task_occurrence_effective_overrides'::regclass",
  ].join("\n");
  const start = migrationSupport.indexOf(startMarker);
  assert.notEqual(start, -1, "effective-overrides FK guard must remain present");

  const end = migrationSupport.indexOf("  end if;", start);
  assert.notEqual(end, -1, "effective-overrides FK guard must close");
  return migrationSupport.slice(start, end + "  end if;".length);
}

function idempotenceCheckNames(): string[] {
  const names: string[] = [];
  for (const match of migrationSupport.matchAll(/and conname = '([^']+)'/g)) {
    names.push(match[1]!);
  }
  for (const match of migrationSupport.matchAll(/and conname in \(([^)]*)\)/gs)) {
    for (const name of match[1]!.matchAll(/'([^']+)'/g)) {
      names.push(name[1]!);
    }
  }
  return names;
}

test("migration-support idempotence constraint identifiers fit PostgreSQL's limit", () => {
  const names = idempotenceCheckNames();

  assert.ok(names.length > 0, "migration-support FK idempotence checks must be covered");
  for (const name of names) {
    assert.ok(
      Buffer.byteLength(name, "utf8") <= POSTGRES_IDENTIFIER_BYTE_LIMIT,
      `${name} exceeds PostgreSQL's 63-byte identifier limit`,
    );
  }
});

test("effective-overrides FK recognizes the installed truncated name and uses a safe fresh-install name", () => {
  const block = effectiveOverridesForeignKeyBlock();

  assert.match(block, new RegExp(`'${LEGACY_TRUNCATED_EFFECTIVE_OVERRIDES_FK}'`));
  assert.match(block, new RegExp(`'${EFFECTIVE_OVERRIDES_MIGRATION_FK}'`));
  assert.match(block, new RegExp(`add constraint ${EFFECTIVE_OVERRIDES_MIGRATION_FK}`));
  assert.ok(block.indexOf("if not exists (") < block.indexOf("add constraint"));
});

test("effective-overrides migration provenance remains owner-safe and restrictive", () => {
  const block = effectiveOverridesForeignKeyBlock();

  assert.match(
    block,
    /foreign key \(user_id, migration_operation_id\)\s+references public\.adhdice_task_migration_operations \(user_id, id\)\s+on delete restrict;/,
  );
});

test("migration-support retains the existing deferred FK set and support protections", () => {
  const foreignKeys = [...migrationSupport.matchAll(/add constraint ([a-z0-9_]+)\s+foreign key/g)].map(
    (match) => match[1],
  );

  assert.deepEqual(foreignKeys, [
    "adhdice_task_state_migration_entities_task_fkey",
    "adhdice_task_legacy_history_evidence_operation_fkey",
    "adhdice_task_state_migration_entities_operation_fkey",
    "adhdice_task_state_migration_issues_operation_fkey",
    "adhdice_task_schedule_boundaries_migration_operation_fkey",
    "adhdice_task_occurrences_migration_operation_fkey",
    EFFECTIVE_OVERRIDES_MIGRATION_FK,
    "adhdice_task_history_facts_migration_operation_fkey",
    "adhdice_task_calendar_overrides_migration_operation_fkey",
    "adhdice_task_reward_entitlements_migration_operation_fkey",
  ]);
  assert.match(migrationSupport, /create schema if not exists adhdice_migration_private/);
  assert.match(migrationSupport, /create table if not exists public\.adhdice_task_migration_operations/);
  assert.match(migrationSupport, /create index if not exists adhdice_task_occurrence_effective_overrides_migration_operation_idx/);
  assert.match(migrationSupport, /alter table public\.adhdice_task_state_migration_issues enable row level security/);
  assert.match(migrationSupport, /grant select on table public\.adhdice_task_state_migration_issues to authenticated/);
  assert.doesNotMatch(migrationSupport, /create or replace function/i);
});
