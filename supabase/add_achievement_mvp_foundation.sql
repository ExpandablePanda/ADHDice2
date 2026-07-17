-- ADHDice Achievements MVP foundation.
-- Catalog/runtime evaluation remains source-controlled and is not wired to live activity in this migration.
begin;

create table if not exists public.adhdice_achievement_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  activation_operation_id uuid not null,
  activated_at timestamptz not null,
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  rules_version text not null check (char_length(trim(rules_version)) > 0),
  launch_mastery_version text not null check (char_length(trim(launch_mastery_version)) > 0),
  timezone text not null check (char_length(trim(timezone)) > 0),
  logical_day_start time without time zone not null default time '06:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, activation_operation_id)
);

create table if not exists public.adhdice_achievement_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  source_kind text not null check (source_kind in ('task_history', 'focus_session', 'focus_runtime')),
  source_id text not null check (char_length(trim(source_id)) > 0),
  source_occurrence_key text not null check (char_length(trim(source_occurrence_key)) > 0),
  dedupe_key text not null check (char_length(trim(dedupe_key)) > 0),
  first_qualified_at timestamptz not null,
  logical_date date not null,
  week_key date not null,
  week_start_date date not null,
  week_end_date date not null,
  month_key text not null check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  month_start_date date not null,
  month_end_date date not null,
  timezone text not null check (char_length(trim(timezone)) > 0),
  logical_day_start time without time zone not null,
  entity_kind text not null check (entity_kind in ('parent_task', 'step', 'focus_session', 'focus_runtime')),
  entity_id uuid,
  root_parent_id uuid,
  title_snapshot text,
  outcome_snapshot text check (outcome_snapshot is null or outcome_snapshot in ('done', 'complete', 'did_my_best')),
  active_duration_seconds bigint check (active_duration_seconds is null or active_duration_seconds > 0),
  evaluator_version text not null check (char_length(trim(evaluator_version)) > 0),
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  created_at timestamptz not null default now(),
  constraint adhdice_achievement_occurrences_snapshot_check check (
    outcome_snapshot is not null or active_duration_seconds is not null
  ),
  constraint adhdice_achievement_occurrences_week_check check (
    week_key = week_start_date and week_end_date = week_start_date + 6
  ),
  constraint adhdice_achievement_occurrences_month_check check (
    month_start_date <= logical_date and logical_date <= month_end_date
  ),
  unique (id, user_id),
  unique (user_id, dedupe_key),
  unique (user_id, source_kind, source_id, source_occurrence_key)
);

create index if not exists adhdice_achievement_occurrences_user_logical_date_idx
  on public.adhdice_achievement_occurrences (user_id, logical_date desc, first_qualified_at desc);
create index if not exists adhdice_achievement_occurrences_user_week_idx
  on public.adhdice_achievement_occurrences (user_id, week_key, entity_kind);
create index if not exists adhdice_achievement_occurrences_user_month_idx
  on public.adhdice_achievement_occurrences (user_id, month_key, entity_kind);

create or replace function public.adhdice_validate_achievement_occurrence_activation()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_activated_at timestamptz;
begin
  select activated_at into v_activated_at
  from public.adhdice_achievement_profiles
  where user_id = new.user_id;
  if v_activated_at is null or new.first_qualified_at < v_activated_at then
    raise exception using errcode = '23514', message = 'Achievement occurrences must be post-activation.';
  end if;
  return new;
end;
$function$;

drop trigger if exists adhdice_achievement_occurrences_post_activation on public.adhdice_achievement_occurrences;
create trigger adhdice_achievement_occurrences_post_activation
  before insert on public.adhdice_achievement_occurrences
  for each row execute function public.adhdice_validate_achievement_occurrence_activation();

create table if not exists public.adhdice_achievement_occurrence_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  occurrence_id uuid not null,
  track_id text not null check (char_length(trim(track_id)) > 0),
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  matched_at timestamptz not null default now(),
  foreign key (occurrence_id, user_id)
    references public.adhdice_achievement_occurrences(id, user_id) on delete cascade,
  unique (occurrence_id, track_id)
);

create index if not exists adhdice_achievement_occurrence_matches_user_track_idx
  on public.adhdice_achievement_occurrence_matches (user_id, track_id, matched_at desc);

create table if not exists public.adhdice_achievement_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  track_id text not null check (char_length(trim(track_id)) > 0),
  current_value bigint not null default 0 check (current_value >= 0),
  current_streak bigint not null default 0 check (current_streak >= 0),
  best_streak bigint not null default 0 check (best_streak >= current_streak),
  current_streak_start date,
  current_streak_end date,
  best_streak_start date,
  best_streak_end date,
  source_watermark jsonb not null default '{}'::jsonb check (jsonb_typeof(source_watermark) = 'object'),
  recalculation_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(recalculation_metadata) = 'object'),
  evaluator_version text not null check (char_length(trim(evaluator_version)) > 0),
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  last_recalculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, track_id)
);

create table if not exists public.adhdice_achievement_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  mode text not null check (mode in ('immediate', 'recalculation')),
  status text not null,
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  rules_version text not null check (char_length(trim(rules_version)) > 0),
  cursor_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(cursor_metadata) = 'object'),
  window_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(window_metadata) = 'object'),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  error_message text check (error_message is null or char_length(error_message) <= 500),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint adhdice_achievement_evaluation_runs_status_check check (
    (status = 'running' and completed_at is null and error_code is null and error_message is null)
    or (status = 'completed' and completed_at is not null and error_code is null and error_message is null)
    or (status = 'failed' and completed_at is not null and error_code is not null)
  ),
  unique (id, user_id),
  unique (user_id, operation_id)
);

create index if not exists adhdice_achievement_evaluation_runs_user_started_idx
  on public.adhdice_achievement_evaluation_runs (user_id, started_at desc);

create table if not exists public.adhdice_achievement_tier_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  track_id text not null check (char_length(trim(track_id)) > 0),
  tier text not null check (tier in ('bronze', 'silver', 'gold', 'platinum')),
  award_key text not null check (char_length(trim(award_key)) > 0),
  earned_at timestamptz not null,
  triggering_occurrence_id uuid,
  evaluation_run_id uuid,
  evaluator_version text not null check (char_length(trim(evaluator_version)) > 0),
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  created_at timestamptz not null default now(),
  foreign key (triggering_occurrence_id, user_id)
    references public.adhdice_achievement_occurrences(id, user_id) on delete restrict,
  foreign key (evaluation_run_id, user_id)
    references public.adhdice_achievement_evaluation_runs(id, user_id) on delete restrict,
  unique (id, user_id),
  unique (user_id, track_id, tier),
  unique (user_id, award_key)
);

create index if not exists adhdice_achievement_tier_awards_user_earned_idx
  on public.adhdice_achievement_tier_awards (user_id, earned_at desc);

create table if not exists public.adhdice_achievement_collection_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  collection_id text not null check (char_length(trim(collection_id)) > 0),
  mastery_version text not null check (char_length(trim(mastery_version)) > 0),
  catalog_version text not null check (char_length(trim(catalog_version)) > 0),
  award_key text not null check (char_length(trim(award_key)) > 0),
  required_track_ids_snapshot jsonb not null check (
    jsonb_typeof(required_track_ids_snapshot) = 'array'
    and jsonb_array_length(required_track_ids_snapshot) > 0
  ),
  required_tracks_fingerprint text not null check (char_length(trim(required_tracks_fingerprint)) > 0),
  earned_at timestamptz not null,
  evaluation_run_id uuid,
  created_at timestamptz not null default now(),
  foreign key (evaluation_run_id, user_id)
    references public.adhdice_achievement_evaluation_runs(id, user_id) on delete restrict,
  unique (id, user_id),
  unique (user_id, collection_id, mastery_version),
  unique (user_id, award_key)
);

create index if not exists adhdice_achievement_collection_awards_user_earned_idx
  on public.adhdice_achievement_collection_awards (user_id, earned_at desc);

create table if not exists public.adhdice_achievement_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.adhdice_achievement_profiles(user_id) on delete cascade,
  award_kind text not null check (award_kind in ('tier', 'collection')),
  tier_award_id uuid,
  collection_award_id uuid,
  dedupe_key text not null check (char_length(trim(dedupe_key)) > 0),
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  seen_at timestamptz,
  constraint adhdice_achievement_notifications_award_check check (
    (award_kind = 'tier' and tier_award_id is not null and collection_award_id is null)
    or (award_kind = 'collection' and collection_award_id is not null and tier_award_id is null)
  ),
  constraint adhdice_achievement_notifications_status_check check (
    (status = 'pending' and delivered_at is null and seen_at is null)
    or (status = 'delivered' and delivered_at is not null and seen_at is null)
    or (status = 'seen' and delivered_at is not null and seen_at is not null)
  ),
  foreign key (tier_award_id, user_id)
    references public.adhdice_achievement_tier_awards(id, user_id) on delete restrict,
  foreign key (collection_award_id, user_id)
    references public.adhdice_achievement_collection_awards(id, user_id) on delete restrict,
  unique (user_id, dedupe_key)
);

create index if not exists adhdice_achievement_notifications_user_status_idx
  on public.adhdice_achievement_notifications (user_id, status, created_at);

drop trigger if exists adhdice_achievement_profiles_set_updated_at on public.adhdice_achievement_profiles;
create trigger adhdice_achievement_profiles_set_updated_at
  before update on public.adhdice_achievement_profiles
  for each row execute function public.adhdice_clean_set_updated_at();

drop trigger if exists adhdice_achievement_progress_set_updated_at on public.adhdice_achievement_progress;
create trigger adhdice_achievement_progress_set_updated_at
  before update on public.adhdice_achievement_progress
  for each row execute function public.adhdice_clean_set_updated_at();

create or replace function public.adhdice_reject_permanent_achievement_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception using
    errcode = '55000',
    message = 'Earned Achievement awards and Collection mastery are permanent.';
end;
$function$;

drop trigger if exists adhdice_achievement_tier_awards_permanent on public.adhdice_achievement_tier_awards;
create trigger adhdice_achievement_tier_awards_permanent
  before update or delete on public.adhdice_achievement_tier_awards
  for each row execute function public.adhdice_reject_permanent_achievement_mutation();

drop trigger if exists adhdice_achievement_collection_awards_permanent on public.adhdice_achievement_collection_awards;
create trigger adhdice_achievement_collection_awards_permanent
  before update or delete on public.adhdice_achievement_collection_awards
  for each row execute function public.adhdice_reject_permanent_achievement_mutation();

create or replace function public.adhdice_activate_achievement_profile(
  p_operation_id uuid,
  p_catalog_version text,
  p_rules_version text,
  p_launch_mastery_version text,
  p_timezone text,
  p_logical_day_start time without time zone default time '06:00'
)
returns public.adhdice_achievement_profiles
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_profile public.adhdice_achievement_profiles%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null then raise exception 'Operation ID is required'; end if;
  if nullif(trim(p_catalog_version), '') is null
    or nullif(trim(p_rules_version), '') is null
    or nullif(trim(p_launch_mastery_version), '') is null then
    raise exception 'Catalog, rules, and launch mastery versions are required';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Achievement timezone must be a valid IANA timezone';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':achievement-activation', 0));
  select * into v_profile
  from public.adhdice_achievement_profiles
  where user_id = v_user_id;
  if found then return v_profile; end if;

  insert into public.adhdice_achievement_profiles (
    user_id, activation_operation_id, activated_at, catalog_version, rules_version,
    launch_mastery_version, timezone, logical_day_start
  ) values (
    v_user_id, p_operation_id, clock_timestamp(), trim(p_catalog_version), trim(p_rules_version),
    trim(p_launch_mastery_version), p_timezone, p_logical_day_start
  ) returning * into v_profile;
  return v_profile;
end;
$function$;

alter table public.adhdice_achievement_profiles enable row level security;
alter table public.adhdice_achievement_occurrences enable row level security;
alter table public.adhdice_achievement_occurrence_matches enable row level security;
alter table public.adhdice_achievement_progress enable row level security;
alter table public.adhdice_achievement_tier_awards enable row level security;
alter table public.adhdice_achievement_collection_awards enable row level security;
alter table public.adhdice_achievement_notifications enable row level security;
alter table public.adhdice_achievement_evaluation_runs enable row level security;

drop policy if exists "Users can read own Achievement profile" on public.adhdice_achievement_profiles;
create policy "Users can read own Achievement profile" on public.adhdice_achievement_profiles
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement occurrences" on public.adhdice_achievement_occurrences;
create policy "Users can read own Achievement occurrences" on public.adhdice_achievement_occurrences
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement occurrence matches" on public.adhdice_achievement_occurrence_matches;
create policy "Users can read own Achievement occurrence matches" on public.adhdice_achievement_occurrence_matches
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement progress" on public.adhdice_achievement_progress;
create policy "Users can read own Achievement progress" on public.adhdice_achievement_progress
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement tier awards" on public.adhdice_achievement_tier_awards;
create policy "Users can read own Achievement tier awards" on public.adhdice_achievement_tier_awards
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement Collection awards" on public.adhdice_achievement_collection_awards;
create policy "Users can read own Achievement Collection awards" on public.adhdice_achievement_collection_awards
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement notifications" on public.adhdice_achievement_notifications;
create policy "Users can read own Achievement notifications" on public.adhdice_achievement_notifications
  for select using (auth.uid() = user_id);
drop policy if exists "Users can read own Achievement evaluation runs" on public.adhdice_achievement_evaluation_runs;
create policy "Users can read own Achievement evaluation runs" on public.adhdice_achievement_evaluation_runs
  for select using (auth.uid() = user_id);

revoke all on public.adhdice_achievement_profiles from anon, authenticated;
revoke all on public.adhdice_achievement_occurrences from anon, authenticated;
revoke all on public.adhdice_achievement_occurrence_matches from anon, authenticated;
revoke all on public.adhdice_achievement_progress from anon, authenticated;
revoke all on public.adhdice_achievement_tier_awards from anon, authenticated;
revoke all on public.adhdice_achievement_collection_awards from anon, authenticated;
revoke all on public.adhdice_achievement_notifications from anon, authenticated;
revoke all on public.adhdice_achievement_evaluation_runs from anon, authenticated;

grant select on public.adhdice_achievement_profiles to authenticated;
grant select on public.adhdice_achievement_occurrences to authenticated;
grant select on public.adhdice_achievement_occurrence_matches to authenticated;
grant select on public.adhdice_achievement_progress to authenticated;
grant select on public.adhdice_achievement_tier_awards to authenticated;
grant select on public.adhdice_achievement_collection_awards to authenticated;
grant select on public.adhdice_achievement_notifications to authenticated;
grant select on public.adhdice_achievement_evaluation_runs to authenticated;

revoke all on function public.adhdice_activate_achievement_profile(uuid, text, text, text, text, time without time zone) from public, anon;
grant execute on function public.adhdice_activate_achievement_profile(uuid, text, text, text, text, time without time zone) to authenticated;

do $publication$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_achievement_profiles') then
    alter publication supabase_realtime add table public.adhdice_achievement_profiles;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_achievement_progress') then
    alter publication supabase_realtime add table public.adhdice_achievement_progress;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_achievement_tier_awards') then
    alter publication supabase_realtime add table public.adhdice_achievement_tier_awards;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_achievement_collection_awards') then
    alter publication supabase_realtime add table public.adhdice_achievement_collection_awards;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_achievement_notifications') then
    alter publication supabase_realtime add table public.adhdice_achievement_notifications;
  end if;
end;
$publication$;

notify pgrst, 'reload schema';
commit;
