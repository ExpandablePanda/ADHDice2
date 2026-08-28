import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const commandSource = readFileSync(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");
const embeddedCommandSource = readFileSync(new URL("../supabase/patch_task_reward_entitlement_permanence_7_10_5.sql", import.meta.url), "utf8");
const achievementRuntime = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/patch_task_state_achievement_deferral_7_11_77.sql", import.meta.url), "utf8");

function extractCommand(source: string) {
  const start = source.indexOf("create or replace function public.adhdice_execute_task_state_command(");
  const end = source.indexOf("\nrevoke all on function public.adhdice_execute_task_state_command", start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end).trim();
}

function readMigrationDollarQuotedValue(tag: "old" | "new", afterIndex: number) {
  const marker = `v_${tag} := $${tag}$`;
  const start = migration.indexOf(marker, afterIndex);
  assert.ok(start >= 0, `expected ${marker} after ${afterIndex}`);
  const valueStart = start + marker.length;
  const end = migration.indexOf(`$${tag}$;`, valueStart);
  assert.ok(end > valueStart, `expected closing $${tag}$ delimiter`);
  return { value: migration.slice(valueStart, end), end };
}

function migrationRegexToJavaScript(source: string) {
  return new RegExp(source.replaceAll("[[:space:]]", "\\s"), "gi");
}

const loopOld = readMigrationDollarQuotedValue("old", migration.indexOf("v_old := $old$for"));
const loopNew = readMigrationDollarQuotedValue("new", loopOld.end);
const finalizationOld = readMigrationDollarQuotedValue("old", migration.indexOf("v_old := $old$end"));
const finalizationNew = readMigrationDollarQuotedValue("new", finalizationOld.end);
const loopAnchor = { matcher: migrationRegexToJavaScript(loopOld.value), replacement: loopNew.value };
const finalizationAnchor = { matcher: migrationRegexToJavaScript(finalizationOld.value), replacement: finalizationNew.value };

function replaceMigrationAnchorExactlyOnce(source: string, anchor: typeof loopAnchor, name: string) {
  const matcher = new RegExp(anchor.matcher.source, anchor.matcher.flags);
  const matches = Array.from(source.matchAll(matcher));
  if (matches.length !== 1) {
    throw new Error(`${name} anchor was not found exactly once (found ${matches.length} matches)`);
  }
  return source.replace(new RegExp(anchor.matcher.source, anchor.matcher.flags), anchor.replacement);
}

function transformAchievementDeferralAnchors(source: string) {
  const withLoop = replaceMigrationAnchorExactlyOnce(source, loopAnchor, "automatic History loop");
  return replaceMigrationAnchorExactlyOnce(withLoop, finalizationAnchor, "Achievement finalization");
}

function countMatches(source: string, matcher: RegExp) {
  return Array.from(source.matchAll(new RegExp(matcher.source, matcher.flags))).length;
}

function stripSqlComments(source: string) {
  return source.replace(/--[^\r\n]*/g, "").replace(/^[ \t]+/gm, "");
}

const currentLoopInsertionStart = commandSource.indexOf("  if jsonb_array_length(v_automatic_history_facts) > 0 then\n    perform set_config('adhdice.achievement_deferred_user_id', p_user_id::text, true);");
const currentLoopInsertionEnd = commandSource.indexOf("\n  loop", currentLoopInsertionStart) + "\n  loop".length;
const currentFinalizationInsertionStart = commandSource.indexOf("  if jsonb_array_length(v_automatic_history_facts) > 0 then", currentLoopInsertionEnd);
const currentFinalizationInsertionEnd = commandSource.indexOf("\n\n  if v_calendar_override <> '{}'::jsonb then", currentFinalizationInsertionStart);
assert.ok(currentLoopInsertionStart >= 0 && currentLoopInsertionEnd > currentLoopInsertionStart);
assert.ok(currentFinalizationInsertionStart >= 0 && currentFinalizationInsertionEnd > currentFinalizationInsertionStart);

const prettyLoop = "  for v_automatic_history in\n    select value from jsonb_array_elements(v_automatic_history_facts)\n  loop";
const prettyFinalization = "  end loop;\n\n  if v_calendar_override <> '{}'::jsonb then";
const compactLoop = "  for v_automatic_history in select value from jsonb_array_elements(v_automatic_history_facts) loop";
const compactFinalization = "  end loop;if v_calendar_override<>'{}'::jsonb then";
const commandWithoutDeferral = commandSource
  .replace(commandSource.slice(currentLoopInsertionStart, currentLoopInsertionEnd), prettyLoop)
  .replace(commandSource.slice(currentFinalizationInsertionStart, currentFinalizationInsertionEnd), "")
  .replace("\n\n\n\n  if v_calendar_override <> '{}'::jsonb then", "\n\n  if v_calendar_override <> '{}'::jsonb then");
assert.notEqual(commandWithoutDeferral, commandSource);

test("7.11.78 migration anchors are narrow, whitespace-tolerant, and exact-once", () => {
  assert.match(loopOld.value, /^for\[\[:space:\]\]\+v_automatic_history/);
  assert.match(loopOld.value, /jsonb_array_elements\[\[:space:\]\]\*\\\(/);
  assert.match(finalizationOld.value, /^end\[\[:space:\]\]\+loop;/);
  assert.match(finalizationOld.value, /v_calendar_override\[\[:space:\]\]\*<>\[\[:space:\]\]\*/);
  assert.match(migration, /from regexp_matches\(v_definition, v_old, 'gi'\)/gi);
  assert.match(migration, /v_definition := regexp_replace\(v_definition, v_old, v_new, 'gi'\)/gi);
});

test("7.11.78 pretty and compact production RPC definitions transform exactly once", () => {
  const definitions = [
    commandWithoutDeferral,
    commandWithoutDeferral.replace(prettyLoop, compactLoop).replace(prettyFinalization, compactFinalization),
  ];

  for (const definition of definitions) {
    assert.equal(countMatches(definition, loopAnchor.matcher), 1);
    assert.equal(countMatches(definition, finalizationAnchor.matcher), 1);
    const transformed = transformAchievementDeferralAnchors(definition);
    assert.equal(countMatches(transformed, loopAnchor.matcher), 1);
    assert.equal(countMatches(transformed, finalizationAnchor.matcher), 0);
    assert.equal(countMatches(transformed, /set_config\('adhdice\.achievement_deferred_user_id'/g), 2);
    assert.equal(countMatches(transformed, /public\.adhdice_evaluate_achievements\(/g), 1);
    assert.match(transformed, /md5\('task-state-command-achievement-evaluation:' \|\| p_user_id::text \|\| ':' \|\| v_command_id::text\)::uuid/);
    assert.match(transformed, /not in \('completed', 'inactive'\)/);
    assert.equal(stripSqlComments(transformed), stripSqlComments(commandSource));
  }
});

test("7.11.78 migration anchors fail closed when loop or finalization matches are not exactly one", () => {
  assert.throws(() => transformAchievementDeferralAnchors(commandWithoutDeferral.replace(prettyLoop, "")), /automatic History loop anchor.*exactly once/);
  assert.throws(() => transformAchievementDeferralAnchors(commandWithoutDeferral.replace(prettyLoop, `${prettyLoop}\n${prettyLoop}`)), /automatic History loop anchor.*exactly once/);
  assert.throws(() => transformAchievementDeferralAnchors(commandWithoutDeferral.replace(prettyFinalization, "")), /Achievement finalization anchor.*exactly once/);
  assert.throws(() => transformAchievementDeferralAnchors(commandWithoutDeferral.replace(prettyFinalization, `${prettyFinalization}\n${prettyFinalization}`)), /Achievement finalization anchor.*exactly once/);
});

test("7.11.77 defers only repeated Achievement evaluation for automatic History batches", () => {
  const loopStart = commandSource.indexOf("  for v_automatic_history in");
  const loopEnd = commandSource.indexOf("\n  if v_calendar_override <> '{}'::jsonb then", loopStart);
  const automaticBatch = commandSource.slice(loopStart, loopEnd);
  const finalEvaluation = commandSource.slice(commandSource.lastIndexOf("  if jsonb_array_length(v_automatic_history_facts) > 0 then"));

  assert.ok(loopStart >= 0 && loopEnd > loopStart);
  assert.match(commandSource, /v_achievement_evaluation jsonb/);
  assert.match(commandSource, /v_achievement_operation_id uuid/);
  assert.equal((commandSource.match(/public\.adhdice_evaluate_achievements\(/g) ?? []).length, 1);
  assert.equal((commandSource.match(/set_config\('adhdice\.achievement_deferred_user_id'/g) ?? []).length, 2);
  assert.match(automaticBatch, /insert into public\.adhdice_task_history_facts/);
  assert.match(automaticBatch, /v_automatic_history_ids := v_automatic_history_ids \|\| to_jsonb\(v_history_row\.id\)/);
  assert.doesNotMatch(automaticBatch, /adhdice_task_reward_entitlements/);
  assert.ok(finalEvaluation.indexOf("set_config('adhdice.achievement_deferred_user_id', '', true)") < finalEvaluation.indexOf("public.adhdice_evaluate_achievements("));
  assert.match(finalEvaluation, /md5\('task-state-command-achievement-evaluation:' \|\| p_user_id::text \|\| ':' \|\| v_command_id::text\)::uuid/);
  assert.match(finalEvaluation, /not in \('completed', 'inactive'\)/);
  assert.match(finalEvaluation, /raise exception 'Final Achievement evaluation failed/);
  assert.ok(finalEvaluation.indexOf("raise exception 'Final Achievement evaluation failed") < finalEvaluation.indexOf("return v_result"));
  assert.doesNotMatch(commandSource, /statement_timeout|pg_sleep|retry/i);
});

test("automatic History facts retain per-row Achievement capture and Step-set refresh", () => {
  const triggerFunctionStart = achievementRuntime.indexOf("create or replace function public.adhdice_capture_and_evaluate_achievement_source()");
  const triggerFunctionEnd = achievementRuntime.indexOf("$function$;", triggerFunctionStart);
  const triggerFunction = achievementRuntime.slice(triggerFunctionStart, triggerFunctionEnd);
  const automaticLoopStart = commandSource.indexOf("  for v_automatic_history in");

  assert.match(achievementRuntime, /create trigger adhdice_capture_task_achievement_runtime[\s\S]*on public\.adhdice_task_history_facts for each row/);
  assert.match(triggerFunction, /adhdice_capture_task_achievement_occurrence\(new\.id\)/);
  assert.match(triggerFunction, /adhdice_refresh_achievement_step_set\(v_user_id,v_root_id\)/);
  assert.match(triggerFunction, /if not v_is_deferred then\s+perform public\.adhdice_evaluate_achievements/);
  assert.ok(commandSource.indexOf("set_config('adhdice.achievement_deferred_user_id', p_user_id::text, true)") < commandSource.indexOf("insert into public.adhdice_task_history_facts", automaticLoopStart));
});

test("final Achievement failure is fail-closed, transaction-local, and isolated from no-auto commands", () => {
  const deferredGuards = [...commandSource.matchAll(/if jsonb_array_length\(v_automatic_history_facts\) > 0 then/g)];
  assert.equal(deferredGuards.length, 2);
  assert.match(commandSource, /set_config\('adhdice\.achievement_deferred_user_id', p_user_id::text, true\)/);
  assert.match(commandSource, /set_config\('adhdice\.achievement_deferred_user_id', '', true\)/);
  assert.match(commandSource, /if v_history_id is not null and v_history_row\.outcome in \('done', 'did_my_best', 'complete'\) then/);
  assert.doesNotMatch(commandSource.slice(commandSource.indexOf("for v_automatic_history in"), commandSource.indexOf("if v_calendar_override")), /adhdice_task_reward_entitlements/);
  assert.match(migration, /pg_get_functiondef\(p\.oid\)/i);
  assert.match(migration, /v_match_count integer/);
  assert.match(migration, /v_match_count <> 1/);
  assert.match(migration, /execute v_definition/);
  assert.match(migration, /revoke all on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) to service_role/i);
  assert.doesNotMatch(migration, /statement_timeout|pg_sleep|retry/i);
});

test("the deployable embedded command mirrors the canonical Achievement-deferral RPC source", () => {
  assert.ok(embeddedCommandSource.includes(extractCommand(commandSource)));
});
