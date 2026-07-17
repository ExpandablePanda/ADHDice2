-- Restore parent Step-set qualification from authoritative current Step occurrences.
-- Apply after add_achievement_mvp_runtime.sql.
-- Safe to reapply: CREATE OR REPLACE preserves existing rows, ownership, and grants.
begin;

create or replace function public.adhdice_refresh_achievement_step_set(p_user_id uuid, p_root_parent_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_profile public.adhdice_achievement_profiles%rowtype;
  v_step_count integer;
  v_occurrence_count integer;
  v_step_ids jsonb;
  v_occurrence_ids jsonb;
  v_set_key text;
  v_qualified_at timestamptz;
  v_logical_date date;
  v_occurrence_id uuid;
  v_title text;
begin
  select * into v_profile from public.adhdice_achievement_profiles where user_id = p_user_id;
  if not found then return null; end if;
  update public.adhdice_achievement_occurrences step_set
    set is_currently_qualifying = false
    where step_set.user_id = p_user_id
      and step_set.source_kind = 'step_set'
      and step_set.root_parent_id = p_root_parent_id
      and step_set.is_currently_qualifying
      and exists (
        select 1
        from jsonb_array_elements_text(step_set.source_snapshot->'step_occurrence_ids') constituent(occurrence_id)
        join public.adhdice_achievement_occurrences source_occurrence
          on source_occurrence.id = constituent.occurrence_id::uuid
        where not source_occurrence.is_currently_qualifying
      );
  with recursive steps as (
    select id, parent_task_id from public.adhdice_clean_tasks
    where user_id = p_user_id and parent_task_id = p_root_parent_id
    union all
    select child.id, child.parent_task_id from public.adhdice_clean_tasks child
    join steps parent on child.parent_task_id = parent.id where child.user_id = p_user_id
  ), latest_candidate as (
    select distinct on (occ.entity_id) occ.entity_id, occ.id, occ.first_qualified_at, occ.logical_date,
      occ.is_currently_qualifying
    from public.adhdice_achievement_occurrences occ join steps on steps.id = occ.entity_id
    where occ.user_id = p_user_id and occ.entity_kind = 'step'
    order by occ.entity_id, occ.first_qualified_at desc, occ.id
  ), latest as (
    select entity_id, id, first_qualified_at, logical_date from latest_candidate
    where is_currently_qualifying
  )
  select (select count(*) from steps), count(latest.id),
    (select jsonb_agg(id order by id::text) from steps),
    jsonb_agg(latest.id order by latest.id::text), max(latest.first_qualified_at), max(latest.logical_date)
  into v_step_count, v_occurrence_count, v_step_ids, v_occurrence_ids, v_qualified_at, v_logical_date
  from latest;
  if v_step_count = 0 or v_occurrence_count <> v_step_count then return null; end if;
  v_set_key := 'parent-step-set:v1:' || p_root_parent_id::text || ':' || encode(extensions.digest(v_occurrence_ids::text, 'sha256'::text), 'hex');
  select title into v_title from public.adhdice_clean_tasks where id = p_root_parent_id and user_id = p_user_id;
  insert into public.adhdice_achievement_occurrences (
    user_id, source_kind, source_id, source_occurrence_key, dedupe_key, source_created_at,
    first_qualified_at, logical_date, week_key, week_start_date, week_end_date,
    month_key, month_start_date, month_end_date, timezone, logical_day_start,
    entity_kind, entity_id, root_parent_id, title_snapshot, outcome_snapshot,
    evaluator_version, catalog_version, source_snapshot
  ) values (
    p_user_id, 'step_set', encode(extensions.digest(v_set_key::text, 'sha256'::text), 'hex'), v_set_key,
    'occurrence:v1:step_set:' || v_set_key, v_qualified_at, v_qualified_at, v_logical_date,
    v_logical_date - extract(isodow from v_logical_date)::integer + 1,
    v_logical_date - extract(isodow from v_logical_date)::integer + 1,
    v_logical_date - extract(isodow from v_logical_date)::integer + 7,
    to_char(v_logical_date, 'YYYY-MM'), date_trunc('month', v_logical_date)::date,
    (date_trunc('month', v_logical_date) + interval '1 month - 1 day')::date,
    v_profile.timezone, v_profile.logical_day_start, 'parent_step_set', p_root_parent_id,
    p_root_parent_id, v_title, 'done', 'achievements-evaluator-v1', v_profile.catalog_version,
    jsonb_build_object('step_ids', v_step_ids, 'step_occurrence_ids', v_occurrence_ids)
  ) on conflict (user_id, dedupe_key) do update set is_currently_qualifying = true
  returning id into v_occurrence_id;
  return v_occurrence_id;
end;
$function$;

notify pgrst, 'reload schema';
commit;
