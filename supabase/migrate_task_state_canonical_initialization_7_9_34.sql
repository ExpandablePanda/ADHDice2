-- ADHDice 7.9.34 forward-only initialization of active canonical Task State.
-- SOURCE ONLY: do not apply without the reviewed preview and explicit
-- production authorization.  This migration does not write History,
-- occurrences, Calendar overrides, or rewards.
--
-- The candidate set is dynamic and literal: active rows are selected by
-- canonicalization_status = legacy_uninitialized at execution time.  Current
-- Task schedule fields are normalized with the same prospective-only rules as
-- canonical Task creation; no historical workflow, occurrence, or recurrence
-- reconstruction is performed.

begin;

create temporary table adhdice_7_9_34_candidates on commit drop as
with raw_candidates as (
  select
    task.user_id,
    task.id as task_id,
    to_jsonb(task) as task_snapshot,
    task.parent_task_id,
    task.due_on,
    task.due_time,
    task.repeat_frequency::text as raw_repeat_frequency,
    task.repeat_interval,
    task.repeat_days_of_week,
    task.repeat_day_of_month,
    coalesce(task.repeat_monthly_mode::text, 'day_of_month') as raw_repeat_monthly_mode,
    task.repeat_monthly_ordinal::text as raw_repeat_monthly_ordinal,
    task.repeat_monthly_weekday as raw_repeat_monthly_weekday,
    task.revision as source_task_revision,
    profile.timezone,
    profile.day_start_time,
    profile.settings_revision,
    case
      when task.parent_task_id is null then 'parent'
      when parent.id is null then null
      when parent.parent_task_id is null then 'step'
      else 'substep'
    end as entity_kind,
    case
      when task.repeat_frequency::text = 'none' and task.due_on is null then 'unscheduled'
      when task.repeat_frequency::text = 'none' and task.due_on is not null then 'one_time'
      when task.repeat_frequency::text in ('daily', 'custom', 'daily_until_complete')
        and task.repeat_interval is not null and task.repeat_interval >= 1 then 'rolling'
      when task.repeat_frequency::text = 'weekly'
        and task.repeat_interval is not null and task.repeat_interval >= 1
        and coalesce(cardinality(task.repeat_days_of_week), 0) > 0
        and coalesce(task.repeat_days_of_week, '{}'::smallint[]) <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
        and (select count(*) = count(distinct weekday) from unnest(coalesce(task.repeat_days_of_week, '{}'::smallint[])) weekday)
        then 'fixed'
      when task.repeat_frequency::text = 'weekly'
        and task.repeat_interval is not null and task.repeat_interval >= 1
        and coalesce(cardinality(task.repeat_days_of_week), 0) = 0
        and task.due_on is not null then 'fixed'
      when task.repeat_frequency::text = 'monthly'
        and task.repeat_interval is not null and task.repeat_interval >= 1
        and coalesce(task.repeat_monthly_mode::text, 'day_of_month') = 'day_of_month'
        and (task.repeat_day_of_month between 1 and 31 or (task.repeat_day_of_month is null and task.due_on is not null))
        and task.repeat_monthly_ordinal is null and task.repeat_monthly_weekday is null then 'fixed'
      when task.repeat_frequency::text = 'monthly'
        and task.repeat_interval is not null and task.repeat_interval >= 1
        and task.repeat_monthly_mode::text = 'ordinal_weekday'
        and task.repeat_monthly_ordinal::text in ('first', 'second', 'third', 'fourth', 'last')
        and task.repeat_monthly_weekday between 0 and 6
        and task.repeat_day_of_month is null then 'fixed'
      else 'ambiguous'
    end as schedule_model
  from public.adhdice_clean_tasks task
  left join public.adhdice_clean_tasks parent
    on parent.user_id = task.user_id and parent.id = task.parent_task_id
  left join public.adhdice_user_profiles profile on profile.user_id = task.user_id
  where task.canonicalization_status = 'legacy_uninitialized'
    and task.status::text not in ('complete', 'archived', 'trashed')
), normalized as (
  select
    candidate.*,
    case when candidate.schedule_model in ('unscheduled', 'one_time') then 'none' else candidate.raw_repeat_frequency end as repeat_frequency,
    case when candidate.schedule_model in ('unscheduled', 'one_time') then 1 else candidate.repeat_interval end as repeat_interval_normalized,
    case
      when candidate.raw_repeat_frequency = 'weekly' and coalesce(cardinality(candidate.repeat_days_of_week), 0) = 0 then array[extract(dow from candidate.due_on)::smallint]
      when candidate.schedule_model = 'fixed' and candidate.raw_repeat_frequency = 'weekly' then candidate.repeat_days_of_week
      else '{}'::smallint[]
    end as repeat_days_of_week_normalized,
    case
      when candidate.raw_repeat_frequency = 'monthly' and candidate.raw_repeat_monthly_mode = 'day_of_month' and candidate.repeat_day_of_month is null then extract(day from candidate.due_on)::integer
      when candidate.raw_repeat_frequency = 'monthly' and candidate.raw_repeat_monthly_mode = 'day_of_month' then candidate.repeat_day_of_month
      else null
    end as repeat_day_of_month_normalized,
    case when candidate.raw_repeat_frequency = 'monthly' then candidate.raw_repeat_monthly_mode else 'day_of_month' end as repeat_monthly_mode,
    case when candidate.raw_repeat_frequency = 'monthly' and candidate.raw_repeat_monthly_mode = 'ordinal_weekday' then candidate.raw_repeat_monthly_ordinal else null end as repeat_monthly_ordinal,
    case when candidate.raw_repeat_frequency = 'monthly' and candidate.raw_repeat_monthly_mode = 'ordinal_weekday' then candidate.raw_repeat_monthly_weekday else null end as repeat_monthly_weekday,
    case when candidate.schedule_model = 'one_time' then candidate.due_on else null end as one_time_due_on,
    case when candidate.schedule_model in ('rolling', 'fixed') then candidate.due_on else null end as anchor_date
  from raw_candidates candidate
), eligible as (
  select normalized.*,
    md5((task_snapshot::text || ':' || coalesce(timezone, '') || ':' || coalesce(day_start_time::text, '') || ':' || coalesce(settings_revision::text, '') || ':' || current_date::text)::text) as input_fingerprint
  from normalized
  where entity_kind is not null
    and timezone is not null and char_length(trim(timezone)) > 0
    and day_start_time is not null
    and settings_revision is not null and settings_revision >= 1
    and schedule_model <> 'ambiguous'
)
select * from eligible;

do $migration$
declare
  v_candidate record;
  v_task public.adhdice_clean_tasks%rowtype;
  v_after_task public.adhdice_clean_tasks%rowtype;
  v_operation_id uuid;
  v_operation_state text;
  v_operation_input text;
  v_boundary_id uuid;
  v_now timestamptz := clock_timestamp();
  v_operation_identity text;
begin
  if exists (
    select 1
    from public.adhdice_clean_tasks task
    left join public.adhdice_clean_tasks parent on parent.user_id = task.user_id and parent.id = task.parent_task_id
    left join public.adhdice_user_profiles profile on profile.user_id = task.user_id
    where task.canonicalization_status = 'legacy_uninitialized'
      and task.status::text not in ('complete', 'archived', 'trashed')
      and (
        parent.id is null and task.parent_task_id is not null
        or profile.user_id is null
        or profile.timezone is null or char_length(trim(profile.timezone)) = 0
        or profile.day_start_time is null or profile.settings_revision is null or profile.settings_revision < 1
        or exists (
          select 1 from public.adhdice_task_schedule_boundaries boundary
          where boundary.user_id = task.user_id and boundary.entity_id = task.id
        )
        or not exists (select 1 from adhdice_7_9_34_candidates candidate where candidate.user_id = task.user_id and candidate.task_id = task.id)
      )
  ) then
    raise exception '7.9.34 canonical initialization found an unsupported active legacy_uninitialized Task.' using errcode = '55000';
  end if;

  for v_candidate in select * from adhdice_7_9_34_candidates order by user_id, task_id loop
    perform pg_advisory_xact_lock(hashtextextended(v_candidate.user_id::text || ':' || v_candidate.task_id::text || ':canonical-init-7.9.34', 0));
    select * into v_task
    from public.adhdice_clean_tasks
    where user_id = v_candidate.user_id and id = v_candidate.task_id
    for update;
    if not found then
      raise exception '7.9.34 candidate Task disappeared before initialization.' using errcode = '40001';
    end if;
    if v_task.canonicalization_status <> 'legacy_uninitialized'
       or v_task.status::text in ('complete', 'archived', 'trashed')
       or to_jsonb(v_task) is distinct from v_candidate.task_snapshot then
      raise exception '7.9.34 candidate Task changed after preview; rerun the preview.' using errcode = '40001';
    end if;

    v_operation_identity := 'legacy-uninitialized-task-7.9.34:' || v_candidate.task_id::text;
    select id, state, input_fingerprint into v_operation_id, v_operation_state, v_operation_input
    from public.adhdice_task_migration_operations
    where user_id = v_candidate.user_id and operation_identity = v_operation_identity
    for update;
    if found then
      if v_operation_input is distinct from v_candidate.input_fingerprint then
        raise exception '7.9.34 operation identity was reused with a different Task snapshot.' using errcode = '40001';
      end if;
      if v_operation_state = 'committed' then
        raise exception '7.9.34 committed operation still has a legacy_uninitialized Task.' using errcode = '55000';
      end if;
      if v_operation_state = 'failed_permanent' then
        raise exception '7.9.34 Task operation is permanently failed.' using errcode = '55000';
      end if;
      update public.adhdice_task_migration_operations
      set state = 'started', error_code = null, error_message = null, result_fingerprint = null,
          result_references = '{}'::jsonb, completed_at = null
      where user_id = v_candidate.user_id and id = v_operation_id;
    else
      insert into public.adhdice_task_migration_operations (
        user_id, entity_id, operation_kind, operation_identity, input_fingerprint,
        state, result_references, migration_version, classifier_version, schema_contract_version
      ) values (
        v_candidate.user_id, v_candidate.task_id, 'backfill', v_operation_identity,
        v_candidate.input_fingerprint, 'started', '{}'::jsonb,
        'task-state-initialization-7.9.34', 'current-task-schedule-v1', 'task-state-schema-v1'
      ) returning id into v_operation_id;
    end if;

    update public.adhdice_clean_tasks
    set canonicalization_status = 'canonical_proven',
        entity_kind = v_candidate.entity_kind,
        terminal_state = 'active',
        container_state = 'active',
        prior_container_state = null,
        prior_container_state_status = 'not_applicable',
        terminal_completed_at = null,
        container_trashed_at = null,
        workflow_state = 'none',
        workflow_started_at = null,
        workflow_logical_date = null,
        workflow_occurrence_id = null,
        workflow_command_id = null,
        workflow_revision = 1,
        canonical_revision = 1,
        canonical_created_at = v_now,
        canonical_updated_at = v_now,
        projection_source_canonical_revision = null,
        projection_source_fingerprint = null,
        projection_version = null
    where user_id = v_candidate.user_id and id = v_candidate.task_id
    returning * into v_after_task;

    if (to_jsonb(v_after_task) - array[
      'canonicalization_status', 'entity_kind', 'terminal_state', 'container_state',
      'prior_container_state', 'prior_container_state_status', 'terminal_completed_at',
      'container_trashed_at', 'workflow_state', 'workflow_started_at', 'workflow_logical_date',
      'workflow_occurrence_id', 'workflow_command_id', 'workflow_revision', 'canonical_revision',
      'canonical_created_at', 'canonical_updated_at', 'projection_source_canonical_revision',
      'projection_source_fingerprint', 'projection_version'
    ]::text[]) is distinct from (v_candidate.task_snapshot - array[
      'canonicalization_status', 'entity_kind', 'terminal_state', 'container_state',
      'prior_container_state', 'prior_container_state_status', 'terminal_completed_at',
      'container_trashed_at', 'workflow_state', 'workflow_started_at', 'workflow_logical_date',
      'workflow_occurrence_id', 'workflow_command_id', 'workflow_revision', 'canonical_revision',
      'canonical_created_at', 'canonical_updated_at', 'projection_source_canonical_revision',
      'projection_source_fingerprint', 'projection_version'
    ]::text[]) then
      raise exception '7.9.34 canonicalization altered non-canonical Task fields.' using errcode = '55000';
    end if;

    insert into public.adhdice_task_schedule_boundaries (
      user_id, entity_id, entity_kind, effective_from_logical_date, boundary_sequence, boundary_type,
      schedule_model, repeat_frequency, repeat_interval, repeat_days_of_week, repeat_day_of_month,
      repeat_monthly_mode, repeat_monthly_ordinal, repeat_monthly_weekday, one_time_due_on, due_time,
      anchor_date, anchor_kind, anchor_confidence, historical_scope_known, prospective_only,
      prior_boundary_id, affected_occurrence_id, logical_day_settings_revision, timezone, day_start_time,
      actor_kind, actor_id, source, command_id, idempotence_identity, migration_operation_id,
      migration_version, classifier_version, schema_contract_version, source_task_revision, revision,
      created_at, updated_at
    ) values (
      v_candidate.user_id, v_candidate.task_id, v_candidate.entity_kind, current_date, 1, 'initial',
      v_candidate.schedule_model, v_candidate.repeat_frequency, v_candidate.repeat_interval_normalized,
      v_candidate.repeat_days_of_week_normalized, v_candidate.repeat_day_of_month_normalized,
      v_candidate.repeat_monthly_mode, v_candidate.repeat_monthly_ordinal, v_candidate.repeat_monthly_weekday,
      v_candidate.one_time_due_on, v_candidate.due_time, v_candidate.anchor_date,
      case when v_candidate.anchor_date is null then 'unknown' else 'migration_prospective' end,
      case when v_candidate.anchor_date is null then 'unavailable' else 'high_confidence' end,
      false, true, null, null, v_candidate.settings_revision, v_candidate.timezone, v_candidate.day_start_time,
      'migration', null, 'task_state_canonical_initialization_7_9_34', null, v_operation_identity,
      v_operation_id, 'task-state-initialization-7.9.34', 'current-task-schedule-v1', 'task-state-schema-v1',
      v_candidate.source_task_revision, 1, v_now, v_now
    ) returning id into v_boundary_id;

    update public.adhdice_task_migration_operations
    set state = 'committed', result_fingerprint = v_candidate.input_fingerprint,
        result_references = jsonb_build_object(
          'boundary_id', v_boundary_id,
          'task_source_fingerprint', md5(((v_candidate.task_snapshot - array[
            'canonicalization_status', 'entity_kind', 'terminal_state', 'container_state',
            'prior_container_state', 'prior_container_state_status', 'terminal_completed_at',
            'container_trashed_at', 'workflow_state', 'workflow_started_at', 'workflow_logical_date',
            'workflow_occurrence_id', 'workflow_command_id', 'workflow_revision', 'canonical_revision',
            'canonical_created_at', 'canonical_updated_at', 'projection_source_canonical_revision',
            'projection_source_fingerprint', 'projection_version'
          ]::text[]))::text),
          'history_rows_created', 0,
          'occurrence_rows_created', 0,
          'calendar_override_rows_created', 0,
          'reward_rows_created', 0,
          'workflow_state', 'none'
        ),
        completed_at = v_now
    where user_id = v_candidate.user_id and id = v_operation_id;
  end loop;
end;
$migration$;

commit;
