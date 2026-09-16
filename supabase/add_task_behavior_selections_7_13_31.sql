-- ADHDice 7.13.31: generalize effective-dated Custom assignment history into
-- complete Task behavior selections (TaskType + optional named Custom ruleset).
-- SOURCE ONLY: author for review/application; do not apply to live Supabase.
-- Apply after add_task_custom_ruleset_assignments_7_13_28.sql.

-- Preserve every existing row while making the old table name a compatibility
-- bridge only. The renamed table below is the sole historical authority.
do $$
declare
  v_legacy_table_exists boolean;
  v_selection_table_exists boolean;
begin
  select exists (
    select 1 from pg_class
     where oid = to_regclass('public.adhdice_task_custom_ruleset_assignments')
       and relkind in ('r', 'p')
  ) into v_legacy_table_exists;
  select exists (
    select 1 from pg_class
     where oid = to_regclass('public.adhdice_task_behavior_selections')
       and relkind in ('r', 'p')
  ) into v_selection_table_exists;
  if v_legacy_table_exists and v_selection_table_exists then
    raise exception 'Both legacy Custom assignment and generalized behavior-selection tables exist.';
  elsif v_legacy_table_exists then
    alter table public.adhdice_task_custom_ruleset_assignments
      rename to adhdice_task_behavior_selections;
  end if;
end;
$$;

create table if not exists public.adhdice_task_behavior_selections (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  effective_from_logical_date date not null,
  task_type text not null default 'custom',
  custom_ruleset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  unique (user_id, task_id, effective_from_logical_date),
  foreign key (user_id, task_id)
    references public.adhdice_clean_tasks(user_id, id)
    on delete cascade,
  foreign key (user_id, custom_ruleset_id)
    references public.adhdice_custom_behavior_rulesets(user_id, id)
    on delete restrict
);

-- Rows written by 7.13.28 were all Custom selections. Add the new field
-- without backfilling Tasks or rewriting any explicit History facts.
alter table public.adhdice_task_behavior_selections
  add column if not exists task_type text default 'custom';
update public.adhdice_task_behavior_selections
   set task_type = 'custom'
 where task_type is null;
alter table public.adhdice_task_behavior_selections
  alter column task_type set default 'custom',
  alter column task_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.adhdice_task_behavior_selections'::regclass
       and conname = 'adhdice_task_behavior_selections_task_type_check'
  ) then
    alter table public.adhdice_task_behavior_selections
      add constraint adhdice_task_behavior_selections_task_type_check
      check (task_type in ('task', 'pursuit', 'goal', 'custom'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.adhdice_task_behavior_selections'::regclass
       and conname = 'adhdice_task_behavior_selections_custom_ruleset_task_type_check'
  ) then
    alter table public.adhdice_task_behavior_selections
      add constraint adhdice_task_behavior_selections_custom_ruleset_task_type_check
      check (custom_ruleset_id is null or task_type = 'custom');
  end if;
end;
$$;

-- Give renamed legacy constraints and indexes durable generalized names when
-- they are present. Fresh installs already use the generalized names.
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.adhdice_task_behavior_selections'::regclass and conname = 'adhdice_task_custom_ruleset_assignments_pkey')
     and not exists (select 1 from pg_constraint where conrelid = 'public.adhdice_task_behavior_selections'::regclass and conname = 'adhdice_task_behavior_selections_pkey') then
    alter table public.adhdice_task_behavior_selections
      rename constraint adhdice_task_custom_ruleset_assignments_pkey to adhdice_task_behavior_selections_pkey;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.adhdice_task_behavior_selections'::regclass and conname = 'adhdice_task_custom_ruleset_assignments_task_date_key')
     and not exists (select 1 from pg_constraint where conrelid = 'public.adhdice_task_behavior_selections'::regclass and conname = 'adhdice_task_behavior_selections_task_date_key') then
    alter table public.adhdice_task_behavior_selections
      rename constraint adhdice_task_custom_ruleset_assignments_task_date_key to adhdice_task_behavior_selections_task_date_key;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.adhdice_task_behavior_selections'::regclass and conname = 'adhdice_task_custom_ruleset_assignments_task_owner_fkey')
     and not exists (select 1 from pg_constraint where conrelid = 'public.adhdice_task_behavior_selections'::regclass and conname = 'adhdice_task_behavior_selections_task_owner_fkey') then
    alter table public.adhdice_task_behavior_selections
      rename constraint adhdice_task_custom_ruleset_assignments_task_owner_fkey to adhdice_task_behavior_selections_task_owner_fkey;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.adhdice_task_behavior_selections'::regclass and conname = 'adhdice_task_custom_ruleset_assignments_ruleset_owner_fkey')
     and not exists (select 1 from pg_constraint where conrelid = 'public.adhdice_task_behavior_selections'::regclass and conname = 'adhdice_task_behavior_selections_ruleset_owner_fkey') then
    alter table public.adhdice_task_behavior_selections
      rename constraint adhdice_task_custom_ruleset_assignments_ruleset_owner_fkey to adhdice_task_behavior_selections_ruleset_owner_fkey;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.adhdice_task_custom_ruleset_assignments_task_date_idx') is not null
     and to_regclass('public.adhdice_task_behavior_selections_task_date_idx') is null then
    alter index public.adhdice_task_custom_ruleset_assignments_task_date_idx
      rename to adhdice_task_behavior_selections_task_date_idx;
  end if;
  if to_regclass('public.adhdice_task_custom_ruleset_assignments_ruleset_idx') is not null
     and to_regclass('public.adhdice_task_behavior_selections_ruleset_idx') is null then
    alter index public.adhdice_task_custom_ruleset_assignments_ruleset_idx
      rename to adhdice_task_behavior_selections_ruleset_idx;
  end if;
end;
$$;
create index if not exists adhdice_task_behavior_selections_task_date_idx
  on public.adhdice_task_behavior_selections(user_id, task_id, effective_from_logical_date desc);
create index if not exists adhdice_task_behavior_selections_ruleset_idx
  on public.adhdice_task_behavior_selections(user_id, custom_ruleset_id)
  where custom_ruleset_id is not null;

alter table public.adhdice_task_behavior_selections enable row level security;
revoke all on table public.adhdice_task_behavior_selections from anon, authenticated;
grant select on table public.adhdice_task_behavior_selections to authenticated;
drop policy if exists "Users can read their own Task Custom ruleset assignments" on public.adhdice_task_behavior_selections;
drop policy if exists "Users can read their own Task behavior selections" on public.adhdice_task_behavior_selections;
create policy "Users can read their own Task behavior selections"
  on public.adhdice_task_behavior_selections for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- The legacy canonical-creation RPC is retained by the 7.13.28 source. This
-- view is only a write-through compatibility adapter for its named-Custom
-- insert; no reader or new mutation path uses it as an authority.
create or replace view public.adhdice_task_custom_ruleset_assignments as
select id, user_id, task_id, effective_from_logical_date,
       custom_ruleset_id, created_at, updated_at
  from public.adhdice_task_behavior_selections
 where task_type = 'custom';
revoke all on table public.adhdice_task_custom_ruleset_assignments from public, anon, authenticated;

drop trigger if exists adhdice_validate_task_custom_ruleset_assignment on public.adhdice_task_behavior_selections;
drop trigger if exists adhdice_task_custom_ruleset_assignments_set_updated_at on public.adhdice_task_behavior_selections;
drop trigger if exists adhdice_validate_task_behavior_selection on public.adhdice_task_behavior_selections;
drop trigger if exists adhdice_task_behavior_selections_set_updated_at on public.adhdice_task_behavior_selections;
drop function if exists public.adhdice_validate_task_custom_ruleset_assignment();

create or replace function public.adhdice_validate_task_behavior_selection()
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
  ) then
    raise exception 'Behavior selection Task does not belong to the selection owner.'
      using errcode = '23503';
  end if;
  if new.task_type not in ('task', 'pursuit', 'goal', 'custom') then
    raise exception 'Behavior selection TaskType is invalid.' using errcode = '23514';
  end if;
  if new.custom_ruleset_id is not null and new.task_type <> 'custom' then
    raise exception 'Only Custom behavior selections may consume a named Custom ruleset.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;
revoke all on function public.adhdice_validate_task_behavior_selection() from public, anon, authenticated;
create trigger adhdice_validate_task_behavior_selection
  before insert or update of user_id, task_id, task_type, custom_ruleset_id
  on public.adhdice_task_behavior_selections
  for each row execute function public.adhdice_validate_task_behavior_selection();
create trigger adhdice_task_behavior_selections_set_updated_at
  before update on public.adhdice_task_behavior_selections
  for each row execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_guard_task_custom_ruleset_projection_update on public.adhdice_clean_tasks;
drop trigger if exists adhdice_guard_task_behavior_selection_projection_update on public.adhdice_clean_tasks;
drop function if exists public.adhdice_guard_task_custom_ruleset_projection_update();
create or replace function public.adhdice_guard_task_behavior_selection_projection_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if coalesce(
       current_setting('adhdice.task_behavior_selection_authority', true),
       current_setting('adhdice.custom_ruleset_assignment_authority', true)
     ) is distinct from '1'
     and ((tg_op = 'INSERT' and (new.task_type <> 'task' or new.custom_ruleset_id is not null))
       or (tg_op = 'UPDATE' and (new.task_type is distinct from old.task_type
         or new.custom_ruleset_id is distinct from old.custom_ruleset_id))) then
    raise exception 'Task behavior selection projection may only be assigned through canonical selection authority.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function public.adhdice_guard_task_behavior_selection_projection_update() from public, anon, authenticated;
create trigger adhdice_guard_task_behavior_selection_projection_update
  before insert or update of task_type, custom_ruleset_id
  on public.adhdice_clean_tasks
  for each row execute function public.adhdice_guard_task_behavior_selection_projection_update();

-- New Tasks always get an initial selection. Named Custom creation is still
-- completed by the existing canonical RPC through the compatibility view; the
-- trigger covers Task, Pursuit, Goal, and Custom Default without a mass backfill.
create or replace function public.adhdice_seed_task_behavior_selection()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_profile public.adhdice_user_profiles%rowtype;
  v_local_time time;
  v_effective_from date;
begin
  if new.task_type = 'custom' and new.custom_ruleset_id is not null then
    return new;
  end if;
  select * into v_profile
    from public.adhdice_user_profiles
   where user_id = new.user_id;
  if not found or v_profile.timezone is null or v_profile.day_start_time is null then
    raise exception 'Behavior selection requires the owner logical-day profile.' using errcode = '22023';
  end if;
  v_local_time := (new.created_at at time zone v_profile.timezone)::time;
  v_effective_from := (new.created_at at time zone v_profile.timezone)::date
    - case when v_local_time < v_profile.day_start_time::time then 1 else 0 end;
  insert into public.adhdice_task_behavior_selections (
    user_id, task_id, effective_from_logical_date, task_type, custom_ruleset_id
  ) values (
    new.user_id, new.id, v_effective_from, new.task_type, null
  ) on conflict (user_id, task_id, effective_from_logical_date) do nothing;
  return new;
end;
$function$;
revoke all on function public.adhdice_seed_task_behavior_selection() from public, anon, authenticated;
drop trigger if exists adhdice_seed_task_behavior_selection on public.adhdice_clean_tasks;
create trigger adhdice_seed_task_behavior_selection
  after insert on public.adhdice_clean_tasks
  for each row execute function public.adhdice_seed_task_behavior_selection();

-- One atomic owner-checked mutation writes the complete selection pair and the
-- current Task projection. Existing RPC name is retained below as a wrapper so
-- older browser bundles cannot write a second meaning during rollout.
create or replace function public.adhdice_update_task_behavior_selection(
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
  v_local_time time;
  v_current_logical_date date;
  v_creation_logical_date date;
  v_previous_task_type text;
  v_previous_custom_ruleset_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Task behavior selection requires an authenticated owner.' using errcode = '42501';
  end if;
  if p_task_id is null or p_effective_from_logical_date is null then
    raise exception 'Task and effective logical date are required.' using errcode = '22023';
  end if;
  if p_task_patch is null or jsonb_typeof(p_task_patch) <> 'object'
     or (not (p_task_patch ? 'task_type') and not (p_task_patch ? 'custom_ruleset_id')) then
    raise exception 'Behavior selection updates must include TaskType or named Custom ruleset.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_task_patch) as key_name(key)
    where key not in (
      'title', 'task_type', 'custom_ruleset_id', 'notes', 'priority', 'priority_level', 'energy',
      'is_urgent', 'is_important', 'estimated_minutes', 'actual_seconds', 'tags',
      'external_link_label', 'external_link_url', 'one_step_at_a_time', 'subtasks_auto_reset',
      'pinned_at', 'pin_order', 'sort_order'
    )
  ) then
    raise exception 'Task behavior selection updates may only contain Task metadata.' using errcode = '22023';
  end if;

  select * into v_task
    from public.adhdice_clean_tasks
   where user_id = auth.uid()
     and id = p_task_id
     and permanently_deleted_at is null
   for update;
  if not found then
    raise exception 'Task was not found for the authenticated owner.' using errcode = '23503';
  end if;
  if p_expected_task_revision is not null and v_task.revision <> p_expected_task_revision then
    raise exception 'Task changed before its behavior selection was saved.' using errcode = '40001';
  end if;

  select * into v_profile from public.adhdice_user_profiles where user_id = auth.uid();
  if not found or v_profile.timezone is null or v_profile.day_start_time is null then
    raise exception 'Canonical logical-day profile is unavailable.' using errcode = '22023';
  end if;
  v_local_time := (clock_timestamp() at time zone v_profile.timezone)::time;
  v_current_logical_date := (clock_timestamp() at time zone v_profile.timezone)::date
    - case when v_local_time < v_profile.day_start_time::time then 1 else 0 end;
  v_local_time := (v_task.created_at at time zone v_profile.timezone)::time;
  v_creation_logical_date := (v_task.created_at at time zone v_profile.timezone)::date
    - case when v_local_time < v_profile.day_start_time::time then 1 else 0 end;
  if p_effective_from_logical_date <> v_current_logical_date then
    raise exception 'Behavior selection changes must use the current logical date.' using errcode = '22023';
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
    select 1 from public.adhdice_custom_behavior_rulesets ruleset
     where ruleset.user_id = auth.uid()
       and ruleset.id = v_next.custom_ruleset_id
       and ruleset.task_type = 'custom'
  ) then
    raise exception 'The named Custom ruleset is not owned by the authenticated user.' using errcode = '23503';
  end if;

  v_previous_task_type := v_task.task_type;
  v_previous_custom_ruleset_id := case when v_task.task_type = 'custom' then v_task.custom_ruleset_id else null end;
  perform set_config('adhdice.task_behavior_selection_authority', '1', true);
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

  if not exists (
    select 1 from public.adhdice_task_behavior_selections selection
     where selection.user_id = auth.uid() and selection.task_id = p_task_id
  ) then
    insert into public.adhdice_task_behavior_selections (
      user_id, task_id, effective_from_logical_date, task_type, custom_ruleset_id
    ) values (
      auth.uid(), p_task_id, v_creation_logical_date, v_previous_task_type, v_previous_custom_ruleset_id
    );
  end if;
  insert into public.adhdice_task_behavior_selections (
    user_id, task_id, effective_from_logical_date, task_type, custom_ruleset_id
  ) values (
    auth.uid(), p_task_id, p_effective_from_logical_date, v_next.task_type, v_next.custom_ruleset_id
  ) on conflict (user_id, task_id, effective_from_logical_date)
  do update set task_type = excluded.task_type,
                custom_ruleset_id = excluded.custom_ruleset_id,
                updated_at = clock_timestamp();

  return v_task;
end;
$function$;

revoke all on function public.adhdice_update_task_behavior_selection(uuid, jsonb, date, integer) from public, anon, authenticated;
grant execute on function public.adhdice_update_task_behavior_selection(uuid, jsonb, date, integer) to authenticated;

create or replace function public.adhdice_update_task_custom_ruleset_assignment(
  p_task_id uuid,
  p_task_patch jsonb,
  p_effective_from_logical_date date,
  p_expected_task_revision integer default null
)
returns public.adhdice_clean_tasks
language sql
security definer
set search_path = public, pg_temp
as $function$
  select public.adhdice_update_task_behavior_selection(
    p_task_id, p_task_patch, p_effective_from_logical_date, p_expected_task_revision
  );
$function$;
revoke all on function public.adhdice_update_task_custom_ruleset_assignment(uuid, jsonb, date, integer) from public, anon, authenticated;
grant execute on function public.adhdice_update_task_custom_ruleset_assignment(uuid, jsonb, date, integer) to authenticated;
