-- ADHDice 7.13.38: manual occurrence Available Actions policy foundation.
-- SOURCE ONLY: author for review/application; do not apply or deploy automatically.
-- Existing rows are normalized to the Standard five-action set so this change
-- does not alter current user-visible behavior.

do $migration$
begin
  if to_regclass('public.adhdice_task_type_behavior_profiles') is null then
    raise exception '7.13.38 requires public.adhdice_task_type_behavior_profiles';
  end if;
  if to_regclass('public.adhdice_custom_behavior_ruleset_revisions') is null then
    raise exception '7.13.38 requires public.adhdice_custom_behavior_ruleset_revisions';
  end if;
end;
$migration$;

alter table public.adhdice_task_type_behavior_profiles
  add column if not exists available_actions text[];
alter table public.adhdice_task_type_behavior_profiles
  alter column available_actions set default array['done', 'did_my_best', 'missed', 'delay', 'complete']::text[];
update public.adhdice_task_type_behavior_profiles
set available_actions = (
  select coalesce(array_agg(allowed.action order by allowed.ordinality), '{}'::text[])
  from unnest(array['done', 'did_my_best', 'missed', 'delay', 'complete']::text[])
    with ordinality as allowed(action, ordinality)
  where allowed.action = any(coalesce(available_actions, array['done', 'did_my_best', 'missed', 'delay', 'complete']::text[]))
);
alter table public.adhdice_task_type_behavior_profiles
  alter column available_actions set not null;
alter table public.adhdice_task_type_behavior_profiles
  drop constraint if exists adhdice_task_type_behavior_profiles_available_actions_check;
alter table public.adhdice_task_type_behavior_profiles
  add constraint adhdice_task_type_behavior_profiles_available_actions_check
  check (available_actions <@ array['done', 'did_my_best', 'missed', 'delay', 'complete']::text[]);
alter table public.adhdice_task_type_behavior_profiles
  drop constraint if exists adhdice_task_type_behavior_profiles_available_actions_no_null_check;
alter table public.adhdice_task_type_behavior_profiles
  add constraint adhdice_task_type_behavior_profiles_available_actions_no_null_check
  check (array_position(available_actions, null) is null);

alter table public.adhdice_custom_behavior_ruleset_revisions
  add column if not exists available_actions text[];
alter table public.adhdice_custom_behavior_ruleset_revisions
  alter column available_actions set default array['done', 'did_my_best', 'missed', 'delay', 'complete']::text[];
update public.adhdice_custom_behavior_ruleset_revisions
set available_actions = (
  select coalesce(array_agg(allowed.action order by allowed.ordinality), '{}'::text[])
  from unnest(array['done', 'did_my_best', 'missed', 'delay', 'complete']::text[])
    with ordinality as allowed(action, ordinality)
  where allowed.action = any(coalesce(available_actions, array['done', 'did_my_best', 'missed', 'delay', 'complete']::text[]))
);
alter table public.adhdice_custom_behavior_ruleset_revisions
  alter column available_actions set not null;
alter table public.adhdice_custom_behavior_ruleset_revisions
  drop constraint if exists adhdice_custom_behavior_ruleset_revisions_available_actions_check;
alter table public.adhdice_custom_behavior_ruleset_revisions
  add constraint adhdice_custom_behavior_ruleset_revisions_available_actions_check
  check (available_actions <@ array['done', 'did_my_best', 'missed', 'delay', 'complete']::text[]);
alter table public.adhdice_custom_behavior_ruleset_revisions
  drop constraint if exists adhdice_custom_behavior_ruleset_revisions_available_actions_no_null_check;
alter table public.adhdice_custom_behavior_ruleset_revisions
  add constraint adhdice_custom_behavior_ruleset_revisions_available_actions_no_null_check
  check (array_position(available_actions, null) is null);
