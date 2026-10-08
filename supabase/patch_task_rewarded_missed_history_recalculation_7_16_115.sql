-- ADHDice 7.16.115: preserve earned rewards while recalculating obsolete Missed History.
--
-- Source-only migration. Do not execute or deploy from this workspace.
-- Historical recalculation may retire an owned, selected-Task Missed fact in
-- range even when it backs an immutable reward entitlement. The existing FK
-- clears only canonical_history_id when that History fact is deleted.

begin;

do $rpc$
declare
  definition text;
  reward_guard constant text := $guard$    if exists (
      select 1
        from jsonb_array_elements_text(v_recalculate_history_delete_ids) as requested(id)
        join public.adhdice_task_reward_entitlements entitlement
          on entitlement.user_id = p_user_id
         and entitlement.canonical_history_id = requested.id::uuid
    ) then
      raise exception 'Historical recalculation cannot retire a History fact with a reward entitlement.'
        using errcode = '55000';
    end if;
$guard$;
  guard_occurrences integer;
  entitlement_history_fk text;
begin
  if to_regprocedure('public.adhdice_execute_task_state_command(uuid,jsonb)') is null then
    raise exception 'The canonical Task State command RPC is required before 7.16.115.';
  end if;
  definition := pg_get_functiondef('public.adhdice_execute_task_state_command(uuid,jsonb)'::regprocedure);

  select pg_get_constraintdef(constraint_row.oid)
    into entitlement_history_fk
    from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
   where schema_row.nspname = 'public'
     and table_row.relname = 'adhdice_task_reward_entitlements'
     and constraint_row.conname = 'adhdice_task_reward_entitlements_history_fkey'
     and constraint_row.contype = 'f';

  if entitlement_history_fk is null
     or entitlement_history_fk !~* 'ON DELETE SET NULL\s*\(canonical_history_id\)' then
    raise exception 'The canonical reward entitlement History FK must preserve entitlements with ON DELETE SET NULL (canonical_history_id).';
  end if;

  guard_occurrences := (length(definition) - length(replace(definition, reward_guard, ''))) / length(reward_guard);
  if guard_occurrences <> 1 then
    raise exception 'Expected exactly one current reward-entitlement retirement guard in the canonical Task State command RPC; found %.', guard_occurrences;
  end if;
  definition := replace(definition, reward_guard, '');

  if position($assert$Historical recalculation may retire only owned Missed History facts from its replay date.$assert$ in definition) = 0
     or position($assert$on fact.user_id = p_user_id$assert$ in definition) = 0
     or position($assert$and fact.entity_id = v_entity_id$assert$ in definition) = 0
     or position($assert$or fact.logical_date < v_recalculate_from_logical_date$assert$ in definition) = 0
     or position($assert$or fact.outcome <> 'missed'$assert$ in definition) = 0
     or position($assert$Historical recalculation Missed facts require past, owned, current schedule evidence.$assert$ in definition) = 0
     or position($assert$set resolution_state = 'superseded',$assert$ in definition) = 0
     or position($assert$resolved_history_id = null,$assert$ in definition) = 0
     or position($assert$Historical recalculation may retire only active owned Calendar overrides from its replay date.$assert$ in definition) = 0
     or position($assert$Final Achievement evaluation failed$assert$ in definition) = 0
     or position($assert$adhdice_evaluate_achievements_incremental_for_history_facts$assert$ in definition) = 0
     or position(reward_guard in definition) > 0 then
    raise exception 'The canonical Task State command RPC differs from the expected 7.16.115 reward-preserving recalculation contract.';
  end if;

  execute definition;
end;
$rpc$;

commit;
