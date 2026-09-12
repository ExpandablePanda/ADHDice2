-- ADHDice 7.13.41: effective-dated Task Needs Action trigger policy.
-- SOURCE ONLY: author for review/application; do not apply to live Supabase automatically.
-- Existing rows are normalized to the Standard three-trigger set so this
-- additive field preserves the 7.13.40 Attention classification by default.

do $migration$
begin
  if to_regclass('public.adhdice_task_type_behavior_profiles') is null then
    raise exception '7.13.41 requires public.adhdice_task_type_behavior_profiles';
  end if;
  if to_regclass('public.adhdice_custom_behavior_ruleset_revisions') is null then
    raise exception '7.13.41 requires public.adhdice_custom_behavior_ruleset_revisions';
  end if;
end;
$migration$;

alter table public.adhdice_task_type_behavior_profiles
  add column if not exists needs_action_triggers text[];
alter table public.adhdice_task_type_behavior_profiles
  alter column needs_action_triggers set default array['missed', 'due_today', 'overdue']::text[];
update public.adhdice_task_type_behavior_profiles as profile
set needs_action_triggers = (
  select coalesce(array_agg(allowed.trigger_name order by allowed.ordinality), '{}'::text[])
  from unnest(array['missed', 'due_today', 'overdue']::text[])
    with ordinality as allowed(trigger_name, ordinality)
  where allowed.trigger_name = any(coalesce(profile.needs_action_triggers, array['missed', 'due_today', 'overdue']::text[]))
);
alter table public.adhdice_task_type_behavior_profiles
  alter column needs_action_triggers set not null;
alter table public.adhdice_task_type_behavior_profiles
  drop constraint if exists adhdice_task_type_behavior_profiles_needs_action_triggers_check;
alter table public.adhdice_task_type_behavior_profiles
  add constraint adhdice_task_type_behavior_profiles_needs_action_triggers_check
  check (needs_action_triggers <@ array['missed', 'due_today', 'overdue']::text[]);
alter table public.adhdice_task_type_behavior_profiles
  drop constraint if exists adhdice_task_type_behavior_profiles_needs_action_triggers_no_null_check;
alter table public.adhdice_task_type_behavior_profiles
  add constraint adhdice_task_type_behavior_profiles_needs_action_triggers_no_null_check
  check (array_position(needs_action_triggers, null) is null);

alter table public.adhdice_custom_behavior_ruleset_revisions
  add column if not exists needs_action_triggers text[];
alter table public.adhdice_custom_behavior_ruleset_revisions
  alter column needs_action_triggers set default array['missed', 'due_today', 'overdue']::text[];
update public.adhdice_custom_behavior_ruleset_revisions as ruleset_row
set needs_action_triggers = (
  select coalesce(array_agg(allowed.trigger_name order by allowed.ordinality), '{}'::text[])
  from unnest(array['missed', 'due_today', 'overdue']::text[])
    with ordinality as allowed(trigger_name, ordinality)
  where allowed.trigger_name = any(coalesce(ruleset_row.needs_action_triggers, array['missed', 'due_today', 'overdue']::text[]))
);
alter table public.adhdice_custom_behavior_ruleset_revisions
  alter column needs_action_triggers set not null;
alter table public.adhdice_custom_behavior_ruleset_revisions
  drop constraint if exists adhdice_custom_behavior_ruleset_revisions_needs_action_triggers_check;
alter table public.adhdice_custom_behavior_ruleset_revisions
  add constraint adhdice_custom_behavior_ruleset_revisions_needs_action_triggers_check
  check (needs_action_triggers <@ array['missed', 'due_today', 'overdue']::text[]);
alter table public.adhdice_custom_behavior_ruleset_revisions
  drop constraint if exists adhdice_custom_behavior_ruleset_revisions_needs_action_triggers_no_null_check;
alter table public.adhdice_custom_behavior_ruleset_revisions
  add constraint adhdice_custom_behavior_ruleset_revisions_needs_action_triggers_no_null_check
  check (array_position(needs_action_triggers, null) is null);
