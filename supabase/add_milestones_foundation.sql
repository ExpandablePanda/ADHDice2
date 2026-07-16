begin;

create table if not exists public.adhdice_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.adhdice_clean_tasks(id) on delete set null,
  task_title_snapshot text not null check (char_length(trim(task_title_snapshot)) > 0),
  revision bigint not null default 0 check (revision >= 0),
  status text not null check (status in ('active', 'completed', 'abandoned')),
  task_trashed_at timestamptz,
  last_restored_at timestamptz,
  rules_version text not null check (char_length(trim(rules_version)) > 0),
  questions_version text not null check (char_length(trim(questions_version)) > 0),
  answers_snapshot jsonb not null check (jsonb_typeof(answers_snapshot) = 'object'),
  recommendation_snapshot jsonb not null check (jsonb_typeof(recommendation_snapshot) = 'object'),
  recommended_tier text not null check (recommended_tier in ('bronze', 'silver', 'gold', 'platinum')),
  recommended_target_date date not null,
  allowed_target_date_min date not null,
  allowed_target_date_max date not null,
  deadline_kind text not null check (deadline_kind in ('none', 'preferred', 'firm')),
  external_deadline date,
  feasibility_warning text,
  rules_explanation text not null check (char_length(trim(rules_explanation)) > 0),
  initial_locked_tier text not null check (initial_locked_tier in ('bronze', 'silver', 'gold', 'platinum')),
  initial_locked_target_date date not null,
  initial_aura_deadline date not null,
  current_tier text not null check (current_tier in ('bronze', 'silver', 'gold', 'platinum')),
  current_target_date date not null,
  current_aura_deadline date not null,
  tier_raise_explanation text,
  setup_correction_used boolean not null default false,
  setup_corrected_at timestamptz,
  completion_timezone text not null check (char_length(trim(completion_timezone)) > 0),
  completion_timing text check (completion_timing is null or completion_timing in ('on_time', 'grace_period', 'late')),
  completion_date_key date,
  pre_completion_task_snapshot jsonb check (pre_completion_task_snapshot is null or jsonb_typeof(pre_completion_task_snapshot) = 'object'),
  trophy_awarded_at timestamptz,
  trophy_revoked_at timestamptz,
  aura_kind text check (aura_kind is null or aura_kind in ('none', 'standard', 'diamond')),
  aura_awarded_at timestamptz,
  aura_revoked_at timestamptz,
  abandoned_at timestamptz,
  abandonment_reason text,
  promoted_at timestamptz not null default now(),
  locked_at timestamptz not null default now(),
  completed_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_milestones_date_range_check check (
    allowed_target_date_min <= recommended_target_date
    and recommended_target_date <= allowed_target_date_max
    and allowed_target_date_min <= current_target_date
    and current_target_date <= allowed_target_date_max
  ),
  constraint adhdice_milestones_aura_dates_check check (
    initial_aura_deadline = initial_locked_target_date + 3
    and current_aura_deadline = current_target_date + 3
  ),
  constraint adhdice_milestones_deadline_shape_check check (
    (deadline_kind = 'none' and external_deadline is null)
    or (deadline_kind in ('preferred', 'firm') and external_deadline is not null)
  ),
  constraint adhdice_milestones_firm_deadline_check check (
    deadline_kind <> 'firm'
    or (recommended_target_date = external_deadline and current_target_date = external_deadline)
  ),
  constraint adhdice_milestones_tier_raise_explanation_check check (
    case current_tier
      when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 when 'platinum' then 4
    end <= case recommended_tier
      when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 when 'platinum' then 4
    end
    or char_length(trim(coalesce(tier_raise_explanation, ''))) > 0
  ),
  constraint adhdice_milestones_diamond_check check (
    aura_kind <> 'diamond' or current_tier = 'platinum'
  ),
  constraint adhdice_milestones_correction_check check (
    setup_correction_used = (setup_corrected_at is not null)
  ),
  constraint adhdice_milestones_award_shape_check check (
    (trophy_revoked_at is null or trophy_awarded_at is not null)
    and (aura_revoked_at is null or aura_awarded_at is not null)
    and (
      (aura_kind is null and aura_awarded_at is null)
      or (aura_kind = 'none' and aura_awarded_at is null)
      or (aura_kind in ('standard', 'diamond') and aura_awarded_at is not null)
    )
  ),
  constraint adhdice_milestones_lifecycle_check check (
    (
      status = 'active'
      and abandoned_at is null
      and completed_at is null
      and completion_timing is null
      and completion_date_key is null
      and (trophy_awarded_at is null or trophy_revoked_at is not null)
      and (aura_awarded_at is null or aura_revoked_at is not null)
    )
    or (
      status = 'completed'
      and abandoned_at is null
      and completed_at is not null
      and completion_timing is not null
      and completion_date_key is not null
      and pre_completion_task_snapshot is not null
      and trophy_awarded_at is not null
      and trophy_revoked_at is null
      and aura_kind is not null
      and aura_revoked_at is null
    )
    or (
      status = 'abandoned'
      and abandoned_at is not null
      and completed_at is null
      and completion_timing is null
      and completion_date_key is null
      and (trophy_awarded_at is null or trophy_revoked_at is not null)
      and (aura_awarded_at is null or aura_revoked_at is not null)
    )
  )
);

create unique index if not exists adhdice_milestones_task_identity_unique
  on public.adhdice_milestones (task_id)
  where task_id is not null;

create index if not exists adhdice_milestones_user_status_target_idx
  on public.adhdice_milestones (user_id, status, current_target_date, created_at);

create table if not exists public.adhdice_milestone_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone_id uuid not null references public.adhdice_milestones(id) on delete restrict,
  task_id uuid references public.adhdice_clean_tasks(id) on delete set null,
  event_type text not null check (event_type in (
    'promoted',
    'recommendation_generated',
    'locked',
    'corrected',
    'tier_raised',
    'completed_on_time',
    'completed_grace_period',
    'completed_late',
    'award_granted',
    'award_revoked',
    'completion_reversed',
    'abandoned',
    'task_trashed',
    'task_restored',
    'task_deleted_permanently'
  )),
  previous_state jsonb check (previous_state is null or jsonb_typeof(previous_state) = 'object'),
  next_state jsonb check (next_state is null or jsonb_typeof(next_state) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, operation_id, event_type)
);

create index if not exists adhdice_milestone_events_user_occurred_idx
  on public.adhdice_milestone_events (user_id, occurred_at desc, created_at desc);
create index if not exists adhdice_milestone_events_milestone_occurred_idx
  on public.adhdice_milestone_events (milestone_id, occurred_at desc, created_at desc);

create table if not exists public.adhdice_milestone_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone_id uuid not null references public.adhdice_milestones(id) on delete cascade,
  kind text not null check (kind in ('seven_days', 'three_days', 'target_day', 'final_aura_day')),
  schedule_version integer not null default 1 check (schedule_version > 0),
  scheduled_date date not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'dismissed', 'canceled', 'skipped')),
  delivered_at timestamptz,
  dismissed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (milestone_id, kind, schedule_version),
  constraint adhdice_milestone_reminders_delivery_shape_check check (
    (status = 'pending' and delivered_at is null and dismissed_at is null and canceled_at is null)
    or (status = 'delivered' and delivered_at is not null and dismissed_at is null and canceled_at is null)
    or (status = 'dismissed' and delivered_at is not null and dismissed_at is not null and canceled_at is null)
    or (status = 'canceled' and canceled_at is not null)
    or (status = 'skipped' and delivered_at is null and dismissed_at is null and canceled_at is null)
  )
);

create index if not exists adhdice_milestone_reminders_user_schedule_idx
  on public.adhdice_milestone_reminders (user_id, status, scheduled_date, created_at);

alter table public.adhdice_milestones enable row level security;
alter table public.adhdice_milestone_events enable row level security;
alter table public.adhdice_milestone_reminders enable row level security;

drop policy if exists "Users can read their own Milestones" on public.adhdice_milestones;
create policy "Users can read their own Milestones"
  on public.adhdice_milestones for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own Milestone events" on public.adhdice_milestone_events;
create policy "Users can read their own Milestone events"
  on public.adhdice_milestone_events for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own Milestone reminders" on public.adhdice_milestone_reminders;
create policy "Users can read their own Milestone reminders"
  on public.adhdice_milestone_reminders for select
  using (auth.uid() = user_id);

revoke all on public.adhdice_milestones from anon, authenticated;
revoke all on public.adhdice_milestone_events from anon, authenticated;
revoke all on public.adhdice_milestone_reminders from anon, authenticated;
grant select on public.adhdice_milestones to authenticated;
grant select on public.adhdice_milestone_events to authenticated;
grant select on public.adhdice_milestone_reminders to authenticated;

drop trigger if exists adhdice_milestones_set_updated_at on public.adhdice_milestones;
create trigger adhdice_milestones_set_updated_at
  before update on public.adhdice_milestones
  for each row execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_milestone_reminders_set_updated_at on public.adhdice_milestone_reminders;
create trigger adhdice_milestone_reminders_set_updated_at
  before update on public.adhdice_milestone_reminders
  for each row execute function public.adhdice_clean_set_updated_at();

create or replace function public.adhdice_lock_milestone(
  p_task_id uuid,
  p_expected_task_revision integer,
  p_operation_id uuid,
  p_questions_version text,
  p_rules_version text,
  p_answers_snapshot jsonb,
  p_recommendation_snapshot jsonb,
  p_recommended_tier text,
  p_recommended_target_date date,
  p_allowed_target_date_min date,
  p_allowed_target_date_max date,
  p_selected_tier text,
  p_selected_target_date date,
  p_deadline_kind text,
  p_external_deadline date,
  p_feasibility_warning text,
  p_rules_explanation text,
  p_tier_raise_explanation text,
  p_completion_timezone text
)
returns public.adhdice_milestones
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_task public.adhdice_clean_tasks%rowtype;
  v_milestone public.adhdice_milestones%rowtype;
  v_local_date date;
  v_expected_extension_days integer;
  v_selected_tier_rank integer;
  v_recommended_tier_rank integer;
  v_event_metadata jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_task_id is null or p_operation_id is null then raise exception 'Task and operation IDs are required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));

  select milestone.* into v_milestone
  from public.adhdice_milestone_events event
  join public.adhdice_milestones milestone on milestone.id = event.milestone_id
  where event.user_id = v_user_id
    and event.operation_id = p_operation_id
    and event.event_type = 'locked'
  limit 1;
  if found then
    if v_milestone.task_id is distinct from p_task_id then
      raise exception 'Operation ID was already used for a different Milestone lock';
    end if;
    return v_milestone;
  end if;
  if exists (
    select 1 from public.adhdice_milestone_events
    where user_id = v_user_id and operation_id = p_operation_id
  ) then
    raise exception 'Operation ID was already used for another Milestone mutation';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_completion_timezone) then
    raise exception 'A valid IANA timezone is required';
  end if;
  v_local_date := (clock_timestamp() at time zone p_completion_timezone)::date;

  select * into v_task
  from public.adhdice_clean_tasks
  where id = p_task_id
  for update;
  if not found then raise exception 'Task not found'; end if;
  if v_task.user_id <> v_user_id then raise exception 'Task ownership mismatch'; end if;
  if p_expected_task_revision is null or v_task.revision <> p_expected_task_revision then
    raise exception 'Task revision conflict';
  end if;
  if v_task.parent_task_id is not null then raise exception 'Steps and Substeps must be detached before Milestone promotion'; end if;
  if v_task.repeat_frequency::text not in ('none', 'daily_until_complete') then raise exception 'Indefinitely recurring tasks are not eligible for Milestones'; end if;
  if v_task.status::text in ('complete', 'archived', 'trashed') then raise exception 'Closed tasks are not eligible for Milestones'; end if;
  if exists (select 1 from public.adhdice_milestones where task_id = p_task_id) then raise exception 'This task already has a Milestone identity'; end if;

  if p_questions_version is null or char_length(trim(p_questions_version)) = 0
    or p_rules_version is null or char_length(trim(p_rules_version)) = 0 then
    raise exception 'Questions and rules versions are required';
  end if;
  if p_answers_snapshot is null or jsonb_typeof(p_answers_snapshot) <> 'object'
    or p_recommendation_snapshot is null or jsonb_typeof(p_recommendation_snapshot) <> 'object' then
    raise exception 'Milestone snapshots must be JSON objects';
  end if;
  if p_recommended_tier not in ('bronze', 'silver', 'gold', 'platinum')
    or p_selected_tier not in ('bronze', 'silver', 'gold', 'platinum') then
    raise exception 'Invalid Milestone tier';
  end if;
  if p_deadline_kind not in ('none', 'preferred', 'firm') then raise exception 'Invalid deadline kind'; end if;
  if (p_deadline_kind = 'none' and p_external_deadline is not null)
    or (p_deadline_kind in ('preferred', 'firm') and p_external_deadline is null) then
    raise exception 'External deadline does not match deadline kind';
  end if;
  if p_recommended_target_date < v_local_date + 1 then
    raise exception 'The recommended Milestone target must be tomorrow or later';
  end if;
  v_expected_extension_days := least(
    90,
    greatest(7, ceil((p_recommended_target_date - v_local_date) * 0.25)::integer)
  );
  if p_allowed_target_date_min <> v_local_date + 1
    or p_allowed_target_date_max <> p_recommended_target_date + v_expected_extension_days
    or p_allowed_target_date_min > p_recommended_target_date
    or p_recommended_target_date > p_allowed_target_date_max
    or p_selected_target_date < p_allowed_target_date_min
    or p_selected_target_date > p_allowed_target_date_max then
    raise exception 'Milestone target dates are outside the authoritative allowed range';
  end if;
  if p_deadline_kind = 'firm'
    and (p_recommended_target_date <> p_external_deadline or p_selected_target_date <> p_external_deadline) then
    raise exception 'A firm external deadline must remain the Milestone target';
  end if;
  if char_length(trim(coalesce(p_rules_explanation, ''))) = 0 then raise exception 'Rules explanation is required'; end if;

  v_selected_tier_rank := case p_selected_tier when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 else 4 end;
  v_recommended_tier_rank := case p_recommended_tier when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 else 4 end;
  if v_selected_tier_rank > v_recommended_tier_rank
    and char_length(trim(coalesce(p_tier_raise_explanation, ''))) = 0 then
    raise exception 'Raising the recommended tier requires an explanation';
  end if;

  insert into public.adhdice_milestones (
    user_id, task_id, task_title_snapshot, status,
    rules_version, questions_version, answers_snapshot, recommendation_snapshot,
    recommended_tier, recommended_target_date, allowed_target_date_min, allowed_target_date_max,
    deadline_kind, external_deadline, feasibility_warning, rules_explanation,
    initial_locked_tier, initial_locked_target_date, initial_aura_deadline,
    current_tier, current_target_date, current_aura_deadline,
    tier_raise_explanation, completion_timezone
  ) values (
    v_user_id, v_task.id, v_task.title, 'active',
    trim(p_rules_version), trim(p_questions_version), p_answers_snapshot, p_recommendation_snapshot,
    p_recommended_tier, p_recommended_target_date, p_allowed_target_date_min, p_allowed_target_date_max,
    p_deadline_kind, p_external_deadline, nullif(trim(coalesce(p_feasibility_warning, '')), ''), trim(p_rules_explanation),
    p_selected_tier, p_selected_target_date, p_selected_target_date + 3,
    p_selected_tier, p_selected_target_date, p_selected_target_date + 3,
    case when v_selected_tier_rank > v_recommended_tier_rank then trim(p_tier_raise_explanation) else null end,
    p_completion_timezone
  ) returning * into v_milestone;

  v_event_metadata := jsonb_build_object(
    'questions_version', v_milestone.questions_version,
    'rules_version', v_milestone.rules_version,
    'task_revision', v_task.revision
  );

  insert into public.adhdice_milestone_events (
    operation_id, user_id, milestone_id, task_id, event_type, next_state, metadata
  ) values
    (p_operation_id, v_user_id, v_milestone.id, v_task.id, 'promoted', jsonb_build_object('task_id', v_task.id, 'task_title', v_task.title), v_event_metadata),
    (p_operation_id, v_user_id, v_milestone.id, v_task.id, 'recommendation_generated', p_recommendation_snapshot, v_event_metadata),
    (p_operation_id, v_user_id, v_milestone.id, v_task.id, 'locked', to_jsonb(v_milestone), v_event_metadata);

  if v_selected_tier_rank > v_recommended_tier_rank then
    insert into public.adhdice_milestone_events (
      operation_id, user_id, milestone_id, task_id, event_type, previous_state, next_state, metadata
    ) values (
      p_operation_id, v_user_id, v_milestone.id, v_task.id, 'tier_raised',
      jsonb_build_object('tier', p_recommended_tier),
      jsonb_build_object('tier', p_selected_tier),
      jsonb_build_object('explanation', trim(p_tier_raise_explanation), 'phase', 'lock')
    );
  end if;

  insert into public.adhdice_milestone_reminders (
    user_id, milestone_id, kind, schedule_version, scheduled_date, status
  )
  select
    v_user_id,
    v_milestone.id,
    schedule.kind,
    1,
    schedule.scheduled_date,
    case when schedule.scheduled_date < v_local_date then 'skipped' else 'pending' end
  from (values
    ('seven_days', p_selected_target_date - 7),
    ('three_days', p_selected_target_date - 3),
    ('target_day', p_selected_target_date),
    ('final_aura_day', p_selected_target_date + 3)
  ) as schedule(kind, scheduled_date);

  return v_milestone;
end;
$function$;

create or replace function public.adhdice_correct_milestone_setup(
  p_milestone_id uuid,
  p_expected_revision bigint,
  p_operation_id uuid,
  p_corrected_tier text,
  p_corrected_target_date date,
  p_tier_raise_explanation text
)
returns public.adhdice_milestones
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_before public.adhdice_milestones%rowtype;
  v_after public.adhdice_milestones%rowtype;
  v_current_tier_rank integer;
  v_corrected_tier_rank integer;
  v_recommended_tier_rank integer;
  v_schedule_version integer;
  v_local_date date;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_milestone_id is null or p_operation_id is null then raise exception 'Milestone and operation IDs are required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0));

  select milestone.* into v_after
  from public.adhdice_milestone_events event
  join public.adhdice_milestones milestone on milestone.id = event.milestone_id
  where event.user_id = v_user_id
    and event.operation_id = p_operation_id
    and event.event_type = 'corrected'
  limit 1;
  if found then
    if v_after.id <> p_milestone_id then
      raise exception 'Operation ID was already used for a different Milestone correction';
    end if;
    return v_after;
  end if;
  if exists (
    select 1 from public.adhdice_milestone_events
    where user_id = v_user_id and operation_id = p_operation_id
  ) then
    raise exception 'Operation ID was already used for another Milestone mutation';
  end if;

  select * into v_before
  from public.adhdice_milestones
  where id = p_milestone_id
  for update;
  if not found then raise exception 'Milestone not found'; end if;
  if v_before.user_id <> v_user_id then raise exception 'Milestone ownership mismatch'; end if;
  if p_expected_revision is null or v_before.revision <> p_expected_revision then raise exception 'Milestone revision conflict'; end if;
  if v_before.status <> 'active' then raise exception 'Only active Milestones can receive a setup correction'; end if;
  if v_before.setup_correction_used then raise exception 'The one setup correction has already been used'; end if;
  if clock_timestamp() > v_before.locked_at + interval '24 hours' then raise exception 'The setup correction window has expired'; end if;
  if p_corrected_tier not in ('bronze', 'silver', 'gold', 'platinum') then raise exception 'Invalid Milestone tier'; end if;
  if p_corrected_target_date < v_before.allowed_target_date_min
    or p_corrected_target_date > v_before.allowed_target_date_max then
    raise exception 'Corrected target is outside the locked adjustment range';
  end if;
  if v_before.deadline_kind = 'firm' and p_corrected_target_date <> v_before.external_deadline then
    raise exception 'A firm external deadline must remain the Milestone target';
  end if;
  if p_corrected_tier = v_before.current_tier
    and p_corrected_target_date = v_before.current_target_date then
    raise exception 'A setup correction must change the tier, target date, or both';
  end if;

  v_current_tier_rank := case v_before.current_tier when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 else 4 end;
  v_corrected_tier_rank := case p_corrected_tier when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 else 4 end;
  v_recommended_tier_rank := case v_before.recommended_tier when 'bronze' then 1 when 'silver' then 2 when 'gold' then 3 else 4 end;
  if v_corrected_tier_rank > v_recommended_tier_rank
    and char_length(trim(coalesce(p_tier_raise_explanation, ''))) = 0 then
    raise exception 'Raising the recommended tier requires an explanation';
  end if;

  update public.adhdice_milestones
  set
    revision = revision + 1,
    current_tier = p_corrected_tier,
    current_target_date = p_corrected_target_date,
    current_aura_deadline = p_corrected_target_date + 3,
    tier_raise_explanation = case
      when v_corrected_tier_rank > v_recommended_tier_rank then trim(p_tier_raise_explanation)
      else null
    end,
    setup_correction_used = true,
    setup_corrected_at = clock_timestamp()
  where id = v_before.id
  returning * into v_after;

  insert into public.adhdice_milestone_events (
    operation_id, user_id, milestone_id, task_id, event_type, previous_state, next_state,
    metadata, occurred_at
  ) values (
    p_operation_id, v_user_id, v_after.id, v_after.task_id, 'corrected',
    to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('correction_window_started_at', v_before.locked_at),
    v_after.setup_corrected_at
  );

  if v_corrected_tier_rank > v_current_tier_rank then
    insert into public.adhdice_milestone_events (
      operation_id, user_id, milestone_id, task_id, event_type, previous_state, next_state,
      metadata, occurred_at
    ) values (
      p_operation_id, v_user_id, v_after.id, v_after.task_id, 'tier_raised',
      jsonb_build_object('tier', v_before.current_tier),
      jsonb_build_object('tier', v_after.current_tier),
      jsonb_build_object('explanation', nullif(trim(coalesce(p_tier_raise_explanation, '')), ''), 'phase', 'correction'),
      v_after.setup_corrected_at
    );
  end if;

  select coalesce(max(schedule_version), 1) + 1 into v_schedule_version
  from public.adhdice_milestone_reminders
  where milestone_id = v_before.id;

  update public.adhdice_milestone_reminders
  set status = 'canceled', canceled_at = clock_timestamp()
  where milestone_id = v_before.id
    and schedule_version = v_schedule_version - 1
    and status = 'pending';

  v_local_date := (clock_timestamp() at time zone v_before.completion_timezone)::date;
  insert into public.adhdice_milestone_reminders (
    user_id, milestone_id, kind, schedule_version, scheduled_date, status
  )
  select
    v_user_id,
    v_before.id,
    schedule.kind,
    v_schedule_version,
    schedule.scheduled_date,
    case when schedule.scheduled_date < v_local_date then 'skipped' else 'pending' end
  from (values
    ('seven_days', p_corrected_target_date - 7),
    ('three_days', p_corrected_target_date - 3),
    ('target_day', p_corrected_target_date),
    ('final_aura_day', p_corrected_target_date + 3)
  ) as schedule(kind, scheduled_date);

  return v_after;
end;
$function$;

revoke all on function public.adhdice_lock_milestone(uuid, integer, uuid, text, text, jsonb, jsonb, text, date, date, date, text, date, text, date, text, text, text, text) from public, anon;
revoke all on function public.adhdice_correct_milestone_setup(uuid, bigint, uuid, text, date, text) from public, anon;
grant execute on function public.adhdice_lock_milestone(uuid, integer, uuid, text, text, jsonb, jsonb, text, date, date, date, text, date, text, date, text, text, text, text) to authenticated;
grant execute on function public.adhdice_correct_milestone_setup(uuid, bigint, uuid, text, date, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_milestones'
  ) then alter publication supabase_realtime add table public.adhdice_milestones; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_milestone_events'
  ) then alter publication supabase_realtime add table public.adhdice_milestone_events; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_milestone_reminders'
  ) then alter publication supabase_realtime add table public.adhdice_milestone_reminders; end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
