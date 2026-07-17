import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/add_achievement_mvp_foundation.sql", import.meta.url), "utf8");
const consolidatedSchema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

test("consolidated schema includes the exact Achievement foundation migration", () => {
  assert.ok(consolidatedSchema.includes(sql.trim()));
});

test("Achievement foundation migration creates all eight isolated tables", () => {
  for (const table of [
    "profiles",
    "occurrences",
    "occurrence_matches",
    "progress",
    "tier_awards",
    "collection_awards",
    "notifications",
    "evaluation_runs",
  ]) {
    const declarations = sql.match(new RegExp(`create table if not exists public\\.adhdice_achievement_${table}\\b`, "gi")) ?? [];
    assert.equal(declarations.length, 1, `${table} must be declared exactly once`);
  }
});

test("occurrence and match identities are deterministic and retry-safe", () => {
  assert.match(sql, /unique \(user_id, dedupe_key\)/i);
  assert.match(sql, /unique \(user_id, source_kind, source_id, source_occurrence_key\)/i);
  assert.match(sql, /unique \(occurrence_id, track_id\)/i);
  assert.match(sql, /unique \(user_id, operation_id\)/i);
  assert.match(sql, /first_qualified_at timestamptz not null/i);
  assert.match(sql, /before insert on public\.adhdice_achievement_occurrences[\s\S]*adhdice_validate_achievement_occurrence_activation/i);
  assert.match(sql, /new\.first_qualified_at < v_activated_at/i);
  assert.match(sql, /timezone text not null[\s\S]*logical_day_start time without time zone not null/i);
});

test("tier, Collection, and notification uniqueness makes retries harmless", () => {
  assert.match(sql, /unique \(user_id, track_id, tier\)/i);
  assert.match(sql, /unique \(user_id, collection_id, mastery_version\)/i);
  assert.match(sql, /required_track_ids_snapshot jsonb not null/i);
  assert.match(sql, /required_tracks_fingerprint text not null/i);
  assert.match(sql, /unique \(user_id, dedupe_key\)/i);
});

test("earned tiers and Collection mastery are server-controlled and permanent", () => {
  assert.match(sql, /create or replace function public\.adhdice_reject_permanent_achievement_mutation/i);
  assert.match(sql, /before update or delete on public\.adhdice_achievement_tier_awards/i);
  assert.match(sql, /before update or delete on public\.adhdice_achievement_collection_awards/i);
  assert.match(sql, /revoke all on public\.adhdice_achievement_tier_awards from anon, authenticated/i);
  assert.match(sql, /grant select on public\.adhdice_achievement_tier_awards to authenticated/i);
  assert.doesNotMatch(sql, /on public\.adhdice_achievement_(tier_awards|collection_awards)\s+for (insert|update|delete)/i);
});

test("RLS is read-only and activation is an advisory-locked security-definer RPC", () => {
  assert.match(sql, /alter table public\.adhdice_achievement_profiles enable row level security/i);
  assert.match(sql, /create policy "Users can read own Achievement profile"[\s\S]*auth\.uid\(\) = user_id/i);
  assert.match(sql, /create or replace function public\.adhdice_activate_achievement_profile/i);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /pg_catalog\.pg_timezone_names/i);
  assert.match(sql, /grant execute on function public\.adhdice_activate_achievement_profile/i);
  assert.doesNotMatch(sql, /on public\.adhdice_achievement_profiles\s+for (insert|update|delete)/i);
});

function assertNoDuplicateNamedObjects(kind: string, names: string[]) {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  assert.deepEqual(
    [...counts.entries()].filter(([, count]) => count > 1),
    [],
    `${kind} declarations must be unique`,
  );
}

test("foundation named SQL objects and policies are declared exactly once", () => {
  const constraints = [...sql.matchAll(/\bconstraint\s+([a-z0-9_]+)/gi)].map((match) => match[1]!);
  const indexes = [...sql.matchAll(/\bcreate\s+index\s+if\s+not\s+exists\s+([a-z0-9_]+)/gi)].map((match) => match[1]!);
  const policies = [...sql.matchAll(/\bcreate\s+policy\s+"([^"]+)"/gi)].map((match) => match[1]!);
  const triggers = [...sql.matchAll(/\bcreate\s+trigger\s+([a-z0-9_]+)/gi)].map((match) => match[1]!);
  const functions = [...sql.matchAll(/\bcreate\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)/gi)].map((match) => match[1]!);

  assertNoDuplicateNamedObjects("constraint", constraints);
  assertNoDuplicateNamedObjects("index", indexes);
  assertNoDuplicateNamedObjects("RLS policy", policies);
  assertNoDuplicateNamedObjects("trigger", triggers);
  assertNoDuplicateNamedObjects("function", functions);
  assert.equal(
    constraints.filter((name) => name === "adhdice_achievement_evaluation_runs_status_check").length,
    1,
  );
  assert.match(sql, /status text not null,\s*[\s\S]*constraint adhdice_achievement_evaluation_runs_status_check[\s\S]*status = 'running'[\s\S]*status = 'completed'[\s\S]*status = 'failed'/i);
  assert.match(sql, /status text not null default 'pending',\s*[\s\S]*constraint adhdice_achievement_notifications_status_check[\s\S]*status = 'pending'[\s\S]*status = 'delivered'[\s\S]*status = 'seen'/i);
  assert.doesNotMatch(sql, /status text not null(?: default 'pending')?\s+check\s*\(status in \('running'|status in \('pending', 'delivered', 'seen'/i);
});

test("foundation migration does not touch the legacy Achievement unlock system", () => {
  assert.doesNotMatch(sql, /adhdice_achievement_unlocks/i);
});
