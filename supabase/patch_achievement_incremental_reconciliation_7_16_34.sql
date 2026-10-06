-- ADHDice 7.16.34 incremental Achievement reconciliation foundation.
-- SOURCE ONLY: do not apply automatically, deploy an Edge Function, or mutate
-- production Task, History, Achievement, reward, or notification data.
-- The existing full evaluator remains the active runtime path in this release.

begin;

do $guard$
begin
  if to_regprocedure('public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz)') is null then
    raise exception 'Achievement progress rebuild function is not installed.';
  end if;
  if to_regprocedure('public.adhdice_achievement_streak_metadata(uuid,text,date)') is null then
    raise exception 'Achievement streak metadata function is not installed.';
  end if;
  if to_regprocedure('public.adhdice_achievement_thresholds()') is null then
    raise exception 'Achievement threshold catalog function is not installed.';
  end if;
end;
$guard$;

-- One dependency authority for both bounded match synchronization and the
-- authoritative full-rebuild reference path. A track may intentionally have
-- more than one source family (keep_it_moving).
create or replace function public.adhdice_achievement_track_dependencies()
returns table(entity_kind text, track_id text)
language sql immutable parallel safe
set search_path = ''
as $function$
  select dependency.entity_kind, dependency.track_id
  from (values
    ('parent_task', 'count_on_me'),
    ('parent_task', 'i_can_count_to_ten'),
    ('parent_task', 'fifty_two_each_year'),
    ('parent_task', 'twelve_each_year'),
    ('parent_task', 'do_something'),
    ('parent_task', 'this_week_on_the_streak'),
    ('parent_task', 'keep_it_moving'),
    ('step', 'first_step'),
    ('step', 'second_step'),
    ('step', 'third_step'),
    ('step', 'keep_it_moving'),
    ('focus_session', 'broken_clock'),
    ('focus_session', 'overtime'),
    ('focus_session', 'february_challenge'),
    ('focus_session', 'locked_in'),
    ('focus_session', 'staring_contest'),
    ('focus_session', 'session_possible'),
    ('focus_session', 'dont_get_distracted'),
    ('parent_step_set', 'last_step')
  ) dependency(entity_kind, track_id)
$function$;

-- Keep the full rebuild as a repair/reference path, but remove its duplicate
-- dependency list so the incremental and full paths cannot drift silently.
do $mapping_migration$
declare
  v_definition text;
  v_before constant text := $anchor$
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
  ) track$anchor$;
  v_after constant text := $replacement$
  join public.adhdice_achievement_track_dependencies() track
    on track.entity_kind = occurrence.entity_kind$replacement$;
  v_match_count integer;
begin
  select pg_get_functiondef('public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamptz)'::regprocedure)
    into v_definition;
  v_match_count := (length(v_definition) - length(replace(v_definition, v_before, ''))) / length(v_before);
  if v_match_count <> 1 then
    raise exception 'Expected one full-rebuild dependency block; found %.', v_match_count;
  end if;
  execute replace(v_definition, v_before, v_after);
end;
$mapping_migration$;

-- Synchronize only the explicitly supplied occurrence IDs. The caller is
-- expected to pass the source rows changed by one bounded operation/batch.
create or replace function public.adhdice_sync_achievement_occurrence_matches(
  p_occurrence_ids uuid[]
) returns integer
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_deleted integer := 0;
  v_inserted integer := 0;
begin
  if coalesce(pg_catalog.cardinality(p_occurrence_ids), 0) = 0 then
    return 0;
  end if;
  if pg_catalog.cardinality(p_occurrence_ids) > 500 then
    raise exception 'Incremental Achievement occurrence batches are limited to 500 rows.' using errcode = '22023';
  end if;

  delete from public.adhdice_achievement_occurrence_matches occurrence_match
  where occurrence_match.occurrence_id = any(p_occurrence_ids)
    and not exists (
      select 1
      from public.adhdice_achievement_occurrences occurrence
      join public.adhdice_achievement_profiles profile on profile.user_id = occurrence.user_id
      join public.adhdice_achievement_track_dependencies() dependency
        on dependency.entity_kind = occurrence.entity_kind
       and dependency.track_id = occurrence_match.track_id
      where occurrence.id = occurrence_match.occurrence_id
        and occurrence.user_id = occurrence_match.user_id
        and occurrence.is_currently_qualifying
        and occurrence_match.catalog_version = profile.catalog_version
    );
  get diagnostics v_deleted = row_count;

  insert into public.adhdice_achievement_occurrence_matches (
    user_id, occurrence_id, track_id, catalog_version
  )
  select occurrence.user_id, occurrence.id, dependency.track_id, profile.catalog_version
  from public.adhdice_achievement_occurrences occurrence
  join public.adhdice_achievement_profiles profile on profile.user_id = occurrence.user_id
  join public.adhdice_achievement_track_dependencies() dependency
    on dependency.entity_kind = occurrence.entity_kind
  where occurrence.id = any(p_occurrence_ids)
    and occurrence.is_currently_qualifying
  on conflict (occurrence_id, track_id) do update set
    catalog_version = excluded.catalog_version;
  get diagnostics v_inserted = row_count;

  return v_deleted + v_inserted;
end;
$function$;

-- Recalculate and award only the requested tracks. Metric formulas intentionally
-- match the full rebuild; only the write set is dependency-scoped. The caller
-- supplies an existing evaluation run ID so permanent award foreign keys retain
-- the same operation/idempotency boundary as the reference evaluator.
create or replace function public.adhdice_rebuild_achievement_progress_for_tracks(
  p_user_id uuid,
  p_track_ids text[],
  p_run_id uuid,
  p_awarded_at timestamptz
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
  v_track_ids text[];
  v_occurrence_count bigint;
begin
  select * into v_profile
  from public.adhdice_achievement_profiles
  where user_id = p_user_id;
  if not found then return; end if;
  if p_run_id is null or p_awarded_at is null then
    raise exception 'A targeted Achievement evaluation run and timestamp are required.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct requested.track_id order by requested.track_id), '{}'::text[])
    into v_track_ids
  from unnest(coalesce(p_track_ids, '{}'::text[])) requested(track_id)
  where exists (
    select 1 from public.adhdice_achievement_thresholds() threshold
    where threshold.track_id = requested.track_id
  );
  if pg_catalog.cardinality(v_track_ids) = 0 then return; end if;

  v_today := public.adhdice_achievement_logical_date(
    pg_catalog.clock_timestamp(), v_profile.timezone, v_profile.logical_day_start
  );
  select count(*) into v_occurrence_count
  from public.adhdice_achievement_occurrences
  where user_id = p_user_id;

  if 'do_something' = any(v_track_ids) then
    v_parent_streak := public.adhdice_achievement_streak_metadata(p_user_id, 'parent', v_today);
  end if;
  if 'dont_get_distracted' = any(v_track_ids) then
    v_focus_streak := public.adhdice_achievement_streak_metadata(p_user_id, 'focus', v_today);
  end if;
  if 'keep_it_moving' = any(v_track_ids) then
    v_moving_streak := public.adhdice_achievement_streak_metadata(p_user_id, 'moving', v_today);
  end if;

  with values_by_track(track_id, current_value, streak) as (
    select 'i_can_count_to_ten', count(*)::bigint, null::jsonb
    from (
      select logical_date
      from public.adhdice_achievement_occurrences
      where user_id = p_user_id and is_currently_qualifying and entity_kind = 'parent_task'
      group by logical_date having count(*) >= 10
    ) daily
    where 'i_can_count_to_ten' = any(v_track_ids)
    union all
    select 'fifty_two_each_year', coalesce(max(total), 0)::bigint, null::jsonb
    from (
      select count(*) total
      from public.adhdice_achievement_occurrences
      where user_id = p_user_id and is_currently_qualifying and entity_kind = 'parent_task'
      group by week_key
    ) weekly
    where 'fifty_two_each_year' = any(v_track_ids)
    union all
    select 'twelve_each_year', coalesce(max(total), 0)::bigint, null::jsonb
    from (
      select count(*) total
      from public.adhdice_achievement_occurrences
      where user_id = p_user_id and is_currently_qualifying and entity_kind = 'parent_task'
      group by month_key
    ) monthly
    where 'twelve_each_year' = any(v_track_ids)
    union all
    select 'count_on_me', count(*)::bigint, null::jsonb
    from public.adhdice_achievement_occurrences
    where user_id = p_user_id and is_currently_qualifying and entity_kind = 'parent_task'
      and 'count_on_me' = any(v_track_ids)
    union all
    select 'first_step', coalesce(max(total), 0)::bigint, null::jsonb
    from (
      select count(*) total
      from public.adhdice_achievement_occurrences
      where user_id = p_user_id and is_currently_qualifying and entity_kind = 'step'
      group by logical_date
    ) daily_steps
    where 'first_step' = any(v_track_ids)
    union all
    select 'second_step', coalesce(max(total), 0)::bigint, null::jsonb
    from (
      select count(*) total
      from public.adhdice_achievement_occurrences
      where user_id = p_user_id and is_currently_qualifying and entity_kind = 'step'
      group by week_key
    ) weekly_steps
    where 'second_step' = any(v_track_ids)
    union all
    select 'third_step', count(*)::bigint, null::jsonb
    from public.adhdice_achievement_occurrences
    where user_id = p_user_id and is_currently_qualifying and entity_kind = 'step'
      and 'third_step' = any(v_track_ids)
    union all
    select 'last_step', count(*)::bigint, null::jsonb
    from public.adhdice_achievement_occurrences
    where user_id = p_user_id and is_currently_qualifying and entity_kind = 'parent_step_set'
      and 'last_step' = any(v_track_ids)
    union all
    select 'broken_clock', coalesce(max(total), 0)::bigint, null::jsonb
    from (
      select sum(active_duration_seconds) total
      from public.adhdice_achievement_occurrences
      where user_id = p_user_id and is_currently_qualifying and entity_kind = 'focus_session'
      group by logical_date
    ) focus_daily
    where 'broken_clock' = any(v_track_ids)
    union all
    select 'overtime', coalesce(max(total), 0)::bigint, null::jsonb
    from (
      select sum(active_duration_seconds) total
      from public.adhdice_achievement_occurrences
      where user_id = p_user_id and is_currently_qualifying and entity_kind = 'focus_session'
      group by week_key
    ) focus_weekly
    where 'overtime' = any(v_track_ids)
    union all
    select 'february_challenge', coalesce(max(total), 0)::bigint, null::jsonb
    from (
      select sum(active_duration_seconds) total
      from public.adhdice_achievement_occurrences
      where user_id = p_user_id and is_currently_qualifying and entity_kind = 'focus_session'
      group by month_key
    ) focus_monthly
    where 'february_challenge' = any(v_track_ids)
    union all
    select 'locked_in', coalesce(sum(active_duration_seconds), 0)::bigint, null::jsonb
    from public.adhdice_achievement_occurrences
    where user_id = p_user_id and is_currently_qualifying and entity_kind = 'focus_session'
      and 'locked_in' = any(v_track_ids)
    union all
    select 'staring_contest', coalesce(max(active_duration_seconds), 0)::bigint, null::jsonb
    from public.adhdice_achievement_occurrences
    where user_id = p_user_id and is_currently_qualifying and entity_kind = 'focus_session'
      and 'staring_contest' = any(v_track_ids)
    union all
    select 'session_possible', count(*)::bigint, null::jsonb
    from public.adhdice_achievement_occurrences
    where user_id = p_user_id and is_currently_qualifying and entity_kind = 'focus_session'
      and active_duration_seconds >= 600 and 'session_possible' = any(v_track_ids)
    union all
    select 'do_something', coalesce((v_parent_streak->>'best')::bigint, 0), v_parent_streak
    where 'do_something' = any(v_track_ids)
    union all
    select 'dont_get_distracted', coalesce((v_focus_streak->>'best')::bigint, 0), v_focus_streak
    where 'dont_get_distracted' = any(v_track_ids)
    union all
    select 'this_week_on_the_streak', count(*)::bigint, null::jsonb
    from (
      select week_key
      from public.adhdice_achievement_occurrences
      where user_id = p_user_id and is_currently_qualifying
        and entity_kind = 'parent_task' and week_end_date < v_today
      group by week_key having count(distinct logical_date) = 7
    ) closed_weeks
    where 'this_week_on_the_streak' = any(v_track_ids)
    union all
    select 'keep_it_moving', coalesce((v_moving_streak->>'best')::bigint, 0), v_moving_streak
    where 'keep_it_moving' = any(v_track_ids)
  )
  insert into public.adhdice_achievement_progress (
    user_id, track_id, current_value, current_streak, best_streak,
    current_streak_start, current_streak_end, best_streak_start, best_streak_end,
    source_watermark, recalculation_metadata, evaluator_version, catalog_version, last_recalculated_at
  )
  select p_user_id, track_id, current_value,
    coalesce((streak->>'current')::bigint, 0), coalesce((streak->>'best')::bigint, 0),
    (streak->>'current_start')::date, (streak->>'current_end')::date,
    (streak->>'best_start')::date, (streak->>'best_end')::date,
    jsonb_build_object('occurrence_count', v_occurrence_count),
    jsonb_build_object('run_id', p_run_id, 'streak_runs', coalesce(streak->'runs', '[]'::jsonb)),
    'achievements-evaluator-v1', v_profile.catalog_version, p_awarded_at
  from values_by_track
  where track_id = any(v_track_ids)
  on conflict (user_id, track_id) do update set
    current_value = excluded.current_value,
    current_streak = excluded.current_streak,
    best_streak = excluded.best_streak,
    current_streak_start = excluded.current_streak_start,
    current_streak_end = excluded.current_streak_end,
    best_streak_start = excluded.best_streak_start,
    best_streak_end = excluded.best_streak_end,
    source_watermark = excluded.source_watermark,
    recalculation_metadata = excluded.recalculation_metadata,
    evaluator_version = excluded.evaluator_version,
    catalog_version = excluded.catalog_version,
    last_recalculated_at = excluded.last_recalculated_at;

  with inserted as (
    insert into public.adhdice_achievement_tier_awards (
      user_id, track_id, tier, award_key, earned_at, evaluation_run_id,
      evaluator_version, catalog_version
    )
    select p_user_id, threshold.track_id, threshold.tier,
      'tier-award:v1:' || threshold.track_id || ':' || threshold.tier,
      p_awarded_at + (threshold.tier_order * interval '1 microsecond'), p_run_id,
      'achievements-evaluator-v1', v_profile.catalog_version
    from public.adhdice_achievement_thresholds() threshold
    join public.adhdice_achievement_progress progress
      on progress.user_id = p_user_id and progress.track_id = threshold.track_id
    where threshold.track_id = any(v_track_ids)
      and progress.current_value >= threshold.threshold_value
    order by threshold.track_id, threshold.tier_order
    on conflict (user_id, track_id, tier) do nothing
    returning id, award_key
  )
  insert into public.adhdice_achievement_notifications (
    user_id, award_kind, tier_award_id, dedupe_key
  )
  select p_user_id, 'tier', inserted.id, 'notification:v1:' || inserted.award_key
  from inserted
  on conflict (user_id, dedupe_key) do nothing;

  with collections(collection_id, required_tracks) as (
    values
      ('you_can_count_on_me', '["i_can_count_to_ten","fifty_two_each_year","twelve_each_year","count_on_me"]'::jsonb),
      ('one_step_at_a_time', '["first_step","second_step","third_step","last_step"]'::jsonb),
      ('clocked_in', '["broken_clock","overtime","february_challenge","locked_in","staring_contest","session_possible"]'::jsonb),
      ('were_going_streaking', '["do_something","dont_get_distracted","this_week_on_the_streak","keep_it_moving"]'::jsonb)
  ), relevant as (
    select collections.*
    from collections
    where exists (
      select 1
      from jsonb_array_elements_text(collections.required_tracks) required(track_id)
      where required.track_id = any(v_track_ids)
    )
  ), inserted as (
    insert into public.adhdice_achievement_collection_awards (
      user_id, collection_id, mastery_version, catalog_version, award_key,
      required_track_ids_snapshot, required_tracks_fingerprint, earned_at, evaluation_run_id
    )
    select p_user_id, relevant.collection_id, v_profile.launch_mastery_version,
      v_profile.catalog_version,
      'collection-award:v1:' || relevant.collection_id || ':' || v_profile.launch_mastery_version,
      relevant.required_tracks,
      encode(extensions.digest(relevant.required_tracks::text, 'sha256'::text), 'hex'),
      p_awarded_at + interval '10 microseconds', p_run_id
    from relevant
    where not exists (
      select 1
      from jsonb_array_elements_text(relevant.required_tracks) required(track_id)
      where not exists (
        select 1
        from public.adhdice_achievement_tier_awards award
        where award.user_id = p_user_id
          and award.track_id = required.track_id
          and award.tier = 'platinum'
      )
    )
    on conflict (user_id, collection_id, mastery_version) do nothing
    returning id, award_key
  )
  insert into public.adhdice_achievement_notifications (
    user_id, award_kind, collection_award_id, dedupe_key
  )
  select p_user_id, 'collection', inserted.id, 'notification:v1:' || inserted.award_key
  from inserted
  on conflict (user_id, dedupe_key) do nothing;
end;
$function$;

revoke all on function public.adhdice_achievement_track_dependencies() from public, anon, authenticated;
grant execute on function public.adhdice_achievement_track_dependencies() to service_role;
revoke all on function public.adhdice_sync_achievement_occurrence_matches(uuid[]) from public, anon, authenticated;
grant execute on function public.adhdice_sync_achievement_occurrence_matches(uuid[]) to service_role;
revoke all on function public.adhdice_rebuild_achievement_progress_for_tracks(uuid,text[],uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.adhdice_rebuild_achievement_progress_for_tracks(uuid,text[],uuid,timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
