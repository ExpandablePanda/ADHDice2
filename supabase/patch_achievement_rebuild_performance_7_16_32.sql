-- ADHDice 7.16.32 Achievement rebuild performance correction.
-- SOURCE ONLY: do not apply automatically, deploy an Edge Function, or mutate
-- production Task, History, Achievement, reward, or notification data.
-- Apply only after explicit production approval and source review.

begin;

do $guard$
begin
  if to_regprocedure('public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz)') is null then
    raise exception 'Achievement progress rebuild function is not installed.';
  end if;
end;
$guard$;

create or replace function public.adhdice_rebuild_achievement_progress(
  p_user_id uuid, p_run_id uuid, p_awarded_at timestamptz
) returns void
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_today date;
  v_parent_streak jsonb;
  v_focus_streak jsonb;
  v_moving_streak jsonb;
  v_streaks jsonb;
  v_occurrence_count bigint;
begin
  select * into v_profile from public.adhdice_achievement_profiles where user_id = p_user_id;
  if not found then return; end if;
  v_today := public.adhdice_achievement_logical_date(clock_timestamp(), v_profile.timezone, v_profile.logical_day_start);

  -- Snapshot user evidence once. The former rebuild scanned the same
  -- user-wide occurrence table once per match family, streak mode, and track
  -- aggregate. All later evidence reads are bounded to this snapshot.
  drop table if exists pg_temp.adhdice_achievement_qualifying_occurrences;
  create temporary table pg_temp.adhdice_achievement_qualifying_occurrences
  on commit drop
  as
  select occurrence.id, occurrence.user_id, occurrence.logical_date, occurrence.week_key,
    occurrence.week_end_date, occurrence.month_key, occurrence.entity_kind,
    occurrence.active_duration_seconds, occurrence.is_currently_qualifying,
    count(*) over () as occurrence_count
  from public.adhdice_achievement_occurrences occurrence
  where occurrence.user_id = p_user_id;
  create index adhdice_achievement_qualifying_occurrences_kind_date_idx
    on pg_temp.adhdice_achievement_qualifying_occurrences (entity_kind, logical_date);
  analyze pg_temp.adhdice_achievement_qualifying_occurrences;

  select coalesce(max(occurrence_count), 0) into v_occurrence_count
  from pg_temp.adhdice_achievement_qualifying_occurrences;

  with modes(mode) as (
    values ('parent'::text), ('focus'::text), ('moving'::text)
  ), qualified_days(mode, logical_date) as (
    select 'parent', occurrence.logical_date
    from pg_temp.adhdice_achievement_qualifying_occurrences occurrence
    where occurrence.is_currently_qualifying and occurrence.entity_kind = 'parent_task'
    group by occurrence.logical_date
    union all
    select 'focus', occurrence.logical_date
    from pg_temp.adhdice_achievement_qualifying_occurrences occurrence
    where occurrence.is_currently_qualifying and occurrence.entity_kind = 'focus_session'
    group by occurrence.logical_date
    having sum(occurrence.active_duration_seconds) >= 1800
    union all
    select 'moving', occurrence.logical_date
    from pg_temp.adhdice_achievement_qualifying_occurrences occurrence
    where occurrence.is_currently_qualifying and occurrence.entity_kind in ('parent_task', 'step')
    group by occurrence.logical_date
  ), numbered as (
    select mode, logical_date,
      logical_date - row_number() over (partition by mode order by logical_date)::integer as run_key
    from qualified_days
  ), runs as (
    select mode, min(logical_date) start_date, max(logical_date) end_date, count(*)::bigint length
    from numbered
    group by mode, run_key
  ), best as (
    select distinct on (mode) mode, start_date, end_date, length
    from runs
    order by mode, length desc, end_date asc
  ), current_run as (
    select distinct on (mode) mode, start_date, end_date, length
    from runs
    where end_date >= v_today - 1
    order by mode, end_date desc
  )
  select coalesce(jsonb_object_agg(modes.mode, jsonb_build_object(
    'best', coalesce(best.length, 0),
    'best_start', best.start_date,
    'best_end', best.end_date,
    'current', coalesce(current_run.length, 0),
    'current_start', current_run.start_date,
    'current_end', current_run.end_date,
    'runs', coalesce((select jsonb_agg(jsonb_build_object(
      'start', run_row.start_date, 'end', run_row.end_date, 'length', run_row.length
    ) order by run_row.start_date) from runs run_row where run_row.mode = modes.mode), '[]'::jsonb)
  )), '{}'::jsonb)
  into v_streaks
  from modes
  left join best on best.mode = modes.mode
  left join current_run on current_run.mode = modes.mode;
  v_parent_streak := v_streaks->'parent';
  v_focus_streak := v_streaks->'focus';
  v_moving_streak := v_streaks->'moving';

  delete from public.adhdice_achievement_occurrence_matches where user_id = p_user_id;
  insert into public.adhdice_achievement_occurrence_matches (user_id, occurrence_id, track_id, catalog_version)
  select occurrence.user_id, occurrence.id, track.track_id, v_profile.catalog_version
  from pg_temp.adhdice_achievement_qualifying_occurrences occurrence
  cross join lateral (
    select track.track_id
    from (values
      ('parent_task', 'count_on_me'), ('parent_task', 'i_can_count_to_ten'),
      ('parent_task', 'fifty_two_each_year'), ('parent_task', 'twelve_each_year'),
      ('parent_task', 'do_something'), ('parent_task', 'this_week_on_the_streak'),
      ('parent_task', 'keep_it_moving'), ('step', 'first_step'),
      ('step', 'second_step'), ('step', 'third_step'), ('step', 'keep_it_moving'),
      ('focus_session', 'broken_clock'), ('focus_session', 'overtime'),
      ('focus_session', 'february_challenge'), ('focus_session', 'locked_in'),
      ('focus_session', 'staring_contest'), ('focus_session', 'session_possible'),
      ('focus_session', 'dont_get_distracted'), ('parent_step_set', 'last_step')
    ) track(entity_kind, track_id)
    where track.entity_kind = occurrence.entity_kind
  ) track
  where occurrence.is_currently_qualifying
  on conflict (occurrence_id, track_id) do nothing;

  with values_by_track(track_id, current_value, streak) as (
    values
      ('i_can_count_to_ten', (select count(*) from (select logical_date from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='parent_task' group by logical_date having count(*) >= 10) x), null::jsonb),
      ('fifty_two_each_year', coalesce((select max(total) from (select count(*) total from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='parent_task' group by week_key) x),0), null),
      ('twelve_each_year', coalesce((select max(total) from (select count(*) total from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='parent_task' group by month_key) x),0), null),
      ('count_on_me', (select count(*) from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='parent_task'), null),
      ('first_step', coalesce((select max(total) from (select count(*) total from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='step' group by logical_date) x),0), null),
      ('second_step', coalesce((select max(total) from (select count(*) total from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='step' group by week_key) x),0), null),
      ('third_step', (select count(*) from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='step'), null),
      ('last_step', (select count(*) from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='parent_step_set'), null),
      ('broken_clock', coalesce((select max(total) from (select sum(active_duration_seconds) total from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='focus_session' group by logical_date) x),0), null),
      ('overtime', coalesce((select max(total) from (select sum(active_duration_seconds) total from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='focus_session' group by week_key) x),0), null),
      ('february_challenge', coalesce((select max(total) from (select sum(active_duration_seconds) total from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='focus_session' group by month_key) x),0), null),
      ('locked_in', coalesce((select sum(active_duration_seconds) from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='focus_session'),0), null),
      ('staring_contest', coalesce((select max(active_duration_seconds) from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='focus_session'),0), null),
      ('session_possible', (select count(*) from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='focus_session' and active_duration_seconds >= 600), null),
      ('do_something', (v_parent_streak->>'best')::bigint, v_parent_streak),
      ('dont_get_distracted', (v_focus_streak->>'best')::bigint, v_focus_streak),
      ('this_week_on_the_streak', (select count(*) from (select week_key from pg_temp.adhdice_achievement_qualifying_occurrences where is_currently_qualifying and entity_kind='parent_task' and week_end_date < v_today group by week_key having count(distinct logical_date)=7) x), null),
      ('keep_it_moving', (v_moving_streak->>'best')::bigint, v_moving_streak)
  )
  insert into public.adhdice_achievement_progress (
    user_id, track_id, current_value, current_streak, best_streak,
    current_streak_start, current_streak_end, best_streak_start, best_streak_end,
    source_watermark, recalculation_metadata, evaluator_version, catalog_version, last_recalculated_at
  ) select p_user_id, track_id, current_value,
    coalesce((streak->>'current')::bigint,0), coalesce((streak->>'best')::bigint,0),
    (streak->>'current_start')::date, (streak->>'current_end')::date,
    (streak->>'best_start')::date, (streak->>'best_end')::date,
    jsonb_build_object('occurrence_count',v_occurrence_count),
    jsonb_build_object('run_id',p_run_id,'streak_runs',coalesce(streak->'runs','[]'::jsonb)),
    'achievements-evaluator-v1', v_profile.catalog_version, p_awarded_at
  from values_by_track
  on conflict (user_id, track_id) do update set
    current_value=excluded.current_value, current_streak=excluded.current_streak, best_streak=excluded.best_streak,
    current_streak_start=excluded.current_streak_start, current_streak_end=excluded.current_streak_end,
    best_streak_start=excluded.best_streak_start, best_streak_end=excluded.best_streak_end,
    source_watermark=excluded.source_watermark, recalculation_metadata=excluded.recalculation_metadata,
    evaluator_version=excluded.evaluator_version, catalog_version=excluded.catalog_version,
    last_recalculated_at=excluded.last_recalculated_at;

  insert into public.adhdice_achievement_tier_awards (
    user_id, track_id, tier, award_key, earned_at, evaluation_run_id, evaluator_version, catalog_version
  ) select p_user_id, threshold.track_id, threshold.tier,
    'tier-award:v1:' || threshold.track_id || ':' || threshold.tier,
    p_awarded_at + (threshold.tier_order * interval '1 microsecond'), p_run_id,
    'achievements-evaluator-v1', v_profile.catalog_version
  from public.adhdice_achievement_thresholds() threshold
  join public.adhdice_achievement_progress progress
    on progress.user_id=p_user_id and progress.track_id=threshold.track_id
  where progress.current_value >= threshold.threshold_value
  order by threshold.track_id, threshold.tier_order
  on conflict (user_id, track_id, tier) do nothing;

  insert into public.adhdice_achievement_collection_awards (
    user_id, collection_id, mastery_version, catalog_version, award_key,
    required_track_ids_snapshot, required_tracks_fingerprint, earned_at, evaluation_run_id
  )
  select p_user_id, collection_id, v_profile.launch_mastery_version, v_profile.catalog_version,
    'collection-award:v1:' || collection_id || ':' || v_profile.launch_mastery_version,
    required_tracks, encode(extensions.digest(required_tracks::text, 'sha256'::text), 'hex'), p_awarded_at + interval '10 microseconds', p_run_id
  from (values
    ('you_can_count_on_me', '["i_can_count_to_ten","fifty_two_each_year","twelve_each_year","count_on_me"]'::jsonb),
    ('one_step_at_a_time', '["first_step","second_step","third_step","last_step"]'::jsonb),
    ('clocked_in', '["broken_clock","overtime","february_challenge","locked_in","staring_contest","session_possible"]'::jsonb),
    ('were_going_streaking', '["do_something","dont_get_distracted","this_week_on_the_streak","keep_it_moving"]'::jsonb)
  ) collection(collection_id, required_tracks)
  where not exists (
    select 1 from jsonb_array_elements_text(required_tracks) required(track_id)
    where not exists (select 1 from public.adhdice_achievement_tier_awards award
      where award.user_id=p_user_id and award.track_id=required.track_id and award.tier='platinum')
  ) on conflict (user_id, collection_id, mastery_version) do nothing;

  insert into public.adhdice_achievement_notifications (user_id, award_kind, tier_award_id, dedupe_key)
  select p_user_id, 'tier', id, 'notification:v1:' || award_key
  from public.adhdice_achievement_tier_awards where user_id=p_user_id
  on conflict (user_id, dedupe_key) do nothing;
  insert into public.adhdice_achievement_notifications (user_id, award_kind, collection_award_id, dedupe_key)
  select p_user_id, 'collection', id, 'notification:v1:' || award_key
  from public.adhdice_achievement_collection_awards where user_id=p_user_id
  on conflict (user_id, dedupe_key) do nothing;
end;
$function$;

revoke all on function public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
