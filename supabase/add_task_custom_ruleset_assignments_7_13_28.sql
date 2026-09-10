-- ADHDice 7.13.28: effective-dated Task -> Custom ruleset assignments.
-- SOURCE ONLY: author for review/application; do not apply to live Supabase automatically.
-- Apply after add_custom_behavior_rulesets_7_13_27.sql and the canonical Task
-- schema/creation sources. Existing Tasks are not backfilled or reassigned.

create unique index if not exists adhdice_clean_tasks_user_id_id_key
  on public.adhdice_clean_tasks(user_id, id);

create table if not exists public.adhdice_task_custom_ruleset_assignments (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  effective_from_logical_date date not null,
  custom_ruleset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  constraint adhdice_task_custom_ruleset_assignments_task_date_key
    unique (user_id, task_id, effective_from_logical_date),
  constraint adhdice_task_custom_ruleset_assignments_task_owner_fkey
    foreign key (user_id, task_id)
    references public.adhdice_clean_tasks(user_id, id)
    on delete cascade,
  constraint adhdice_task_custom_ruleset_assignments_ruleset_owner_fkey
    foreign key (user_id, custom_ruleset_id)
    references public.adhdice_custom_behavior_rulesets(user_id, id)
    on delete restrict
);

-- 7.13.27 used SET NULL on the Task projection FK.  That would silently
-- change the current and historical meaning of an assignment when a ruleset
-- is deleted, so replace it with restrictive integrity.
alter table if exists public.adhdice_clean_tasks
  drop constraint if exists adhdice_clean_tasks_custom_ruleset_owner_fkey;

alter table if exists public.adhdice_clean_tasks
  add constraint adhdice_clean_tasks_custom_ruleset_owner_fkey
  foreign key (user_id, custom_ruleset_id)
  references public.adhdice_custom_behavior_rulesets(user_id, id)
  on delete restrict;

create or replace function public.adhdice_validate_task_custom_ruleset_assignment()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if not exists (
    select 1
    from public.adhdice_clean_tasks task
    where task.user_id = new.user_id
      and task.id = new.task_id
      and task.task_type = 'custom'
  ) then
    raise exception 'Only Custom Tasks may consume Custom ruleset assignments.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function public.adhdice_validate_task_custom_ruleset_assignment() from public, anon, authenticated;

drop trigger if exists adhdice_validate_task_custom_ruleset_assignment
  on public.adhdice_task_custom_ruleset_assignments;
create trigger adhdice_validate_task_custom_ruleset_assignment
  before insert or update of user_id, task_id, custom_ruleset_id
  on public.adhdice_task_custom_ruleset_assignments
  for each row execute function public.adhdice_validate_task_custom_ruleset_assignment();

create or replace function public.adhdice_guard_task_custom_ruleset_projection_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if current_setting('adhdice.custom_ruleset_assignment_authority', true) is distinct from '1'
     and ((tg_op = 'INSERT' and new.custom_ruleset_id is not null)
       or (tg_op = 'UPDATE' and new.custom_ruleset_id is distinct from old.custom_ruleset_id)) then
    raise exception 'Task Custom ruleset projection may only be assigned through canonical assignment authority.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.adhdice_guard_task_custom_ruleset_projection_update() from public, anon, authenticated;

drop trigger if exists adhdice_guard_task_custom_ruleset_projection_update
  on public.adhdice_clean_tasks;
create trigger adhdice_guard_task_custom_ruleset_projection_update
  before insert or update of custom_ruleset_id
  on public.adhdice_clean_tasks
  for each row execute function public.adhdice_guard_task_custom_ruleset_projection_update();

create index if not exists adhdice_task_custom_ruleset_assignments_task_date_idx
  on public.adhdice_task_custom_ruleset_assignments(user_id, task_id, effective_from_logical_date desc);
create index if not exists adhdice_task_custom_ruleset_assignments_ruleset_idx
  on public.adhdice_task_custom_ruleset_assignments(user_id, custom_ruleset_id)
  where custom_ruleset_id is not null;

alter table public.adhdice_task_custom_ruleset_assignments enable row level security;
revoke all on table public.adhdice_task_custom_ruleset_assignments from anon, authenticated;
grant select on table public.adhdice_task_custom_ruleset_assignments to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_task_custom_ruleset_assignments'
      and policyname = 'Users can read their own Task Custom ruleset assignments'
  ) then
    create policy "Users can read their own Task Custom ruleset assignments"
      on public.adhdice_task_custom_ruleset_assignments for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end;
$$;

-- The only ordinary-client write path for an assignment is this atomic,
-- owner-checked function. It updates the current projection and the
-- effective-dated authority in one transaction, while retaining prior rows.
create or replace function public.adhdice_update_task_custom_ruleset_assignment(
  p_task_id uuid,
  p_task_patch jsonb,
  p_effective_from_logical_date date,
  p_expected_task_revision integer default null
)
returns public.adhdice_clean_tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_task public.adhdice_clean_tasks%rowtype;
  v_next public.adhdice_clean_tasks%rowtype;
  v_profile public.adhdice_user_profiles%rowtype;
  v_projection uuid;
  v_previous_custom_ruleset_id uuid;
  v_local_time time;
  v_current_logical_date date;
  v_creation_logical_date date;
begin
  if auth.uid() is null then
    raise exception 'Task Custom ruleset assignment requires an authenticated owner.'
      using errcode = '42501';
  end if;
  if p_task_id is null or p_effective_from_logical_date is null then
    raise exception 'Task and effective logical date are required.'
      using errcode = '22023';
  end if;
  if p_task_patch is null or jsonb_typeof(p_task_patch) <> 'object'
     or not (p_task_patch ? 'custom_ruleset_id') then
    raise exception 'Custom ruleset assignment updates must explicitly include custom_ruleset_id.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_task_patch) as key_name(key)
    where key not in (
      'title', 'task_type', 'custom_ruleset_id', 'notes', 'priority', 'priority_level', 'energy',
      'is_urgent', 'is_important', 'estimated_minutes', 'actual_seconds', 'tags',
      'external_link_label', 'external_link_url', 'one_step_at_a_time', 'subtasks_auto_reset',
      'pinned_at', 'pin_order', 'sort_order'
    )
  ) then
    raise exception 'Task Custom ruleset assignment updates may only contain Task metadata.'
      using errcode = '22023';
  end if;

  select * into v_task
  from public.adhdice_clean_tasks
  where user_id = auth.uid()
    and id = p_task_id
    and permanently_deleted_at is null
  for update;
  if not found then
    raise exception 'Task was not found for the authenticated owner.'
      using errcode = '23503';
  end if;
  if p_expected_task_revision is not null
     and v_task.revision <> p_expected_task_revision then
    raise exception 'Task changed before its Custom ruleset assignment was saved.'
      using errcode = '40001';
  end if;

  select * into v_profile
  from public.adhdice_user_profiles
  where user_id = auth.uid();
  if not found or v_profile.timezone is null or v_profile.day_start_time is null then
    raise exception 'Canonical logical-day profile is unavailable.'
      using errcode = '22023';
  end if;
  v_local_time := (clock_timestamp() at time zone v_profile.timezone)::time;
  v_current_logical_date := (clock_timestamp() at time zone v_profile.timezone)::date
    - case when v_local_time < v_profile.day_start_time::time then 1 else 0 end;
  v_local_time := (v_task.created_at at time zone v_profile.timezone)::time;
  v_creation_logical_date := (v_task.created_at at time zone v_profile.timezone)::date
    - case when v_local_time < v_profile.day_start_time::time then 1 else 0 end;
  if p_effective_from_logical_date <> v_current_logical_date then
    raise exception 'Custom ruleset assignment changes must use the current logical date.'
      using errcode = '22023';
  end if;

  v_next := jsonb_populate_record(v_task, p_task_patch);
  if nullif(btrim(v_next.title), '') is null then
    raise exception 'A non-empty Task title is required.' using errcode = '22023';
  end if;
  if v_next.task_type not in ('task', 'pursuit', 'goal', 'custom') then
    raise exception 'TaskType is invalid.' using errcode = '22023';
  end if;
  if v_next.task_type <> 'custom' and v_next.custom_ruleset_id is not null then
    raise exception 'Only Custom Tasks may consume a named Custom ruleset.' using errcode = '23514';
  end if;
  if v_next.custom_ruleset_id is not null and not exists (
    select 1
    from public.adhdice_custom_behavior_rulesets ruleset
    where ruleset.user_id = auth.uid()
      and ruleset.id = v_next.custom_ruleset_id
      and ruleset.task_type = 'custom'
  ) then
    raise exception 'The named Custom ruleset is not owned by the authenticated user.'
      using errcode = '23503';
  end if;

  v_previous_custom_ruleset_id := v_task.custom_ruleset_id;
  perform set_config('adhdice.custom_ruleset_assignment_authority', '1', true);
  update public.adhdice_clean_tasks
  set revision = v_task.revision + 1,
      title = btrim(v_next.title),
      task_type = v_next.task_type,
      custom_ruleset_id = v_next.custom_ruleset_id,
      notes = v_next.notes,
      priority = v_next.priority,
      priority_level = v_next.priority_level,
      energy = v_next.energy,
      is_urgent = v_next.is_urgent,
      is_important = v_next.is_important,
      estimated_minutes = v_next.estimated_minutes,
      actual_seconds = v_next.actual_seconds,
      tags = v_next.tags,
      external_link_label = v_next.external_link_label,
      external_link_url = v_next.external_link_url,
      one_step_at_a_time = v_next.one_step_at_a_time,
      subtasks_auto_reset = v_next.subtasks_auto_reset,
      pinned_at = v_next.pinned_at,
      pin_order = v_next.pin_order,
      sort_order = v_next.sort_order
  where user_id = auth.uid() and id = p_task_id
  returning * into v_task;

  if v_task.task_type = 'custom' then
    -- 7.13.27 named Custom Tasks have no assignment row to backfill. On the
    -- first post-migration assignment edit, preserve their prior projection
    -- as the historical baseline without rewriting rows during migration.
    if v_previous_custom_ruleset_id is not null and not exists (
      select 1
      from public.adhdice_task_custom_ruleset_assignments assignment
      where assignment.user_id = auth.uid() and assignment.task_id = p_task_id
    ) then
      insert into public.adhdice_task_custom_ruleset_assignments (
        user_id, task_id, effective_from_logical_date, custom_ruleset_id
      ) values (
        auth.uid(), p_task_id, v_creation_logical_date, v_previous_custom_ruleset_id
      );
    end if;
    insert into public.adhdice_task_custom_ruleset_assignments (
      user_id, task_id, effective_from_logical_date, custom_ruleset_id
    ) values (
      auth.uid(), p_task_id, p_effective_from_logical_date, v_next.custom_ruleset_id
    )
    on conflict (user_id, task_id, effective_from_logical_date)
    do update set custom_ruleset_id = excluded.custom_ruleset_id,
                  updated_at = clock_timestamp();
  end if;

  if v_task.task_type <> 'custom' then
    v_projection := null;
  else
    select assignment.custom_ruleset_id into v_projection
    from public.adhdice_task_custom_ruleset_assignments assignment
    where assignment.user_id = auth.uid()
      and assignment.task_id = p_task_id
      and assignment.effective_from_logical_date <= p_effective_from_logical_date
    order by assignment.effective_from_logical_date desc, assignment.id desc
    limit 1;
    if not found then
      select assignment.custom_ruleset_id into v_projection
      from public.adhdice_task_custom_ruleset_assignments assignment
      where assignment.user_id = auth.uid()
        and assignment.task_id = p_task_id
      order by assignment.effective_from_logical_date asc, assignment.id asc
      limit 1;
    end if;
  end if;

  if v_task.custom_ruleset_id is distinct from v_projection then
    update public.adhdice_clean_tasks
    set custom_ruleset_id = v_projection,
        revision = revision + 1
    where user_id = auth.uid() and id = p_task_id
    returning * into v_task;
  end if;
  return v_task;
end;
$function$;

revoke all on function public.adhdice_update_task_custom_ruleset_assignment(uuid, jsonb, date, integer) from public, anon, authenticated;
grant execute on function public.adhdice_update_task_custom_ruleset_assignment(uuid, jsonb, date, integer) to authenticated;

-- Replace the 7.13.27 canonical creation RPC so creation accepts only a
-- validated Custom assignment, persists the current projection, and creates
-- the Task's first assignment baseline at its creation logical date.
create or replace function public.adhdice_create_canonical_task(
  p_user_id uuid,
  p_plan jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_task_input public.adhdice_clean_tasks%rowtype;
  v_task public.adhdice_clean_tasks%rowtype;
  v_profile public.adhdice_user_profiles%rowtype;
  v_canonical jsonb;
  v_schedule jsonb;
  v_parent_task public.adhdice_clean_tasks%rowtype;
  v_boundary public.adhdice_task_schedule_boundaries%rowtype;
  v_now timestamptz := clock_timestamp();
  v_entity_kind text;
  v_terminal_state text;
  v_container_state text;
  v_prior_container_state text;
  v_prior_container_state_status text;
  v_workflow_state text;
  v_workflow_revision bigint;
  v_canonical_revision bigint;
  v_effective_from date;
  v_schedule_model text;
  v_repeat_frequency text;
  v_repeat_interval integer;
  v_repeat_days smallint[];
  v_repeat_day_of_month integer;
  v_repeat_monthly_mode text;
  v_repeat_monthly_ordinal text;
  v_repeat_monthly_weekday smallint;
  v_one_time_due_on date;
  v_due_time time;
  v_anchor_date date;
  v_anchor_kind text;
  v_anchor_confidence text;
  v_historical_scope_known boolean;
  v_prospective_only boolean;
  v_settings_revision bigint;
  v_timezone text;
  v_day_start_time time;
  v_source text;
begin
  if current_user <> 'service_role' then
    raise exception 'Canonical Task creation requires the trusted service-role boundary.' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Canonical Task creation owner is required.' using errcode = '22023';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'Canonical Task creation plan must be an object.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_plan) as key_name(key)
    where key not in ('task', 'canonical', 'schedule')
  ) then
    raise exception 'Canonical Task creation plan contains unsupported fields.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_plan->'task') <> 'object'
     or jsonb_typeof(p_plan->'canonical') <> 'object'
     or jsonb_typeof(p_plan->'schedule') <> 'object' then
    raise exception 'Canonical Task creation plan is incomplete.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_plan->'task') as key_name(key)
    where key not in (
      'parent_task_id', 'title', 'task_type', 'custom_ruleset_id', 'notes', 'status', 'priority', 'priority_level', 'energy',
      'is_urgent', 'is_important', 'due_on', 'active_status_logical_date', 'active_occurrence_due_on',
      'scheduled_on', 'due_time', 'estimated_minutes', 'actual_seconds', 'tags', 'external_link_label',
      'external_link_url', 'one_step_at_a_time', 'subtasks_auto_reset', 'repeat_frequency',
      'repeat_interval', 'repeat_days_of_week', 'repeat_day_of_month', 'repeat_monthly_mode',
      'repeat_monthly_ordinal', 'repeat_monthly_weekday', 'pinned_at', 'pin_order', 'sort_order',
      'completed_at', 'trashed_at'
    )
  ) then
    raise exception 'Canonical Task creation task input contains privileged or unsupported fields.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_plan->'canonical') as key_name(key)
    where key not in ('entity_kind', 'terminal_state', 'container_state', 'prior_container_state', 'prior_container_state_status', 'workflow_state', 'workflow_revision', 'canonical_revision')
  ) then
    raise exception 'Canonical Task creation canonical input contains unsupported fields.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_plan->'schedule') as key_name(key)
    where key not in ('effective_from_logical_date', 'schedule_model', 'repeat_frequency', 'repeat_interval', 'repeat_days_of_week', 'repeat_day_of_month', 'repeat_monthly_mode', 'repeat_monthly_ordinal', 'repeat_monthly_weekday', 'one_time_due_on', 'due_time', 'anchor_date', 'anchor_kind', 'anchor_confidence', 'historical_scope_known', 'prospective_only', 'logical_day_settings_revision', 'timezone', 'day_start_time', 'source')
  ) then
    raise exception 'Canonical Task creation schedule input contains unsupported fields.' using errcode = '22023';
  end if;

  select * into v_profile from public.adhdice_user_profiles where user_id = p_user_id;
  if not found then
    raise exception 'Canonical logical-day profile is unavailable.' using errcode = '22023';
  end if;
  v_task_input := jsonb_populate_record(null::public.adhdice_clean_tasks, p_plan->'task');
  if nullif(btrim(v_task_input.title), '') is null then
    raise exception 'A non-empty Task title is required.' using errcode = '22023';
  end if;
  if v_task_input.custom_ruleset_id is not null and coalesce(v_task_input.task_type, 'task') <> 'custom' then
    raise exception 'Only Custom Tasks may consume a named Custom ruleset.' using errcode = '23514';
  end if;
  if v_task_input.custom_ruleset_id is not null and not exists (
    select 1 from public.adhdice_custom_behavior_rulesets ruleset
    where ruleset.user_id = p_user_id and ruleset.id = v_task_input.custom_ruleset_id and ruleset.task_type = 'custom'
  ) then
    raise exception 'The named Custom ruleset is not owned by the Task owner.' using errcode = '23503';
  end if;
  if coalesce(v_task_input.status, 'pending'::public.adhdice_clean_task_status) not in ('pending', 'upcoming', 'not_due', 'archived') then
    raise exception 'This Task snapshot cannot be initialized without handled provenance.' using errcode = '22023';
  end if;
  if v_task_input.completed_at is not null or v_task_input.trashed_at is not null then
    raise exception 'Terminal or Trash timestamps require canonical provenance.' using errcode = '22023';
  end if;
  if v_task_input.active_status_logical_date is not null or v_task_input.active_occurrence_due_on is not null then
    raise exception 'Initial canonical Task status projections must be null.' using errcode = '22023';
  end if;

  v_canonical := p_plan->'canonical';
  v_entity_kind := v_canonical->>'entity_kind';
  v_terminal_state := v_canonical->>'terminal_state';
  v_container_state := v_canonical->>'container_state';
  v_prior_container_state := v_canonical->>'prior_container_state';
  v_prior_container_state_status := v_canonical->>'prior_container_state_status';
  v_workflow_state := v_canonical->>'workflow_state';
  v_workflow_revision := (v_canonical->>'workflow_revision')::bigint;
  v_canonical_revision := (v_canonical->>'canonical_revision')::bigint;
  if v_entity_kind not in ('parent', 'step', 'substep') or v_terminal_state <> 'active' or v_workflow_state <> 'none'
     or v_workflow_revision <> 1 or v_canonical_revision <> 1 or v_prior_container_state is not null
     or v_prior_container_state_status <> 'not_applicable' then
    raise exception 'Initial canonical Task state is invalid.' using errcode = '22023';
  end if;
  if v_container_state not in ('active', 'archived') then
    raise exception 'Initial canonical Task container state is invalid.' using errcode = '22023';
  end if;
  if (v_task_input.status = 'archived' and v_container_state <> 'archived')
     or (v_task_input.status is distinct from 'archived' and v_container_state <> 'active') then
    raise exception 'Initial canonical container state does not match the Task snapshot.' using errcode = '22023';
  end if;
  if v_task_input.parent_task_id is null then
    if v_entity_kind <> 'parent' then
      raise exception 'A root Task must use the parent canonical entity kind.' using errcode = '22023';
    end if;
  else
    select * into v_parent_task from public.adhdice_clean_tasks
    where user_id = p_user_id and id = v_task_input.parent_task_id;
    if not found then
      raise exception 'The Task parent was not found for this owner.' using errcode = '23503';
    end if;
    if (v_parent_task.parent_task_id is null and v_entity_kind <> 'step')
       or (v_parent_task.parent_task_id is not null and v_entity_kind <> 'substep') then
      raise exception 'The canonical Task entity kind does not match its parent relationship.' using errcode = '22023';
    end if;
  end if;

  v_schedule := p_plan->'schedule';
  if jsonb_typeof(v_schedule->'repeat_days_of_week') <> 'array' then
    raise exception 'Canonical Task repeat weekdays must be an array.' using errcode = '22023';
  end if;
  v_effective_from := (v_schedule->>'effective_from_logical_date')::date;
  v_schedule_model := v_schedule->>'schedule_model';
  v_repeat_frequency := v_schedule->>'repeat_frequency';
  v_repeat_interval := (v_schedule->>'repeat_interval')::integer;
  v_repeat_days := array(select value::smallint from jsonb_array_elements_text(v_schedule->'repeat_days_of_week') as item(value));
  v_repeat_day_of_month := nullif(v_schedule->>'repeat_day_of_month', '')::integer;
  v_repeat_monthly_mode := v_schedule->>'repeat_monthly_mode';
  v_repeat_monthly_ordinal := v_schedule->>'repeat_monthly_ordinal';
  v_repeat_monthly_weekday := nullif(v_schedule->>'repeat_monthly_weekday', '')::smallint;
  v_one_time_due_on := nullif(v_schedule->>'one_time_due_on', '')::date;
  v_due_time := nullif(v_schedule->>'due_time', '')::time;
  v_anchor_date := nullif(v_schedule->>'anchor_date', '')::date;
  v_anchor_kind := v_schedule->>'anchor_kind';
  v_anchor_confidence := v_schedule->>'anchor_confidence';
  v_historical_scope_known := (v_schedule->>'historical_scope_known')::boolean;
  v_prospective_only := (v_schedule->>'prospective_only')::boolean;
  v_settings_revision := (v_schedule->>'logical_day_settings_revision')::bigint;
  v_timezone := v_schedule->>'timezone';
  v_day_start_time := (v_schedule->>'day_start_time')::time;
  v_source := v_schedule->>'source';
  if v_schedule_model not in ('unscheduled', 'one_time', 'rolling', 'fixed')
     or v_repeat_frequency not in ('none', 'daily', 'weekly', 'monthly', 'custom', 'daily_until_complete')
     or v_repeat_interval < 1 or cardinality(v_repeat_days) > 7
     or not (v_repeat_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
     or v_repeat_monthly_mode not in ('day_of_month', 'ordinal_weekday')
     or (v_repeat_monthly_ordinal is not null and v_repeat_monthly_ordinal not in ('first', 'second', 'third', 'fourth', 'last'))
     or (v_repeat_monthly_weekday is not null and v_repeat_monthly_weekday not between 0 and 6)
     or v_anchor_kind not in ('user_selected', 'unknown') or v_anchor_confidence not in ('proven', 'unavailable')
     or v_source not in ('task_creation', 'task_import') then
    raise exception 'Canonical Task schedule is invalid.' using errcode = '22023';
  end if;
  if (v_schedule_model = 'unscheduled' and (v_repeat_frequency <> 'none' or v_one_time_due_on is not null or v_anchor_date is not null))
     or (v_schedule_model = 'one_time' and (v_repeat_frequency <> 'none' or v_one_time_due_on is null))
     or (v_schedule_model in ('rolling', 'fixed') and v_repeat_frequency = 'none') then
    raise exception 'Canonical Task schedule model does not match its repeat metadata.' using errcode = '22023';
  end if;
  if (v_anchor_confidence = 'proven' and v_anchor_date is null)
     or (v_anchor_confidence = 'unavailable' and v_anchor_date is not null)
     or (v_anchor_kind = 'unknown' and v_anchor_date is not null) then
    raise exception 'Canonical Task schedule anchor is invalid.' using errcode = '22023';
  end if;
  if v_historical_scope_known is distinct from false or v_prospective_only is distinct from true then
    raise exception 'New Task schedule provenance must be prospective and retain no invented historical scope.' using errcode = '22023';
  end if;
  if v_timezone is distinct from v_profile.timezone or v_day_start_time is distinct from v_profile.day_start_time::time
     or v_settings_revision is distinct from v_profile.settings_revision then
    raise exception 'Canonical logical-day settings do not match the owner profile.' using errcode = '22023';
  end if;

  perform set_config('adhdice.custom_ruleset_assignment_authority', '1', true);
  insert into public.adhdice_clean_tasks (
    user_id, parent_task_id, revision, title, task_type, custom_ruleset_id, notes, status, priority, priority_level, energy,
    is_urgent, is_important, due_on, active_status_logical_date, active_occurrence_due_on, scheduled_on, due_time,
    estimated_minutes, actual_seconds, tags, external_link_label, external_link_url, one_step_at_a_time, subtasks_auto_reset,
    repeat_frequency, repeat_interval, repeat_days_of_week, repeat_day_of_month, repeat_monthly_mode, repeat_monthly_ordinal,
    repeat_monthly_weekday, pinned_at, pin_order, sort_order, completed_at, trashed_at, canonicalization_status, entity_kind,
    terminal_state, container_state, prior_container_state, prior_container_state_status, terminal_completed_at,
    container_trashed_at, workflow_state, workflow_started_at, workflow_logical_date, workflow_occurrence_id, workflow_command_id,
    workflow_revision, canonical_revision, canonical_created_at, canonical_updated_at, projection_source_canonical_revision,
    projection_source_fingerprint, projection_version
  ) values (
    p_user_id, v_task_input.parent_task_id, 1, btrim(v_task_input.title), coalesce(v_task_input.task_type, 'task'), v_task_input.custom_ruleset_id,
    v_task_input.notes, coalesce(v_task_input.status, 'pending'::public.adhdice_clean_task_status),
    coalesce(v_task_input.priority, 'normal'::public.adhdice_clean_task_priority), coalesce(v_task_input.priority_level, 0),
    coalesce(v_task_input.energy, 'none'::public.adhdice_clean_task_energy), coalesce(v_task_input.is_urgent, false),
    coalesce(v_task_input.is_important, false), v_task_input.due_on, null, null, v_task_input.scheduled_on, v_task_input.due_time,
    v_task_input.estimated_minutes, coalesce(v_task_input.actual_seconds, 0), coalesce(v_task_input.tags, '{}'::text[]),
    v_task_input.external_link_label, v_task_input.external_link_url, coalesce(v_task_input.one_step_at_a_time, false),
    coalesce(v_task_input.subtasks_auto_reset, false), coalesce(v_task_input.repeat_frequency, 'none'::public.adhdice_clean_task_repeat_frequency),
    coalesce(v_task_input.repeat_interval, 1), coalesce(v_task_input.repeat_days_of_week, '{}'::smallint[]), v_task_input.repeat_day_of_month,
    coalesce(v_task_input.repeat_monthly_mode, 'day_of_month'::public.adhdice_clean_task_repeat_monthly_mode), v_task_input.repeat_monthly_ordinal,
    v_task_input.repeat_monthly_weekday, v_task_input.pinned_at, v_task_input.pin_order, coalesce(v_task_input.sort_order, 0), null, null,
    'canonical_runtime', v_entity_kind, v_terminal_state, v_container_state, null, v_prior_container_state_status, null, null,
    v_workflow_state, null, null, null, null, v_workflow_revision, v_canonical_revision, v_now, v_now, v_canonical_revision,
    'canonical-task-create-v1:' || md5(p_plan::text), 'task-state-create-v1'
  ) returning * into v_task;

  insert into public.adhdice_task_schedule_boundaries (
    user_id, entity_id, entity_kind, effective_from_logical_date, boundary_sequence, boundary_type, schedule_model,
    repeat_frequency, repeat_interval, repeat_days_of_week, repeat_day_of_month, repeat_monthly_mode, repeat_monthly_ordinal,
    repeat_monthly_weekday, one_time_due_on, due_time, anchor_date, anchor_kind, anchor_confidence, historical_scope_known,
    prospective_only, prior_boundary_id, affected_occurrence_id, logical_day_settings_revision, timezone, day_start_time,
    actor_kind, actor_id, source, command_id, idempotence_identity, migration_operation_id, migration_version, classifier_version,
    schema_contract_version, source_task_revision, revision, created_at, updated_at
  ) values (
    p_user_id, v_task.id, v_entity_kind, v_effective_from, 1, 'initial', v_schedule_model, v_repeat_frequency, v_repeat_interval,
    v_repeat_days, v_repeat_day_of_month, v_repeat_monthly_mode, v_repeat_monthly_ordinal, v_repeat_monthly_weekday,
    v_one_time_due_on, v_due_time, v_anchor_date, v_anchor_kind, v_anchor_confidence, v_historical_scope_known, v_prospective_only,
    null, null, v_settings_revision, v_timezone, v_day_start_time, 'user', p_user_id, v_source, null,
    'task-create:' || v_task.id::text, null, null, null, 'task-state-schema-v1', 1, 1, v_now, v_now
  ) returning * into v_boundary;

  if v_task.task_type = 'custom' and v_task.custom_ruleset_id is not null then
    insert into public.adhdice_task_custom_ruleset_assignments (
      user_id, task_id, effective_from_logical_date, custom_ruleset_id
    ) values (p_user_id, v_task.id, v_effective_from, v_task.custom_ruleset_id);
  end if;

  return jsonb_build_object('task', to_jsonb(v_task), 'canonical_schedule_boundary', to_jsonb(v_boundary));
end;
$function$;

revoke all on function public.adhdice_create_canonical_task(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adhdice_create_canonical_task(uuid, jsonb) to service_role;
