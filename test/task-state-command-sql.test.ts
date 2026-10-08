import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/add_task_state_canonical_schema.sql", import.meta.url), "utf8");
const delayMigration = readFileSync(new URL("../supabase/patch_task_state_command_delay_occurrence_7_7_47.sql", import.meta.url), "utf8");
const rolloverMigration = readFileSync(new URL("../supabase/patch_task_state_command_rollover_7_9_20.sql", import.meta.url), "utf8");
const autoMissedMigration = readFileSync(new URL("../supabase/patch_task_state_auto_missed_history_copy_7_9_31.sql", import.meta.url), "utf8");
const scheduleAutoMissedMigration = readFileSync(new URL("../supabase/patch_task_state_schedule_auto_missed_7_11_73.sql", import.meta.url), "utf8");
const blankDueMigration = readFileSync(new URL("../supabase/patch_task_calendar_override_blank_due_7_16_99.sql", import.meta.url), "utf8");
const inProgressMigration = readFileSync(new URL("../supabase/patch_task_calendar_override_in_progress_7_16_103.sql", import.meta.url), "utf8");
const calendarAuthorityMigration = readFileSync(new URL("../supabase/patch_task_calendar_manual_authority_and_historical_delay_7_16_106.sql", import.meta.url), "utf8");
const recalculateHistoryMigration = readFileSync(new URL("../supabase/patch_task_calendar_recalculate_history_7_16_111.sql", import.meta.url), "utf8");

const liveAchievementEvaluationFixture = `
          || coalesce(v_automatic_history_delete_ids, '[]'::jsonb)
        ) value`;

const requiredCalendarAuthorityAssertions = [
  "v_history_fact_delete_ids jsonb;",
  "v_history_fact_delete_ids := coalesce(v_payload->'history_fact_delete_ids', '[]'::jsonb);",
  "or jsonb_typeof(v_history_fact_delete_ids) <> 'array'",
  "'automatic_history_delete_ids', 'history_fact_delete_ids', 'occurrence'",
  "if v_command_type <> 'calendar_override' and v_history_fact_delete_ids <> '[]'::jsonb then",
  "Calendar override History retirement is not a server-planned same-date replaceable fact.",
  "Complete and Delayed History facts cannot be replaced by a Calendar override.",
  "update public.adhdice_task_occurrences occurrence\n       set resolution_state = 'unresolved',",
  "update public.adhdice_task_occurrence_effective_overrides override_row\n       set history_id = null,",
  "delete from public.adhdice_task_history_facts fact",
  "|| coalesce(v_history_fact_delete_ids, '[]'::jsonb)",
  "'history_fact_delete_ids', v_automatic_history_delete_ids || v_history_fact_delete_ids",
];

const legacyAutomaticHistoryGuard = /if\s+v_command_type\s*<>\s*'reconcile_rollover'\s+and\s+v_automatic_history_facts\s*<>\s*'\[\]'\s*::\s*jsonb\s+then\s+raise\s+exception\s+'Only trusted rollover may create automatic History facts\.'\s+using\s+errcode\s*=\s*'42501'\s*;\s*end\s+if\s*;/gi;
const scheduleAwareAutomaticHistoryGuard = /if\s+v_command_type\s+not\s+in\s*\(\s*'reconcile_rollover'\s*,\s*'set_due_date'\s*,\s*'set_repeat'\s*\)\s+and\s+v_automatic_history_facts\s*<>\s*'\[\]'\s*::\s*jsonb\s+then\s+raise\s+exception\s+'Only trusted schedule replay or rollover may create automatic History facts\.'\s+using\s+errcode\s*=\s*'42501'\s*;\s*end\s+if\s*;/gi;

const calendarAuthorityReplacementPattern = /definition := replace\(\n    definition,\n    \$needle\$([\s\S]*?)\$needle\$,\n    \$replacement\$([\s\S]*?)\$replacement\$\n  \);/g;

type SqlReplacement = { needle: string; replacement: string };

function extractCalendarAuthorityReplacements(migration: string): SqlReplacement[] {
  return Array.from(migration.matchAll(calendarAuthorityReplacementPattern), ([, needle, replacement]) => ({
    needle,
    replacement,
  }));
}

function applyCalendarAuthorityReplacements(definition: string, migration: string): string {
  const replacements = extractCalendarAuthorityReplacements(migration);
  assert.equal(replacements.length, 9, "7.16.106 must contain all nine expected definition replacements");

  return replacements.reduce((currentDefinition, replacement, index) => {
    const occurrences = currentDefinition.split(replacement.needle).length - 1;
    assert.equal(
      occurrences,
      1,
      `7.16.106 replacement ${index + 1} must match its current-live-RPC anchor exactly once`,
    );
    return currentDefinition.replace(replacement.needle, replacement.replacement);
  }, definition);
}

function replaceExactlyOnce(source: string, needle: string, replacement: string, label: string): string {
  const occurrences = source.split(needle).length - 1;
  assert.equal(occurrences, 1, `${label} must occur exactly once in the current-live-RPC fixture`);
  return source.replace(needle, replacement);
}

function transformAutomaticHistoryGuard(definition: string): string {
  const matcher = new RegExp(legacyAutomaticHistoryGuard.source, legacyAutomaticHistoryGuard.flags);
  const matches = Array.from(definition.matchAll(matcher));
  if (matches.length !== 1) {
    throw new Error(`automatic History command guard was not found exactly once (found ${matches.length} matches)`);
  }
  return definition.replace(matcher, "if v_command_type not in ('reconcile_rollover', 'set_due_date', 'set_repeat') and v_automatic_history_facts <> '[]'::jsonb then raise exception 'Only trusted schedule replay or rollover may create automatic History facts.' using errcode='42501'; end if;");
}

test("M3A command RPC is a backend-only invoker boundary", () => {
  assert.match(sql, /create or replace function public\.adhdice_execute_task_state_command\(\s*p_user_id uuid,\s*p_command jsonb\s*\)/i);
  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /set search_path = public, pg_temp/i);
  assert.match(sql, /current_user <> 'service_role'/i);
  assert.doesNotMatch(sql, /auth\.uid\(\)/i);
  assert.match(sql, /revoke all on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) to service_role/i);
});

test("the backend runtime boundary allows automation provenance only for trusted rollover", () => {
  assert.match(sql, /v_source_kind <> 'runtime'[\s\S]*v_command_type = 'reconcile_rollover'[\s\S]*authorized_automation/i);
  assert.match(sql, /runtime RPC accepts source_kind=runtime, except for the trusted automatic rollover provenance/i);
  assert.doesNotMatch(sql, /v_source_kind not in \('runtime', 'authorized_automation', 'repair'\)/i);
});

test("runtime payload structure is command-specific and rejects provenance spoofing", () => {
  assert.match(sql, /jsonb_object_keys\(v_payload\)/i);
  assert.match(sql, /Lifecycle commands cannot carry History, schedule, occurrence, delay, Calendar, or reward mutations/i);
  assert.match(sql, /Outcome command must carry one explicit outcome History fact/i);
  assert.match(sql, /start_in_progress requires a compatible workflow patch/i);
  assert.match(sql, /clear_in_progress requires a compatible workflow patch/i);
  assert.match(sql, /Runtime Task State provenance is server-owned/i);
  assert.doesNotMatch(sql, /migration_operation_id|migration_version|classifier_version/i);
  assert.match(sql, /actor_kind.*user/i);
  assert.match(sql, /accepted_payload_digest.*sha256-/i);
});

test("Clear Balance admits only its serialized marker through the SQL contract", () => {
  const allowlist = sql.match(/where key not in \([\s\S]*?\)\s*\) then\s*raise exception 'Task State command payload contains an unknown section\.'/i)?.[0] ?? "";
  const clearBranch = sql.match(/elsif v_command_type = 'clear_quota_balance' then([\s\S]*?)elsif v_command_type = 'reconcile_rollover' then/i)?.[1] ?? "";
  assert.match(allowlist, /'clear_quota_balance'/);
  assert.match(clearBranch, /coalesce\(v_payload->>'clear_quota_balance', 'false'\) <> 'true'/);
});

test("canonical Delay requires a trusted occurrence, delayed History, and effective override", () => {
  const delayBranch = sql.match(/elsif v_command_type = 'delay_occurrence' then([\s\S]*?)elsif v_command_type in \('set_due_date', 'set_repeat'\) then/i)?.[1] ?? "";
  assert.match(delayBranch, /v_history = '\{\}'::jsonb/);
  assert.match(delayBranch, /v_history->>'outcome' <> 'delayed'/);
  assert.match(delayBranch, /v_history->>'event_kind' <> 'delay_audit'/);
  assert.match(delayBranch, /v_effective_override = '\{\}'::jsonb/);
  assert.match(delayBranch, /v_occurrence = '\{\}'::jsonb/);
  assert.match(delayBranch, /v_schedule <> '\{\}'::jsonb/);
  assert.match(delayBranch, /v_calendar_override <> '\{\}'::jsonb/);
  assert.match(delayBranch, /v_payload \? 'reward_program_version'/);
  assert.match(delayBranch, /where key not in \('canonicalization_status'\)/);
});

test("canonical Delay materializes occurrence before validating History ownership", () => {
  const occurrenceInsert = sql.indexOf("insert into public.adhdice_task_occurrences");
  const historyOwnershipCheck = sql.indexOf("History fact occurrence is not owned by the Task entity.");
  assert.ok(occurrenceInsert >= 0);
  assert.ok(historyOwnershipCheck >= 0);
  assert.ok(occurrenceInsert < historyOwnershipCheck);
});

test("canonical occurrence schema enforces one row per Task/date and derives the unique occurrence key from that date", () => {
  assert.match(schema, /constraint adhdice_task_occurrences_entity_date_key\s+unique \(user_id, entity_id, scheduled_due_on\)/i);
  assert.match(schema, /constraint adhdice_task_occurrences_key_key\s+unique \(user_id, occurrence_key\)/i);
  assert.match(schema, /constraint adhdice_task_occurrences_key_shape_check check \([\s\S]*occurrence_key = 'task:' \|\| entity_id::text \|\| ':occurrence:' \|\| scheduled_due_on::text/i);
  assert.match(schema, /resolution_state in \('unresolved', 'resolved', 'superseded'\)/i);
});

test("Calendar override commands replace the active row without deleting audit history", () => {
  const overrideBranchStart = sql.indexOf("if v_calendar_override <> '{}'::jsonb then");
  const entitlementStart = sql.indexOf("-- The entitlement is canonical", overrideBranchStart);
  const overrideBranch = sql.slice(overrideBranchStart, entitlementStart);
  const retireIndex = overrideBranch.indexOf("update public.adhdice_task_calendar_overrides existing_override");
  const insertIndex = overrideBranch.indexOf("insert into public.adhdice_task_calendar_overrides");

  assert.ok(retireIndex >= 0);
  assert.ok(insertIndex > retireIndex);
  assert.match(overrideBranch, /existing_override\.user_id = p_user_id/);
  assert.match(overrideBranch, /existing_override\.entity_id = v_entity_id/);
  assert.match(overrideBranch, /existing_override\.logical_date = nullif\(v_calendar_override->>'logical_date', ''\)::date/);
  assert.match(overrideBranch, /existing_override\.is_active/);
  assert.match(overrideBranch, /is_active = false/);
  assert.match(overrideBranch, /cleared_at = now\(\)/);
  assert.match(overrideBranch, /cleared_by_command_id = v_command_id/);
  assert.match(overrideBranch, /revision = existing_override\.revision \+ 1/);
  assert.doesNotMatch(overrideBranch, /delete\s+from\s+public\.adhdice_task_calendar_overrides/i);
  assert.match(schema, /create unique index if not exists adhdice_task_calendar_overrides_active_key[\s\S]*where is_active/i);
});

test("7.16.99 adds blank_due without executing a schema change in source tests", () => {
  assert.match(blankDueMigration, /drop constraint if exists adhdice_task_calendar_overrides_override_state_check/i);
  assert.match(blankDueMigration, /override_state in \('unscheduled', 'not_due', 'due_open', 'blank_due'\)/i);
  assert.doesNotMatch(blankDueMigration, /select\s+public\.adhdice_execute_task_state_command\b/i);
});

test("7.16.103 adds the source-only in_progress Calendar override state", () => {
  assert.match(inProgressMigration, /drop constraint if exists adhdice_task_calendar_overrides_override_state_check/i);
  assert.match(inProgressMigration, /override_state in \('unscheduled', 'not_due', 'due_open', 'blank_due', 'in_progress'\)/i);
  assert.doesNotMatch(inProgressMigration, /select\s+public\.adhdice_execute_task_state_command\b/i);
});

test("7.16.106 authors an atomic server-planned History retirement contract without executing it", () => {
  assert.match(calendarAuthorityMigration, /v_history_fact_delete_ids jsonb/i);
  assert.match(calendarAuthorityMigration, /'history_fact_delete_ids'/i);
  assert.match(calendarAuthorityMigration, /v_command_type <> 'calendar_override'/i);
  assert.match(calendarAuthorityMigration, /outcome not in \('done', 'did_my_best', 'missed'\)/i);
  assert.match(calendarAuthorityMigration, /outcome in \('complete', 'delayed'\)/i);
  assert.match(calendarAuthorityMigration, /delete from public\.adhdice_task_history_facts/i);
  assert.match(calendarAuthorityMigration, /history_fact_delete_ids.*v_automatic_history_delete_ids/i);
  assert.doesNotMatch(calendarAuthorityMigration, /delete from public\.adhdice_task_reward_entitlements/i);
  assert.doesNotMatch(calendarAuthorityMigration, /select\s+public\.adhdice_execute_task_state_command\b/i);
  assert.match(calendarAuthorityMigration, /Source-only migration\. Do not execute or deploy/i);
});

test("7.16.107 targets the current live Achievement evaluation shape and reports Calendar deletes", () => {
  const liveAnchor = "          || coalesce(v_automatic_history_delete_ids, '[]'::jsonb)\n        ) value";
  const patched = liveAchievementEvaluationFixture.replace(
    liveAnchor,
    "          || coalesce(v_automatic_history_delete_ids, '[]'::jsonb)\n"
      + "          || coalesce(v_history_fact_delete_ids, '[]'::jsonb)\n"
      + "        ) value",
  );

  assert.notEqual(patched, liveAchievementEvaluationFixture);
  assert.match(patched, /coalesce\(v_history_fact_delete_ids, '\[\]'::jsonb\)/i);
  assert.match(calendarAuthorityMigration, /\$needle\$[\s\S]*coalesce\(v_automatic_history_delete_ids, '\[\]'::jsonb\)[\s\S]*\) value\$needle\$/i);
  assert.match(calendarAuthorityMigration, /\$replacement\$[\s\S]*coalesce\(v_history_fact_delete_ids, '\[\]'::jsonb\)[\s\S]*\) value\$replacement\$/i);
  assert.match(calendarAuthorityMigration, /\|\| coalesce\(v_history_fact_delete_ids, '\[\]'::jsonb\)[\s\S]*\) value/);
});

test("7.16.107 fails closed for every required 7.16.106 transform before executing the RPC", () => {
  const assertionStart = calendarAuthorityMigration.indexOf("if position($assert$");
  const executeIndex = calendarAuthorityMigration.indexOf("  execute definition;", assertionStart);
  assert.ok(assertionStart >= 0);
  assert.ok(executeIndex > assertionStart);

  const assertionBlock = calendarAuthorityMigration.slice(assertionStart, executeIndex);
  for (const requiredAssertion of requiredCalendarAuthorityAssertions) {
    assert.ok(assertionBlock.includes(requiredAssertion), `missing fail-closed assertion for ${requiredAssertion}`);
  }
  assert.match(assertionBlock, /raise exception 'Could not patch the canonical Task State command RPC/);
  const raiseOffset = assertionBlock.indexOf("raise exception");
  assert.ok(raiseOffset >= 0);
  assert.ok(executeIndex > assertionStart + raiseOffset);
});

test("7.16.109 keeps migration dollar-quote delimiters balanced", () => {
  for (const delimiter of ["$needle$", "$replacement$", "$assert$", "$rpc$"]) {
    const occurrences = calendarAuthorityMigration.split(delimiter).length - 1;
    assert.equal(occurrences % 2, 0, `${delimiter} must occur an even number of times`);
  }

  const atomicHistoryDeleteStart = calendarAuthorityMigration.indexOf(
    "  definition := replace(\n    definition,\n    $needle$  if v_automatic_history_delete_ids <> '[]'::jsonb then",
  );
  const achievementReplacementStart = calendarAuthorityMigration.indexOf(
    "  definition := replace(\n    definition,\n    $needle$          || coalesce(v_automatic_history_delete_ids",
    atomicHistoryDeleteStart,
  );

  assert.ok(atomicHistoryDeleteStart >= 0, "atomic History deletion replace block must exist");
  assert.ok(
    achievementReplacementStart > atomicHistoryDeleteStart,
    "atomic History deletion replace block must precede the Achievement replacement",
  );

  const atomicHistoryDeleteBlock = calendarAuthorityMigration.slice(
    atomicHistoryDeleteStart,
    achievementReplacementStart,
  );
  assert.equal(
    (atomicHistoryDeleteBlock.match(/\$replacement\$/g) ?? []).length,
    2,
    "atomic History deletion replacement must close its $replacement$ quote",
  );
  assert.match(
    atomicHistoryDeleteBlock,
    /end if;\n\n  if v_automatic_history_delete_ids <> '\[\]'::jsonb then\n    update public\.adhdice_task_occurrences occurrence\$replacement\$\n  \);/,
    "atomic History deletion replacement must preserve the original automatic delete prefix before closing $replacement$",
  );
});

test("7.16.110 preserves the original automatic History delete block during the full transform", () => {
  const automaticHistoryUpdateAnchor =
    "  if v_automatic_history_delete_ids <> '[]'::jsonb then\n"
    + "    update public.adhdice_task_occurrences occurrence\n"
    + "       set resolution_state = 'unresolved',";
  assert.ok(sql.includes(automaticHistoryUpdateAnchor), "current live RPC must retain the automatic History update anchor");

  const liveAchievementEvaluator = `    v_achievement_evaluation := public.adhdice_evaluate_achievements(
      p_user_id,
      v_achievement_operation_id,
      'immediate'
    );`;
  const liveAchievementEvaluatorWithDeletes = `    v_achievement_evaluation := public.adhdice_evaluate_achievements_incremental_for_history_facts(
      p_user_id,
      array(
        select value::uuid
        from jsonb_array_elements_text(
          (case when v_history_id is null then '[]'::jsonb else jsonb_build_array(v_history_id) end)
          || coalesce(v_automatic_history_ids, '[]'::jsonb)
          || coalesce(v_automatic_history_delete_ids, '[]'::jsonb)
        ) value
      ),
      v_achievement_operation_id,
      'immediate'
    );`;
  const liveHistoryResult = "    'history_fact_ids', v_automatic_history_ids,\n";
  const liveHistoryResultWithDeletes = "    'history_fact_ids', v_automatic_history_ids,\n"
    + "    'history_fact_delete_ids', v_automatic_history_delete_ids,\n";
  // The checked-in RPC source predates these two installed-live hardening anchors;
  // hydrate them before applying the complete 7.16.106 replacement sequence.
  const currentLiveRpcFixture = replaceExactlyOnce(
    replaceExactlyOnce(sql, liveAchievementEvaluator, liveAchievementEvaluatorWithDeletes, "live Achievement evaluator"),
    liveHistoryResult,
    liveHistoryResultWithDeletes,
    "live History result reference",
  );

  const transformed = applyCalendarAuthorityReplacements(currentLiveRpcFixture, calendarAuthorityMigration);
  const calendarHistoryBlockStart = transformed.indexOf(
    "  if v_history_fact_delete_ids <> '[]'::jsonb then\n",
  );
  const automaticHistoryBlockStart = transformed.indexOf(automaticHistoryUpdateAnchor);
  assert.ok(calendarHistoryBlockStart >= 0, "transformed RPC must contain the Calendar History retirement block");
  assert.ok(
    automaticHistoryBlockStart > calendarHistoryBlockStart,
    "transformed RPC must place the original automatic History block after Calendar retirement",
  );

  const sequentialBlocks = transformed.slice(calendarHistoryBlockStart, automaticHistoryBlockStart);
  assert.match(sequentialBlocks, /delete from public\.adhdice_task_history_facts fact/);
  assert.match(
    transformed,
    /end if;\n\n  if v_automatic_history_delete_ids <> '\[\]'::jsonb then/,
  );
  assert.match(
    transformed,
    /if v_automatic_history_delete_ids <> '\[\]'::jsonb then\n    update public\.adhdice_task_occurrences occurrence\n       set resolution_state = 'unresolved',/,
  );
  assert.doesNotMatch(transformed, /end if;\n\s+set resolution_state = 'unresolved',/);

  const originalAutomaticHistoryBlockStart = currentLiveRpcFixture.indexOf(automaticHistoryUpdateAnchor);
  const originalAutomaticHistoryBlockEnd = currentLiveRpcFixture.indexOf(
    "\n  if v_command_type = 'clear_outcome' then",
    originalAutomaticHistoryBlockStart,
  );
  assert.ok(originalAutomaticHistoryBlockStart >= 0);
  assert.ok(originalAutomaticHistoryBlockEnd > originalAutomaticHistoryBlockStart);
  assert.ok(
    transformed.includes(currentLiveRpcFixture.slice(originalAutomaticHistoryBlockStart, originalAutomaticHistoryBlockEnd)),
    "transformed RPC must preserve the complete original automatic History block",
  );
});

test("7.16.111 transforms the current live RPC with a bounded, fail-closed recalculation plan", () => {
  assert.match(recalculateHistoryMigration, /Source-only migration\. Do not execute or deploy/i);
  assert.doesNotMatch(recalculateHistoryMigration, /select\s+public\.adhdice_execute_task_state_command\b/i);

  const liveAchievementEvaluator = `    v_achievement_evaluation := public.adhdice_evaluate_achievements(
      p_user_id,
      v_achievement_operation_id,
      'immediate'
    );`;
  const liveAchievementEvaluatorWithDeletes = `    v_achievement_evaluation := public.adhdice_evaluate_achievements_incremental_for_history_facts(
      p_user_id,
      array(
        select value::uuid
        from jsonb_array_elements_text(
          (case when v_history_id is null then '[]'::jsonb else jsonb_build_array(v_history_id) end)
          || coalesce(v_automatic_history_ids, '[]'::jsonb)
          || coalesce(v_automatic_history_delete_ids, '[]'::jsonb)
        ) value
      ),
      v_achievement_operation_id,
      'immediate'
    );`;
  const liveHistoryResult = "    'history_fact_ids', v_automatic_history_ids,\n";
  const liveHistoryResultWithDeletes = "    'history_fact_ids', v_automatic_history_ids,\n"
    + "    'history_fact_delete_ids', v_automatic_history_delete_ids,\n";
  const currentLiveRpcFixture = replaceExactlyOnce(
    replaceExactlyOnce(sql, liveAchievementEvaluator, liveAchievementEvaluatorWithDeletes, "live Achievement evaluator"),
    liveHistoryResult,
    liveHistoryResultWithDeletes,
    "live History result reference",
  );

  const afterCalendarAuthority = applyCalendarAuthorityReplacements(currentLiveRpcFixture, calendarAuthorityMigration);
  const replacements = extractCalendarAuthorityReplacements(recalculateHistoryMigration);
  assert.equal(replacements.length, 14, "7.16.111 must contain all fourteen expected definition replacements");
  const transformed = replacements.reduce((currentDefinition, replacement, index) => {
    const occurrences = currentDefinition.split(replacement.needle).length - 1;
    assert.equal(
      occurrences,
      1,
      `7.16.111 replacement ${index + 1} must match the transformed current-live-RPC anchor exactly once`,
    );
    return currentDefinition.replace(replacement.needle, replacement.replacement);
  }, afterCalendarAuthority);

  assert.match(transformed, /v_recalculate_history_delete_ids jsonb/);
  assert.match(transformed, /v_recalculate_calendar_override_ids jsonb/);
  assert.match(transformed, /'recalculate_history'/);
  assert.match(transformed, /recalculate_from_logical_date/);
  assert.match(transformed, /Historical recalculation for quota recurrence is not supported yet\./);
  assert.match(transformed, /outcome <> 'missed'/);
  assert.match(transformed, /Historical recalculation may retire only owned Missed History facts/);
  assert.match(transformed, /set resolution_state = 'superseded'/);
  assert.match(transformed, /set is_active = false/);
  assert.match(transformed, /'recalculate_history_delete_ids', v_recalculate_history_delete_ids/);
  assert.match(transformed, /coalesce\(v_recalculate_history_delete_ids, '\[\]'::jsonb\)/);

  const recalculateBlockStart = transformed.indexOf("  if v_recalculate_history_delete_ids <> '[]'::jsonb then");
  const automaticBlockStart = transformed.indexOf(
    "  if v_automatic_history_delete_ids <> '[]'::jsonb then\n"
      + "    update public.adhdice_task_occurrences occurrence\n"
      + "       set resolution_state = 'unresolved',",
  );
  assert.ok(recalculateBlockStart >= 0);
  assert.ok(automaticBlockStart > recalculateBlockStart);
  assert.match(
    transformed.slice(recalculateBlockStart, automaticBlockStart),
    /delete from public\.adhdice_task_history_facts fact/,
  );
  assert.match(
    transformed.slice(recalculateBlockStart, automaticBlockStart),
    /resolved_history_id in \(\s*select value::uuid from jsonb_array_elements_text\(v_recalculate_history_delete_ids\)/,
  );
  assert.match(transformed, /Historical recalculation cannot retire a History fact with a reward entitlement/);
  assert.match(transformed, /Historical recalculation Missed facts require past, owned, current schedule evidence/);
  assert.match(transformed, /Final Achievement evaluation failed/);
  assert.match(recalculateHistoryMigration, /execute definition;/);

  for (const delimiter of ["$needle$", "$replacement$", "$assert$", "$rpc$"]) {
    const occurrences = recalculateHistoryMigration.split(delimiter).length - 1;
    assert.equal(occurrences % 2, 0, `${delimiter} must occur an even number of times`);
  }
});

test("clear_outcome retires the same-date Calendar override before removing the canonical outcome", () => {
  const clearStart = sql.lastIndexOf("if v_command_type = 'clear_outcome' then");
  const clearEnd = sql.indexOf("elsif v_history <> '{}'::jsonb then", clearStart);
  const clearBranch = sql.slice(clearStart, clearEnd);
  const overrideClearIndex = clearBranch.indexOf("update public.adhdice_task_calendar_overrides calendar_override_row");
  const historyDeleteIndex = clearBranch.indexOf("delete from public.adhdice_task_history_facts");

  assert.ok(overrideClearIndex >= 0 && overrideClearIndex < historyDeleteIndex);
  assert.match(clearBranch, /calendar_override_row\.is_active/);
  assert.match(clearBranch, /calendar_override_row\.logical_date = \(v_payload->>'clear_logical_date'\)::date/);
  assert.match(clearBranch, /is_active = false/);
});

test("7.7.47 migration changes only the stale Delay occurrence predicate and preserves service-role grants", () => {
  assert.match(delayMigration, /pg_get_functiondef\(p\.oid\)/i);
  assert.match(delayMigration, /or v_occurrence <> '\{\}'::jsonb/);
  assert.match(delayMigration, /or v_occurrence = '\{\}'::jsonb/);
  assert.match(delayMigration, /execute replace\(v_definition, v_old, v_new\)/i);
  assert.match(delayMigration, /revoke all on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) from public, anon, authenticated/i);
  assert.match(delayMigration, /grant execute on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) to service_role/i);
  assert.doesNotMatch(delayMigration, /select\s+public\.adhdice_execute_task_state_command\b/i);
});

test("command identity and revision contracts are locked before canonical writes", () => {
  assert.match(schema, /unique \(user_id, idempotence_identity\)/i);
  assert.match(schema, /unique \(user_id, command_id\)/i);
  assert.match(sql, /if v_operation\.state in \('committed', 'rejected'\)[\s\S]*was_replayed', true/i);
  assert.match(sql, /from public\.adhdice_clean_tasks[\s\S]*for update;/i);
  assert.match(sql, /v_task\.canonical_revision is distinct from v_expected_entity_revision/i);
  assert.match(sql, /v_task\.entity_kind is distinct from v_entity_kind/i);
  assert.match(sql, /'STALE_REVISION'/i);
  assert.match(sql, /'STALE_BOUNDARY_SEQUENCE'/i);
  assert.match(sql, /expected_entity_revision bigint/i);
  assert.match(sql, /History and occurrence[\s\S]*not runtime fences/i);
  assert.doesNotMatch(sql, /max\(revision\)[\s\S]*adhdice_task_history_facts/i);
  assert.doesNotMatch(sql, /max\(revision\)[\s\S]*adhdice_task_occurrences/i);
  assert.match(sql, /operation becomes committed only after every canonical write/i);
});

test("first-execution replay identity is serialized and re-read without weakening unique fences", () => {
  assert.equal((sql.match(/pg_advisory_xact_lock\(hashtextextended\(/gi) ?? []).length, 2);
  assert.match(sql, /on conflict do nothing\s+returning \* into v_operation/i);
  assert.match(sql, /a concurrent or separately authorized writer claimed a replay key/i);
  assert.match(sql, /where user_id = p_user_id[\s\S]*\(idempotence_identity = v_idempotence_identity or command_id = v_command_id\)/i);
  assert.match(sql, /using errcode = '40001'/i);
  assert.match(schema, /unique \(user_id, idempotence_identity\)/i);
  assert.match(schema, /unique \(user_id, command_id\)/i);
});

test("canonical and compatibility writes are one guarded projection, with no legacy authority", () => {
  assert.match(sql, /canonical_revision = v_next_revision/i);
  assert.match(sql, /status = v_projection_status::public\.adhdice_clean_task_status/i);
  assert.match(sql, /due_on = v_projection_due_on/i);
  assert.match(sql, /projection_source_canonical_revision = v_next_revision/i);
  assert.match(sql, /projection_source_fingerprint = v_accepted_payload_digest/i);
  assert.doesNotMatch(sql, /insert into public\.adhdice_task_history\b/i);
  assert.doesNotMatch(sql, /insert into public\.adhdice_task_reward_claim_consumptions\b/i);
  assert.doesNotMatch(sql, /insert into public\.adhdice_task_reward_claims\b/i);
  assert.match(sql, /due_on are applied only after this canonical revision check/i);
});

test("rollover accepts only the trusted automatic DMB artifact set", () => {
  const branch = sql.match(/if v_command_type = 'reconcile_rollover' then([\s\S]*?)end if;\n\n  if v_projection->>'status'/i)?.[1] ?? "";
  assert.match(branch, /v_history = '\{\}'::jsonb/);
  assert.match(branch, /v_history->>'outcome' <> 'did_my_best'/i);
  assert.match(branch, /v_history->>'event_kind' <> 'authorized_automation'/i);
  assert.match(branch, /logical_date.*v_task\.workflow_logical_date/i);
  assert.match(branch, /workflow_occurrence_id/i);
  assert.match(branch, /without a workflow occurrence cannot carry a scheduled due date/i);
  assert.match(branch, /task-reward-v1/i);
  assert.match(branch, /effective_logical_date/i);
  assert.doesNotMatch(branch, /v_history->>'outcome' <> 'done'/i);
  assert.match(sql, /synthetic_did_my_best/i);
  assert.match(rolloverMigration, /pg_get_functiondef\(p\.oid\)/i);
  assert.match(rolloverMigration, /execute v_definition/i);
  assert.match(rolloverMigration, /Automatic rollover must finalize only the stale workflow as Did My Best/i);
  assert.doesNotMatch(rolloverMigration, /select\s+public\.adhdice_execute_task_state_command\b/i);
});

test("trusted rollover persists idempotent Auto Missed without rewards and fences dependent cleanup", () => {
  assert.match(sql, /automatic_history_facts/);
  assert.match(sql, /value->>'outcome' <> 'missed'/);
  assert.match(sql, /\(value->>'logical_date'\)::date >= public\.adhdice_effective_logical_date/);
  assert.match(sql, /boundary\.boundary_sequence = v_current_boundary_sequence/);
  assert.match(sql, /boundary\.schedule_model <> 'unscheduled'/);
  assert.match(sql, /on conflict \(user_id, entity_id, logical_date\) do nothing/);
  assert.match(sql, /Automatic Missed conflicts with an existing canonical History fact/);
  assert.match(sql, /v_history_row\.outcome in \('done', 'did_my_best', 'complete'\)/);
  assert.doesNotMatch(sql, /v_history_row\.outcome in \([^)]*missed/);

  assert.match(sql, /automatic_history_delete_ids/);
  assert.match(sql, /fact\.provenance_kind <> 'authorized_automation'/);
  assert.match(sql, /fact\.actor_kind <> 'authorized_automation'/);
  assert.match(sql, /boundary\.schedule_model = 'rolling'/);
  assert.match(sql, /boundary\.repeat_interval > 1/);
  assert.match(sql, /canonical_history_id = fact\.id/);
});

test("7.9.31 forward patch targets the installed RPC and migration-only Delay allowance", () => {
  assert.match(autoMissedMigration, /pg_get_functiondef\(p\.oid\)/i);
  assert.match(autoMissedMigration, /automatic_history_facts/);
  assert.match(autoMissedMigration, /Automatic Missed conflicts with an existing canonical History fact/);
  assert.match(autoMissedMigration, /Dependent automatic History deletion is not proven safe/);
  assert.match(autoMissedMigration, /event_kind = 'migration_reconstruction'[\s\S]*provenance_kind = 'migration_reconstruction'[\s\S]*actor_kind = 'migration'/);
  assert.match(autoMissedMigration, /revoke all on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) from public, anon, authenticated/i);
  assert.match(autoMissedMigration, /grant execute on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) to service_role/i);
  assert.doesNotMatch(autoMissedMigration, /select\s+public\.adhdice_execute_task_state_command\b/i);
  assert.doesNotMatch(autoMissedMigration, /insert\s+into\s+public\.adhdice_clean_tasks/i);
  assert.doesNotMatch(autoMissedMigration, /insert\s+into\s+public\.adhdice_task_reward_entitlements/i);
});

test("7.11.73 forward patch allows one trusted schedule replay to persist automatic Missed facts", () => {
  assert.match(scheduleAutoMissedMigration, /pg_get_functiondef\(p\.oid\)/i);
  assert.match(scheduleAutoMissedMigration, /v_command_type not in \('reconcile_rollover', 'set_due_date', 'set_repeat'\)/i);
  assert.match(scheduleAutoMissedMigration, /v_schedule->>'effective_from_logical_date'/i);
  assert.match(scheduleAutoMissedMigration, /v_payload \? 'reward_program_version'/i);
  assert.match(scheduleAutoMissedMigration, /value->>'schedule_boundary_id' <> v_schedule->>'id'/i);
  assert.match(scheduleAutoMissedMigration, /value->>'outcome' <> 'missed'/i);
  assert.match(scheduleAutoMissedMigration, /nullif\(value->>'schedule_boundary_id', ''\) is null/i);
  assert.match(scheduleAutoMissedMigration, /execute v_definition/i);
  assert.match(scheduleAutoMissedMigration, /revoke all on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) from public, anon, authenticated/i);
  assert.match(scheduleAutoMissedMigration, /grant execute on function public\.adhdice_execute_task_state_command\(uuid, jsonb\) to service_role/i);
  assert.doesNotMatch(scheduleAutoMissedMigration, /select\s+public\.adhdice_execute_task_state_command\b/i);
  assert.doesNotMatch(scheduleAutoMissedMigration, /\b(?:insert|update|delete)\s+(?:into\s+)?public\.adhdice_(?:clean_tasks|task_history(?:_facts)?)\b/i);
  assert.doesNotMatch(scheduleAutoMissedMigration, /insert\s+into\s+public\.adhdice_clean_tasks/i);
  assert.doesNotMatch(scheduleAutoMissedMigration, /insert\s+into\s+public\.adhdice_task_reward_entitlements/i);
});

test("7.11.74 forward patch matches pretty and compact installed guards exactly once", () => {
  assert.match(scheduleAutoMissedMigration, /v_guard_matches\s+integer/i);
  assert.match(scheduleAutoMissedMigration, /from\s+regexp_matches\(v_definition,\s*v_old,\s*'gi'\)/i);
  assert.match(scheduleAutoMissedMigration, /if\s+v_guard_matches\s+<>\s+1\s+then/i);
  assert.match(scheduleAutoMissedMigration, /v_definition\s*:=\s*regexp_replace\(v_definition,\s*v_old,\s*v_new,\s*'gi'\)/i);
  assert.match(scheduleAutoMissedMigration, /\[\[:space:\]\]/i);

  const prettyDefinition = `create function public.adhdice_execute_task_state_command() returns void as $$
  if v_command_type <> 'reconcile_rollover' and v_automatic_history_facts <> '[]'::jsonb then
    raise exception 'Only trusted rollover may create automatic History facts.'
      using errcode = '42501';
  end if;
$$ language plpgsql;`;
  const compactDefinition = `create function public.adhdice_execute_task_state_command() returns void as $$ if v_command_type <> 'reconcile_rollover' and v_automatic_history_facts <> '[]'::jsonb then raise exception 'Only trusted rollover may create automatic History facts.' using errcode='42501'; end if; $$ language plpgsql;`;

  for (const definition of [prettyDefinition, compactDefinition]) {
    const transformed = transformAutomaticHistoryGuard(definition);
    assert.equal(Array.from(transformed.matchAll(legacyAutomaticHistoryGuard)).length, 0);
    assert.equal(Array.from(transformed.matchAll(scheduleAwareAutomaticHistoryGuard)).length, 1);
  }

  assert.throws(() => transformAutomaticHistoryGuard("create function without the expected guard"), /exactly once/);
  assert.throws(() => transformAutomaticHistoryGuard(`${prettyDefinition}\n${compactDefinition}`), /exactly once/);
});

test("reward entitlement persistence uses the canonical identity fence", () => {
  assert.match(schema, /unique \(user_id, entity_id, logical_date\)/i);
  assert.match(sql, /insert into public\.adhdice_task_reward_entitlements/i);
  assert.match(sql, /on conflict \(user_id, entity_id, logical_date\) do nothing/i);
  assert.match(sql, /reward_units_snapshot/);
  assert.match(sql, /task-reward-entitlement:' \|\| v_entity_id::text/i);
  assert.match(sql, /legacy reward claims are deliberately not consulted or written/i);
});

test("server-owned timestamps are set before schema-aligned record population", () => {
  assert.match(sql, /jsonb_set\(v_schedule, '\{created_at\}', to_jsonb\(now\(\)\), true\)/i);
  assert.match(sql, /jsonb_set\(v_occurrence, '\{updated_at\}', to_jsonb\(now\(\)\), true\)/i);
  assert.match(sql, /jsonb_set\(v_effective_override, '\{created_at\}', to_jsonb\(now\(\)\), true\)/i);
  assert.match(sql, /jsonb_set\(v_history, '\{updated_at\}', to_jsonb\(now\(\)\), true\)/i);
  assert.match(sql, /jsonb_set\(v_calendar_override, '\{created_at\}', to_jsonb\(now\(\)\), true\)/i);
  assert.match(sql, /set history_id = v_history_id,[\s\S]*where user_id = p_user_id and id = v_effective_override_id/i);
});

test("RPC source is a single function body without an execution command", () => {
  assert.equal((sql.match(/\$function\$/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /\bexecute\s+sql\b/i);
  assert.doesNotMatch(sql, /select\s+public\.adhdice_execute_task_state_command\b/i);
  assert.doesNotMatch(sql, /\bbegin\s*;/i);
});
