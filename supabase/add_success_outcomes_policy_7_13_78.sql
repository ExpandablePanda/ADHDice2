-- ADHDice 7.13.78: effective-dated configurable positive-streak Success Outcomes.
-- SOURCE ONLY: author for review/application; do not apply to live Supabase automatically.
-- Existing rows retain current behavior because all three operational positive
-- outcomes are selected by default.

do $migration$
begin
  if to_regclass('public.adhdice_task_type_behavior_profiles') is null then
    raise exception '7.13.78 requires public.adhdice_task_type_behavior_profiles';
  end if;
  if to_regclass('public.adhdice_custom_behavior_ruleset_revisions') is null then
    raise exception '7.13.78 requires public.adhdice_custom_behavior_ruleset_revisions';
  end if;
end;
$migration$;

alter table public.adhdice_task_type_behavior_profiles
  add column if not exists success_outcomes text[] not null default array['done', 'did_my_best', 'complete']::text[];
alter table public.adhdice_task_type_behavior_profiles
  alter column success_outcomes set default array['done', 'did_my_best', 'complete']::text[];
update public.adhdice_task_type_behavior_profiles
set success_outcomes = array['done', 'did_my_best', 'complete']::text[]
where success_outcomes is null;
alter table public.adhdice_task_type_behavior_profiles
  alter column success_outcomes set not null;
alter table public.adhdice_task_type_behavior_profiles
  drop constraint if exists adhdice_task_type_behavior_profiles_success_outcomes_check;
alter table public.adhdice_task_type_behavior_profiles
  add constraint adhdice_task_type_behavior_profiles_success_outcomes_check
  check (success_outcomes <@ array['done', 'did_my_best', 'complete']::text[]);
alter table public.adhdice_task_type_behavior_profiles
  drop constraint if exists adhdice_task_type_behavior_profiles_success_outcomes_no_null_check;
alter table public.adhdice_task_type_behavior_profiles
  add constraint adhdice_task_type_behavior_profiles_success_outcomes_no_null_check
  check (array_position(success_outcomes, null) is null);

alter table public.adhdice_custom_behavior_ruleset_revisions
  add column if not exists success_outcomes text[] not null default array['done', 'did_my_best', 'complete']::text[];
alter table public.adhdice_custom_behavior_ruleset_revisions
  alter column success_outcomes set default array['done', 'did_my_best', 'complete']::text[];
update public.adhdice_custom_behavior_ruleset_revisions
set success_outcomes = array['done', 'did_my_best', 'complete']::text[]
where success_outcomes is null;
alter table public.adhdice_custom_behavior_ruleset_revisions
  alter column success_outcomes set not null;
alter table public.adhdice_custom_behavior_ruleset_revisions
  drop constraint if exists adhdice_custom_behavior_ruleset_revisions_success_outcomes_check;
alter table public.adhdice_custom_behavior_ruleset_revisions
  add constraint adhdice_custom_behavior_ruleset_revisions_success_outcomes_check
  check (success_outcomes <@ array['done', 'did_my_best', 'complete']::text[]);
alter table public.adhdice_custom_behavior_ruleset_revisions
  drop constraint if exists adhdice_custom_behavior_ruleset_revisions_success_outcomes_no_null_check;
alter table public.adhdice_custom_behavior_ruleset_revisions
  add constraint adhdice_custom_behavior_ruleset_revisions_success_outcomes_no_null_check
  check (array_position(success_outcomes, null) is null);
