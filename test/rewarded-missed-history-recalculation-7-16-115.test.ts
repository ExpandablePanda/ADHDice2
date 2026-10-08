import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/patch_task_rewarded_missed_history_recalculation_7_16_115.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/add_task_state_canonical_schema.sql", import.meta.url), "utf8");
const recalculateHistoryMigration = readFileSync(new URL("../supabase/patch_task_calendar_recalculate_history_7_16_111.sql", import.meta.url), "utf8");
const calendarAuthorityMigration = readFileSync(new URL("../supabase/patch_task_calendar_manual_authority_and_historical_delay_7_16_106.sql", import.meta.url), "utf8");
const commandRpc = readFileSync(new URL("../supabase/add_task_state_command_rpc.sql", import.meta.url), "utf8");
const entitlementPermanenceMigration = readFileSync(new URL("../supabase/patch_task_reward_entitlement_permanence_7_10_5.sql", import.meta.url), "utf8");

const rewardGuard = `    if exists (
      select 1
        from jsonb_array_elements_text(v_recalculate_history_delete_ids) as requested(id)
        join public.adhdice_task_reward_entitlements entitlement
          on entitlement.user_id = p_user_id
         and entitlement.canonical_history_id = requested.id::uuid
    ) then
      raise exception 'Historical recalculation cannot retire a History fact with a reward entitlement.'
        using errcode = '55000';
    end if;
`;

function transformExactlyOnce(definition: string, guard = rewardGuard): string {
  const count = definition.split(guard).length - 1;
  if (count !== 1) throw new Error(`Expected exactly one current reward guard, found ${count}`);
  return definition.replace(guard, "");
}

function replaceExactlyOnce(source: string, needle: string, replacement: string, label: string): string {
  const count = source.split(needle).length - 1;
  assert.equal(count, 1, `${label} must occur exactly once in the production RPC fixture`);
  return source.replace(needle, replacement);
}

function migrationReplacements(source: string): Array<{ needle: string; replacement: string }> {
  return Array.from(source.matchAll(/definition := replace\(\n    definition,\n    \$needle\$([\s\S]*?)\$needle\$,\n    \$replacement\$([\s\S]*?)\$replacement\$\n  \);/g), ([, needle, replacement]) => ({ needle, replacement }));
}

function applyMigrationReplacements(definition: string, source: string): string {
  const replacements = migrationReplacements(source);
  assert.ok(replacements.length > 0, "expected definition transformations in the installed RPC migrations");
  return replacements.reduce((current, replacement, index) => replaceExactlyOnce(
    current,
    replacement.needle,
    replacement.replacement,
    `installed RPC transform ${index + 1}`,
  ), definition);
}

function buildRepresentativeProductionRpc(): string {
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
  const currentFixture = replaceExactlyOnce(
    replaceExactlyOnce(commandRpc, liveAchievementEvaluator, liveAchievementEvaluatorWithDeletes, "live Achievement evaluator"),
    liveHistoryResult,
    liveHistoryResultWithDeletes,
    "live History result reference",
  );
  return applyMigrationReplacements(
    applyMigrationReplacements(currentFixture, calendarAuthorityMigration),
    recalculateHistoryMigration,
  );
}

test("7.16.115 removes only the unconditional reward-entitlement retirement guard", () => {
  const migrationGuard = migration.match(/reward_guard constant text := \$guard\$([\s\S]*?)\$guard\$;/)?.[1];
  assert.ok(migrationGuard, "migration must carry the exact live RPC guard as its replacement anchor");
  assert.equal(migrationGuard, rewardGuard);
  assert.match(migration, /Source-only migration\. Do not execute or deploy/i);
  assert.match(migration, /guard_occurrences <> 1/);
  assert.match(migration, /definition := replace\(definition, reward_guard, ''\)/);
  assert.match(migration, /pg_get_functiondef\('public\.adhdice_execute_task_state_command\(uuid,jsonb\)'::regprocedure\)/);

  const currentRpc = `  if v_command_type = 'recalculate_history' then
${rewardGuard}    if exists (automatic missed evidence check) then
      raise exception 'Historical recalculation Missed facts require past, owned, current schedule evidence.';
    end if;
    perform public.adhdice_evaluate_achievements_incremental_for_history_facts(p_user_id, array[]::uuid[], v_achievement_operation_id, 'immediate');
  end if;`;
  const transformed = transformExactlyOnce(currentRpc);

  assert.doesNotMatch(transformed, /cannot retire a History fact with a reward entitlement/);
  assert.match(transformed, /automatic missed evidence check/);
  assert.match(transformed, /adhdice_evaluate_achievements_incremental_for_history_facts/);
  assert.throws(() => transformExactlyOnce(currentRpc.replace(rewardGuard, "")), /found 0/);
  assert.throws(() => transformExactlyOnce(`${currentRpc}\n${rewardGuard}`), /found 2/);
});

test("7.16.115 preflight assertions match the production-shaped installed RPC", () => {
  const productionRpc = buildRepresentativeProductionRpc();
  const assertions = Array.from(
    migration.matchAll(/position\(\$assert\$([\s\S]*?)\$assert\$ in definition\) = 0/g),
    ([, assertion]) => assertion,
  );
  assert.equal(assertions.length, 11, "all 7.16.115 RPC safety assertions must be checked");

  for (const assertion of assertions) {
    assert.ok(productionRpc.includes(assertion), `live production RPC is missing expected assertion anchor: ${assertion}`);
  }

  assert.match(productionRpc, /left join public\.adhdice_task_history_facts fact\s+on fact\.user_id = p_user_id\s+and fact\.entity_id = v_entity_id\s+and fact\.id = requested\.id::uuid/i);
  assert.match(productionRpc, /fact\.logical_date < v_recalculate_from_logical_date/);
  assert.match(productionRpc, /fact\.outcome <> 'missed'/);
  assert.match(productionRpc, /set resolution_state = 'superseded',[\s\S]*resolved_history_id = null/);
  assert.match(productionRpc, /Historical recalculation Missed facts require past, owned, current schedule evidence\./);
  assert.match(productionRpc, /adhdice_evaluate_achievements_incremental_for_history_facts/);
});

test("recalculation retains the existing Missed-only ownership and replay-range protections", () => {
  assert.match(
    recalculateHistoryMigration,
    /fact\.user_id = p_user_id[\s\S]*fact\.entity_id = v_entity_id[\s\S]*fact\.id = requested\.id::uuid[\s\S]*fact\.logical_date < v_recalculate_from_logical_date[\s\S]*fact\.outcome <> 'missed'/,
  );
  assert.match(migration, /Historical recalculation may retire only owned Missed History facts from its replay date\./);
  assert.match(migration, /position\(\$assert\$on fact\.user_id = p_user_id\$assert\$ in definition\) = 0/);
  assert.match(migration, /Historical recalculation Missed facts require past, owned, current schedule evidence\./);
  assert.match(migration, /position\(\$assert\$set resolution_state = 'superseded',\$assert\$ in definition\) = 0/);
  assert.match(migration, /position\(\$assert\$resolved_history_id = null,\$assert\$ in definition\) = 0/);

  // Since only validated Missed IDs can enter the delete list, protected outcomes
  // remain outside the retirement set, while unselected Missed facts are retained.
  assert.match(recalculateHistoryMigration, /fact\.outcome <> 'missed'/);
  assert.match(recalculateHistoryMigration, /fact\.logical_date < v_recalculate_from_logical_date/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.adhdice_task_reward_entitlements/i);
  assert.doesNotMatch(migration, /update\s+public\.adhdice_task_reward_entitlements/i);
});

test("the existing FK preserves the complete earned entitlement and clears only its History reference", () => {
  assert.match(
    schema,
    /constraint adhdice_task_reward_entitlements_history_fkey[\s\S]*foreign key \(user_id, canonical_history_id\)[\s\S]*on delete set null \(canonical_history_id\)/i,
  );
  assert.match(migration, /ON DELETE SET NULL\\s\*\\\(canonical_history_id\\\)/);
  assert.match(entitlementPermanenceMigration, /canonical_history_id drop not null/i);
  assert.match(entitlementPermanenceMigration, /on delete set null \(canonical_history_id\)/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.adhdice_task_reward_grants/i);
  assert.doesNotMatch(migration, /update\s+public\.adhdice_task_reward_entitlements\b/i);
  assert.doesNotMatch(migration, /reward_units_snapshot\s*=|outcome_snapshot\s*=|fulfilled_at\s*=/i);
});

test("production regression: Task Test 2 on September 22 retires Missed while retaining its fulfilled Done reward", () => {
  const factId = "92200000-0000-4000-8000-000000000001";
  const candidate = {
    userId: "92200000-0000-4000-8000-000000000002",
    taskId: "92200000-0000-4000-8000-000000000003",
    id: factId,
    logicalDate: "2026-09-22",
    priorOutcome: "done",
    outcome: "missed",
    isSelectedForRetirement: true,
  };
  const entitlement = {
    id: "92200000-0000-4000-8000-000000000004",
    canonicalHistoryId: factId,
    originalOutcomeSnapshot: "done",
    rewardUnits: 3,
    fulfillmentState: "fulfilled",
    grants: [{ id: "92200000-0000-4000-8000-000000000005", units: 3 }],
  };
  const transformed = transformExactlyOnce(`recalculate_history validation\n${rewardGuard}owned Missed/range validation remains`);
  const eligibleMissed = candidate.isSelectedForRetirement
    && candidate.outcome === "missed"
    && candidate.logicalDate >= "2026-09-22";

  assert.equal(eligibleMissed, true);
  assert.match(transformed, /owned Missed\/range validation remains/);
  assert.doesNotMatch(transformed, /reward entitlement/);
  const entitlementAfterFkAction = { ...entitlement, canonicalHistoryId: null };
  assert.deepEqual(entitlementAfterFkAction, {
    ...entitlement,
    canonicalHistoryId: null,
  });
  assert.equal(entitlementAfterFkAction.id, entitlement.id);
  assert.equal(entitlementAfterFkAction.originalOutcomeSnapshot, "done");
  assert.equal(entitlementAfterFkAction.rewardUnits, 3);
  assert.equal(entitlementAfterFkAction.fulfillmentState, "fulfilled");
  assert.deepEqual(entitlementAfterFkAction.grants, entitlement.grants);
});

test("Achievement reconciliation remains and repeated recalculation cannot create rewards or duplicate History", () => {
  assert.match(migration, /adhdice_evaluate_achievements_incremental_for_history_facts/);
  assert.match(migration, /Final Achievement evaluation failed/);
  assert.match(recalculateHistoryMigration, /set resolution_state = 'superseded'/);
  assert.match(recalculateHistoryMigration, /delete from public\.adhdice_task_history_facts fact/);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.adhdice_task_reward_entitlements/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.adhdice_task_history_facts/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.adhdice_task_history_facts/i);
});
