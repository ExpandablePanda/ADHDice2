-- ADHDice 7.8.18: unapplied legacy History promotion rollback RPC.
--
-- This artifact is intentionally not executed against live Supabase in 7.8.18.
-- One invocation is one PostgreSQL transaction.  It mutates only the exact
-- migration-owned canonical facts and retains the operation audit row.

-- The existing migration-support artifact enables RLS on the operation ledger
-- but intentionally grants it no authenticated read surface.  Install this
-- owner-scoped read policy together with the future rollback artifact so a
-- normal authenticated token can preview without receiving service-role power.
drop policy if exists "Users can read legacy History migration operations"
  on public.adhdice_task_migration_operations;
create policy "Users can read legacy History migration operations"
  on public.adhdice_task_migration_operations
  for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on table public.adhdice_task_migration_operations to authenticated;

create or replace function public.adhdice_rollback_legacy_history_promotion(
  p_user_id uuid,
  p_operation_id uuid,
  p_expected_fact_count integer,
  p_confirm_source_fingerprint text,
  p_confirm_migration_version text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_operation public.adhdice_task_migration_operations%rowtype;
  v_now timestamptz := clock_timestamp();
  v_fact_count integer;
  v_deleted_count integer;
  v_remaining_count integer;
  v_already_rolled_back boolean;
begin
  if current_user <> 'service_role' then
    raise exception 'Legacy History rollback requires the trusted service-role boundary.' using errcode = '42501';
  end if;
  if p_user_id is null or p_operation_id is null then
    raise exception 'Rollback user and operation identities are required.' using errcode = '22023';
  end if;
  if p_expected_fact_count is null or p_expected_fact_count < 0 then
    raise exception 'Rollback expected fact count is required.' using errcode = '22023';
  end if;
  if nullif(trim(p_confirm_source_fingerprint), '') is null then
    raise exception 'Rollback source fingerprint confirmation is required.' using errcode = '22023';
  end if;
  if p_confirm_migration_version is distinct from 'legacy-history-promotion-v1' then
    raise exception 'Rollback migration version confirmation is invalid.' using errcode = '22023';
  end if;

  select * into v_operation
  from public.adhdice_task_migration_operations
  where user_id = p_user_id and id = p_operation_id
  for update;
  if not found then
    raise exception 'Selected migration operation was not found for the expected user.' using errcode = '42501';
  end if;
  if v_operation.operation_kind is distinct from 'backfill'
     or v_operation.migration_version is distinct from 'legacy-history-promotion-v1'
     or v_operation.schema_contract_version is distinct from 'task-state-schema-v1'
     or v_operation.user_id is distinct from p_user_id then
    raise exception 'Selected operation is outside the legacy History promotion contract.' using errcode = '42501';
  end if;
  if v_operation.input_fingerprint is distinct from p_confirm_source_fingerprint then
    raise exception 'Rollback source fingerprint confirmation does not match the stored operation fingerprint.' using errcode = '40001';
  end if;

  v_already_rolled_back := v_operation.state = 'failed_retryable'
    and v_operation.error_code = 'ROLLBACK_COMPLETED'
    and coalesce((v_operation.result_references->>'rollback_completed')::boolean, false);
  if v_operation.state is distinct from 'committed' and not v_already_rolled_back then
    raise exception 'Only a committed legacy History promotion may be rolled back.' using errcode = '55000';
  end if;

  select count(*)::integer into v_fact_count
  from public.adhdice_task_history_facts
  where user_id = p_user_id and migration_operation_id = p_operation_id;
  if v_fact_count <> p_expected_fact_count then
    raise exception 'Rollback fact count changed: expected %, found %.', p_expected_fact_count, v_fact_count using errcode = '40001';
  end if;
  if v_already_rolled_back and v_fact_count <> 0 then
    raise exception 'Rollback-completed operation has remaining targeted facts.' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.adhdice_task_history_facts fact
    where fact.user_id = p_user_id
      and fact.migration_operation_id = p_operation_id
      and (
        fact.migration_operation_id is distinct from p_operation_id
        or fact.provenance_kind is distinct from 'migration_reconstruction'
        or fact.source is distinct from 'legacy_history_promotion_v1'
        or fact.source_legacy_history_id is null
        or fact.command_id is not null
        or fact.actor_kind is distinct from 'migration'
        or fact.actor_id is not null
        or fact.occurrence_id is not null
      )
  ) then
    raise exception 'Rollback ownership validation failed; no facts were deleted.' using errcode = '42501';
  end if;
  if exists (
    select fact.source_legacy_history_id
    from public.adhdice_task_history_facts fact
    where fact.user_id = p_user_id and fact.migration_operation_id = p_operation_id
    group by fact.source_legacy_history_id
    having count(*) > 1
  ) then
    raise exception 'Rollback found duplicate source legacy links; no facts were deleted.' using errcode = '42501';
  end if;

  if not v_already_rolled_back then
    delete from public.adhdice_task_history_facts fact
    where fact.user_id = p_user_id
      and fact.migration_operation_id = p_operation_id
      and fact.provenance_kind = 'migration_reconstruction'
      and fact.source = 'legacy_history_promotion_v1'
      and fact.source_legacy_history_id is not null
      and fact.command_id is null
      and fact.actor_kind = 'migration'
      and fact.actor_id is null
      and fact.occurrence_id is null;
    get diagnostics v_deleted_count = row_count;
    if v_deleted_count <> v_fact_count then
      raise exception 'Rollback deleted % of % expected facts; transaction aborted.', v_deleted_count, v_fact_count using errcode = '40001';
    end if;
    select count(*)::integer into v_remaining_count
    from public.adhdice_task_history_facts
    where user_id = p_user_id and migration_operation_id = p_operation_id;
    if v_remaining_count <> 0 then
      raise exception 'Rollback postflight found remaining targeted facts.' using errcode = '55000';
    end if;
    update public.adhdice_task_migration_operations
    set state = 'failed_retryable',
        result_fingerprint = v_operation.input_fingerprint,
        result_references = coalesce(v_operation.result_references, '{}'::jsonb) || jsonb_build_object(
          'rollback_completed', true,
          'rolled_back_fact_count', v_deleted_count,
          'rollback_timestamp', v_now,
          'original_source_fingerprint', v_operation.input_fingerprint,
          'reward_writes', 0,
          'task_state_writes', 0
        ),
        error_code = 'ROLLBACK_COMPLETED',
        error_message = 'Legacy History promotion facts were rolled back by explicit recovery.',
        completed_at = v_now
    where user_id = p_user_id and id = p_operation_id;
  else
    v_deleted_count := 0;
    v_remaining_count := 0;
  end if;

  return jsonb_build_object(
    'operation_id', p_operation_id,
    'deleted_fact_count', v_deleted_count,
    'remaining_fact_count', v_remaining_count,
    'operation_state', 'failed_retryable',
    'rollback_completed', true,
    'source_fingerprint', v_operation.input_fingerprint,
    'reward_writes', 0,
    'task_state_writes', 0
  );
end;
$function$;

revoke all on function public.adhdice_rollback_legacy_history_promotion(uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.adhdice_rollback_legacy_history_promotion(uuid, uuid, integer, text, text) to service_role;
