import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/add_achievement_notification_delivery_6_29_49.sql", import.meta.url), "utf8");
const clampFixMigration = readFileSync(new URL("../supabase/fix_achievement_notification_claim_clamp_6_29_50.sql", import.meta.url), "utf8");
const foundation = readFileSync(new URL("../supabase/add_achievement_mvp_foundation.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

function extractFunction(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = sql.indexOf("$function$;", start) + "$function$;".length;
  assert.ok(start >= 0 && end >= "$function$;".length, `${name} must exist`);
  return sql.slice(start, end);
}

const claim = extractFunction(migration, "adhdice_claim_achievement_notifications");
const markSeen = extractFunction(migration, "adhdice_mark_achievement_notification_seen");

test("forward migration and canonical schema stay in parity", () => {
  assert.ok(schema.includes(migration.trim()));
  assert.ok(schema.includes(clampFixMigration.trim()));
  assert.equal(extractFunction(foundation, "adhdice_claim_achievement_notifications"), claim);
  assert.equal(extractFunction(clampFixMigration, "adhdice_claim_achievement_notifications"), claim);
  assert.equal(extractFunction(foundation, "adhdice_mark_achievement_notification_seen"), markSeen);
  assert.match(migration, /^begin;[\s\S]*notify pgrst, 'reload schema';\s*commit;\s*$/m);
});

test("authenticated owner claims a bounded deterministic pending batch", () => {
  assert.match(claim, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(claim, /notification\.user_id = v_user_id[\s\S]*notification\.status = 'pending'/);
  assert.match(claim, /order by notification\.created_at, notification\.id[\s\S]*limit v_limit/);
  assert.match(claim, /least\(greatest\(coalesce\(p_limit, 10\), 1\), 50\)/);
});

test("claim clamp uses valid PostgreSQL special-expression syntax and exact bounds", () => {
  for (const sql of [foundation, migration, clampFixMigration, schema]) {
    assert.doesNotMatch(sql, /pg_catalog\.(?:greatest|least)\s*\(/i);
  }

  const clamp = (value: number | null) => Math.min(Math.max(value ?? 10, 1), 50);
  assert.deepEqual(
    [null, 0, 1, 10, 50, 51, 500].map((value) => clamp(value)),
    [10, 1, 1, 10, 50, 50, 50],
  );
});

test("claim is atomic and prevents duplicate delivery across callers", () => {
  assert.match(claim, /for update skip locked/);
  assert.match(claim, /update public\.adhdice_achievement_notifications notification[\s\S]*set status = 'delivered'/);
  assert.match(claim, /delivered_at = coalesce\(notification\.delivered_at, pg_catalog\.clock_timestamp\(\)\)/);
  assert.match(claim, /notification\.status = 'pending'[\s\S]*returning notification\.\*/);
  assert.match(claim, /select transitioned\.\*[\s\S]*order by transitioned\.created_at, transitioned\.id/);
});

test("seen transition is owner-only, delivered-only, and idempotent", () => {
  assert.match(markSeen, /notification\.id = p_notification_id[\s\S]*notification\.user_id = v_user_id[\s\S]*for update/);
  assert.match(markSeen, /v_notification\.status = 'seen'[\s\S]*'already_seen'/);
  assert.match(markSeen, /v_notification\.status <> 'delivered'[\s\S]*'not_delivered'/);
  assert.match(markSeen, /set status = 'seen'[\s\S]*seen_at = coalesce\(notification\.seen_at, pg_catalog\.clock_timestamp\(\)\)/);
  assert.match(markSeen, /notification\.user_id = v_user_id[\s\S]*notification\.status = 'delivered'/);
});

test("RPC security is narrow and direct notification updates remain unavailable", () => {
  for (const signature of [
    "public.adhdice_claim_achievement_notifications(integer)",
    "public.adhdice_mark_achievement_notification_seen(uuid)",
  ]) {
    assert.ok(migration.includes(`revoke all on function ${signature} from public, anon;`));
    assert.ok(migration.includes(`grant execute on function ${signature} to authenticated;`));
  }
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.doesNotMatch(migration, /grant update on public\.adhdice_achievement_notifications/i);
  assert.doesNotMatch(migration, /create policy[\s\S]*for update/i);
  assert.doesNotMatch(migration, /adhdice_achievement_(tier_awards|collection_awards)/i);
  assert.doesNotMatch(migration, /\b(delete|truncate)\b/i);
});

test("existing notification SELECT policy is preserved", () => {
  assert.match(foundation, /create policy "Users can read own Achievement notifications"[\s\S]*for select using \(auth\.uid\(\) = user_id\)/);
  assert.match(foundation, /grant select on public\.adhdice_achievement_notifications to authenticated/);
  assert.doesNotMatch(foundation, /grant update on public\.adhdice_achievement_notifications/i);
});
