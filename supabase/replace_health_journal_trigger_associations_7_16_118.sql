-- ADHDice 7.16.118: atomically replace Trigger links for explicitly targeted
-- Feeling occurrences. Authored source only; do not run without review.

begin;

create or replace function public.adhdice_replace_health_journal_trigger_associations(
  p_journal_entry_id uuid,
  p_replacements jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_replacement jsonb;
  v_association jsonb;
  v_expected jsonb;
  v_current jsonb;
  v_desired jsonb;
  v_occurrence_id uuid;
  v_trigger_id uuid;
  v_occurrence_kind text;
  v_effect text;
  v_previous_score integer;
  v_trigger_archived_at timestamptz;
  v_seen_occurrences text[] := array[]::text[];
  v_seen_triggers uuid[];
  v_seen_expected_triggers uuid[];
  v_occurrence_exists boolean;
  v_result_links jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_journal_entry_id is null or p_replacements is null or jsonb_typeof(p_replacements) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Journal Trigger replacements must target a Journal Entry and an array.';
  end if;

  -- Lock the owned parent first so replacement requests for one entry serialize.
  perform 1
    from public.adhdice_health_checkins as entry
   where entry.id = p_journal_entry_id
     and entry.user_id = v_user_id
   for update;
  if not found then
    raise exception using errcode = '42501', message = 'Journal Entry is unavailable for Trigger association changes.';
  end if;

  -- Validate every target, association, and optimistic baseline before mutation.
  for v_replacement in select value from jsonb_array_elements(p_replacements)
  loop
    if jsonb_typeof(v_replacement) is distinct from 'object'
       or jsonb_typeof(v_replacement -> 'occurrence_kind') is distinct from 'string'
       or jsonb_typeof(v_replacement -> 'occurrence_id') is distinct from 'string'
       or jsonb_typeof(v_replacement -> 'associations') is distinct from 'array'
       or jsonb_typeof(v_replacement -> 'expected_associations') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'Journal Trigger occurrence replacement is malformed.';
    end if;
    v_occurrence_kind := v_replacement ->> 'occurrence_kind';
    v_occurrence_id := (v_replacement ->> 'occurrence_id')::uuid;
    if v_occurrence_kind not in ('symptom', 'journal_signal') then
      raise exception using errcode = '22023', message = 'Journal Trigger occurrence kind is invalid.';
    end if;
    if (v_occurrence_kind || ':' || v_occurrence_id::text) = any(v_seen_occurrences) then
      raise exception using errcode = '22023', message = 'Journal Trigger replacement contains a duplicate occurrence.';
    end if;
    v_seen_occurrences := array_append(v_seen_occurrences, v_occurrence_kind || ':' || v_occurrence_id::text);

    v_occurrence_exists := false;
    if v_occurrence_kind = 'symptom' then
      perform 1 from public.adhdice_health_symptom_entries as occurrence
       where occurrence.id = v_occurrence_id
         and occurrence.user_id = v_user_id
         and occurrence.journal_entry_id = p_journal_entry_id
       for update;
      v_occurrence_exists := found;
    else
      perform 1 from public.adhdice_health_journal_signal_occurrences as occurrence
       where occurrence.id = v_occurrence_id
         and occurrence.user_id = v_user_id
         and occurrence.journal_entry_id = p_journal_entry_id
       for update;
      v_occurrence_exists := found;
    end if;
    if not v_occurrence_exists then
      raise exception using errcode = '42501', message = 'Feeling occurrence is unavailable for Trigger association changes.';
    end if;

    v_seen_triggers := array[]::uuid[];
    for v_association in select value from jsonb_array_elements(v_replacement -> 'associations')
    loop
      if jsonb_typeof(v_association) is distinct from 'object'
         or jsonb_typeof(v_association -> 'trigger_id') is distinct from 'string'
         or jsonb_typeof(v_association -> 'effect') is distinct from 'string'
         or not (v_association ? 'previous_score') then
        raise exception using errcode = '22023', message = 'Journal Trigger association is malformed.';
      end if;
      v_trigger_id := (v_association ->> 'trigger_id')::uuid;
      v_effect := v_association ->> 'effect';
      if v_effect not in ('associated', 'worsened', 'improved') then
        raise exception using errcode = '22023', message = 'Journal Trigger association effect is invalid.';
      end if;
      if v_trigger_id = any(v_seen_triggers) then
        raise exception using errcode = '22023', message = 'A Trigger can only be associated once with an occurrence.';
      end if;
      v_seen_triggers := array_append(v_seen_triggers, v_trigger_id);
      if v_association -> 'previous_score' = 'null'::jsonb then
        v_previous_score := null;
      elsif jsonb_typeof(v_association -> 'previous_score') = 'number'
        and (v_association ->> 'previous_score') ~ '^(0|[1-9][0-9]*)$' then
        v_previous_score := (v_association ->> 'previous_score')::integer;
      else
        raise exception using errcode = '22023', message = 'Previous score must be null or an integer from 0 through 10.';
      end if;
      if v_previous_score is not null and v_previous_score not between 0 and 10 then
        raise exception using errcode = '22023', message = 'Previous score must be between 0 and 10.';
      end if;
      if v_effect = 'associated' and v_previous_score is not null then
        raise exception using errcode = '22023', message = 'Associated Trigger links cannot include a previous score.';
      end if;
      select trigger_row.archived_at into v_trigger_archived_at
        from public.adhdice_health_journal_triggers as trigger_row
       where trigger_row.id = v_trigger_id and trigger_row.user_id = v_user_id
       for share;
      if not found then
        raise exception using errcode = '42501', message = 'Journal Trigger is unavailable to this user.';
      end if;
      if v_trigger_archived_at is not null then
        if (v_occurrence_kind = 'symptom' and not exists (
          select 1 from public.adhdice_health_journal_trigger_links as existing_link
           where existing_link.user_id = v_user_id and existing_link.symptom_occurrence_id = v_occurrence_id and existing_link.trigger_id = v_trigger_id
        )) or (v_occurrence_kind = 'journal_signal' and not exists (
          select 1 from public.adhdice_health_journal_trigger_links as existing_link
           where existing_link.user_id = v_user_id and existing_link.journal_signal_occurrence_id = v_occurrence_id and existing_link.trigger_id = v_trigger_id
        )) then
          raise exception using errcode = '23514', message = 'Archived Triggers cannot be added to new occurrences.';
        end if;
      end if;
    end loop;

    -- Existing archived Trigger links are valid historical links. Only ownership
    -- is checked above; the picker itself excludes archived Triggers for additions.
    v_seen_expected_triggers := array[]::uuid[];
    for v_expected in select value from jsonb_array_elements(v_replacement -> 'expected_associations')
    loop
      if jsonb_typeof(v_expected) is distinct from 'object'
         or jsonb_typeof(v_expected -> 'trigger_id') is distinct from 'string'
         or jsonb_typeof(v_expected -> 'effect') is distinct from 'string'
         or not (v_expected ? 'previous_score') then
        raise exception using errcode = '22023', message = 'Expected Journal Trigger association baseline is malformed.';
      end if;
      v_trigger_id := (v_expected ->> 'trigger_id')::uuid;
      if v_trigger_id = any(v_seen_expected_triggers) then
        raise exception using errcode = '22023', message = 'Expected Journal Trigger baseline contains a duplicate Trigger.';
      end if;
      v_seen_expected_triggers := array_append(v_seen_expected_triggers, v_trigger_id);
      if v_expected ->> 'effect' not in ('associated', 'worsened', 'improved') then
        raise exception using errcode = '22023', message = 'Expected Journal Trigger association effect is invalid.';
      end if;
      if v_expected -> 'previous_score' <> 'null'::jsonb
         and (jsonb_typeof(v_expected -> 'previous_score') <> 'number'
           or (v_expected ->> 'previous_score') !~ '^(0|[1-9][0-9]*)$'
           or (v_expected ->> 'previous_score')::integer not between 0 and 10) then
        raise exception using errcode = '22023', message = 'Expected previous score must be null or an integer from 0 through 10.';
      end if;
      if v_expected ->> 'effect' = 'associated' and v_expected -> 'previous_score' <> 'null'::jsonb then
        raise exception using errcode = '22023', message = 'Expected Associated Trigger links cannot include a previous score.';
      end if;
    end loop;

    if v_occurrence_kind = 'symptom' then
      select coalesce(jsonb_agg(jsonb_build_object('trigger_id', link.trigger_id, 'effect', link.effect, 'previous_score', link.previous_score) order by link.trigger_id), '[]'::jsonb)
        into v_current from public.adhdice_health_journal_trigger_links as link
       where link.user_id = v_user_id and link.symptom_occurrence_id = v_occurrence_id;
    else
      select coalesce(jsonb_agg(jsonb_build_object('trigger_id', link.trigger_id, 'effect', link.effect, 'previous_score', link.previous_score) order by link.trigger_id), '[]'::jsonb)
        into v_current from public.adhdice_health_journal_trigger_links as link
       where link.user_id = v_user_id and link.journal_signal_occurrence_id = v_occurrence_id;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('trigger_id', item ->> 'trigger_id', 'effect', item ->> 'effect', 'previous_score', item -> 'previous_score') order by item ->> 'trigger_id'), '[]'::jsonb)
      into v_expected from jsonb_array_elements(v_replacement -> 'expected_associations') as items(item);
    select coalesce(jsonb_agg(jsonb_build_object('trigger_id', item ->> 'trigger_id', 'effect', item ->> 'effect', 'previous_score', item -> 'previous_score') order by item ->> 'trigger_id'), '[]'::jsonb)
      into v_desired from jsonb_array_elements(v_replacement -> 'associations') as items(item);
    if v_current <> v_expected and v_current <> v_desired then
      raise exception using errcode = '40001', message = 'Journal Trigger associations changed elsewhere. Reload the Event before retrying.';
    end if;
  end loop;

  -- Apply every targeted replacement only after all inputs pass validation.
  for v_replacement in select value from jsonb_array_elements(p_replacements)
  loop
    v_occurrence_kind := v_replacement ->> 'occurrence_kind';
    v_occurrence_id := (v_replacement ->> 'occurrence_id')::uuid;
    if v_occurrence_kind = 'symptom' then
      delete from public.adhdice_health_journal_trigger_links as link
       where link.user_id = v_user_id
         and link.symptom_occurrence_id = v_occurrence_id
         and not exists (
           select 1 from jsonb_array_elements(v_replacement -> 'associations') as item(value)
            where (item.value ->> 'trigger_id')::uuid = link.trigger_id
         );
    else
      delete from public.adhdice_health_journal_trigger_links as link
       where link.user_id = v_user_id
         and link.journal_signal_occurrence_id = v_occurrence_id
         and not exists (
           select 1 from jsonb_array_elements(v_replacement -> 'associations') as item(value)
            where (item.value ->> 'trigger_id')::uuid = link.trigger_id
         );
    end if;

    for v_association in select value from jsonb_array_elements(v_replacement -> 'associations')
    loop
      v_trigger_id := (v_association ->> 'trigger_id')::uuid;
      v_effect := v_association ->> 'effect';
      v_previous_score := case when v_association -> 'previous_score' = 'null'::jsonb then null else (v_association ->> 'previous_score')::integer end;
      if v_occurrence_kind = 'symptom' then
        update public.adhdice_health_journal_trigger_links as link
           set effect = v_effect, previous_score = v_previous_score
         where link.user_id = v_user_id and link.symptom_occurrence_id = v_occurrence_id and link.trigger_id = v_trigger_id;
        if not found then
          insert into public.adhdice_health_journal_trigger_links (user_id, trigger_id, symptom_occurrence_id, effect, previous_score)
          values (v_user_id, v_trigger_id, v_occurrence_id, v_effect, v_previous_score);
        end if;
      else
        update public.adhdice_health_journal_trigger_links as link
           set effect = v_effect, previous_score = v_previous_score
         where link.user_id = v_user_id and link.journal_signal_occurrence_id = v_occurrence_id and link.trigger_id = v_trigger_id;
        if not found then
          insert into public.adhdice_health_journal_trigger_links (user_id, trigger_id, journal_signal_occurrence_id, effect, previous_score)
          values (v_user_id, v_trigger_id, v_occurrence_id, v_effect, v_previous_score);
        end if;
      end if;
    end loop;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(link) order by link.created_at, link.id), '[]'::jsonb)
    into v_result_links
    from public.adhdice_health_journal_trigger_links as link
   where link.user_id = v_user_id
     and exists (
       select 1
         from jsonb_array_elements(p_replacements) as target(value)
        where (target.value ->> 'occurrence_kind' = 'symptom' and link.symptom_occurrence_id = (target.value ->> 'occurrence_id')::uuid)
           or (target.value ->> 'occurrence_kind' = 'journal_signal' and link.journal_signal_occurrence_id = (target.value ->> 'occurrence_id')::uuid)
     );
  return jsonb_build_object('saved', true, 'target_count', jsonb_array_length(p_replacements), 'links', v_result_links);
end;
$function$;

revoke all on function public.adhdice_replace_health_journal_trigger_associations(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adhdice_replace_health_journal_trigger_associations(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
