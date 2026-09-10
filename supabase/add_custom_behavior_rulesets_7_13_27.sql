-- ADHDice 7.13.27: reusable named Custom behavior rulesets.
-- SOURCE ONLY: author for review/application; do not apply to live Supabase automatically.
-- Existing Task, History, Pursuit, and Goal rows are not migrated or reassigned.

create table if not exists public.adhdice_custom_behavior_rulesets (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  task_type text not null default 'custom',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  constraint adhdice_custom_behavior_rulesets_name_check
    check (length(btrim(name)) > 0),
  constraint adhdice_custom_behavior_rulesets_task_type_check
    check (task_type = 'custom'),
  constraint adhdice_custom_behavior_rulesets_user_id_id_key
    unique (user_id, id)
);

create table if not exists public.adhdice_custom_behavior_ruleset_revisions (
  ruleset_id uuid not null references public.adhdice_custom_behavior_rulesets(id) on delete cascade,
  effective_from_logical_date date not null,
  unresolved_occurrence text not null default 'missed',
  positive_streak_on_unhandled text not null default 'break',
  missed_streak_on_unhandled text not null default 'increment',
  rewards text not null default 'enabled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ruleset_id, effective_from_logical_date),
  constraint adhdice_custom_behavior_ruleset_revisions_unresolved_occurrence_check
    check (unresolved_occurrence in ('missed', 'blank')),
  constraint adhdice_custom_behavior_ruleset_revisions_positive_streak_check
    check (positive_streak_on_unhandled in ('break', 'preserve')),
  constraint adhdice_custom_behavior_ruleset_revisions_missed_streak_check
    check (missed_streak_on_unhandled in ('increment', 'ignore')),
  constraint adhdice_custom_behavior_ruleset_revisions_rewards_check
    check (rewards in ('enabled', 'disabled'))
);

alter table if exists public.adhdice_clean_tasks
  add column if not exists custom_ruleset_id uuid;

do $$
begin
  if to_regclass('public.adhdice_clean_tasks') is not null
    and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.adhdice_clean_tasks'::regclass
        and conname = 'adhdice_clean_tasks_custom_ruleset_task_type_check'
    ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_custom_ruleset_task_type_check
      check (custom_ruleset_id is null or task_type = 'custom');
  end if;
  if to_regclass('public.adhdice_clean_tasks') is not null
    and not exists (
      select 1 from pg_constraint
      where conrelid = 'public.adhdice_clean_tasks'::regclass
        and conname = 'adhdice_clean_tasks_custom_ruleset_owner_fkey'
    ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_custom_ruleset_owner_fkey
      foreign key (user_id, custom_ruleset_id)
      references public.adhdice_custom_behavior_rulesets(user_id, id)
      on delete set null (custom_ruleset_id);
  end if;
end;
$$;

create index if not exists adhdice_custom_behavior_rulesets_user_id_idx
  on public.adhdice_custom_behavior_rulesets(user_id);
create index if not exists adhdice_custom_behavior_ruleset_revisions_ruleset_id_idx
  on public.adhdice_custom_behavior_ruleset_revisions(ruleset_id, effective_from_logical_date);
create index if not exists adhdice_clean_tasks_custom_ruleset_id_idx
  on public.adhdice_clean_tasks(custom_ruleset_id)
  where custom_ruleset_id is not null;

alter table public.adhdice_custom_behavior_rulesets enable row level security;
alter table public.adhdice_custom_behavior_ruleset_revisions enable row level security;

revoke all on table public.adhdice_custom_behavior_rulesets from anon, authenticated;
revoke all on table public.adhdice_custom_behavior_ruleset_revisions from anon, authenticated;
grant select, insert, update, delete on table public.adhdice_custom_behavior_rulesets to authenticated;
grant select, insert, update, delete on table public.adhdice_custom_behavior_ruleset_revisions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_custom_behavior_rulesets'
      and policyname = 'Users can read their own Custom behavior rulesets'
  ) then
    create policy "Users can read their own Custom behavior rulesets"
      on public.adhdice_custom_behavior_rulesets for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_custom_behavior_rulesets'
      and policyname = 'Users can create their own Custom behavior rulesets'
  ) then
    create policy "Users can create their own Custom behavior rulesets"
      on public.adhdice_custom_behavior_rulesets for insert
      to authenticated
      with check ((select auth.uid()) = user_id and task_type = 'custom');
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_custom_behavior_rulesets'
      and policyname = 'Users can update their own Custom behavior rulesets'
  ) then
    create policy "Users can update their own Custom behavior rulesets"
      on public.adhdice_custom_behavior_rulesets for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id and task_type = 'custom');
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_custom_behavior_rulesets'
      and policyname = 'Users can delete their own Custom behavior rulesets'
  ) then
    create policy "Users can delete their own Custom behavior rulesets"
      on public.adhdice_custom_behavior_rulesets for delete
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_custom_behavior_ruleset_revisions'
      and policyname = 'Users can read their own Custom behavior ruleset revisions'
  ) then
    create policy "Users can read their own Custom behavior ruleset revisions"
      on public.adhdice_custom_behavior_ruleset_revisions for select
      to authenticated
      using (exists (
        select 1 from public.adhdice_custom_behavior_rulesets ruleset
        where ruleset.id = ruleset_id and ruleset.user_id = (select auth.uid())
      ));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_custom_behavior_ruleset_revisions'
      and policyname = 'Users can create their own Custom behavior ruleset revisions'
  ) then
    create policy "Users can create their own Custom behavior ruleset revisions"
      on public.adhdice_custom_behavior_ruleset_revisions for insert
      to authenticated
      with check (exists (
        select 1 from public.adhdice_custom_behavior_rulesets ruleset
        where ruleset.id = ruleset_id and ruleset.user_id = (select auth.uid())
      ));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_custom_behavior_ruleset_revisions'
      and policyname = 'Users can update their own Custom behavior ruleset revisions'
  ) then
    create policy "Users can update their own Custom behavior ruleset revisions"
      on public.adhdice_custom_behavior_ruleset_revisions for update
      to authenticated
      using (exists (
        select 1 from public.adhdice_custom_behavior_rulesets ruleset
        where ruleset.id = ruleset_id and ruleset.user_id = (select auth.uid())
      ))
      with check (exists (
        select 1 from public.adhdice_custom_behavior_rulesets ruleset
        where ruleset.id = ruleset_id and ruleset.user_id = (select auth.uid())
      ));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_custom_behavior_ruleset_revisions'
      and policyname = 'Users can delete their own Custom behavior ruleset revisions'
  ) then
    create policy "Users can delete their own Custom behavior ruleset revisions"
      on public.adhdice_custom_behavior_ruleset_revisions for delete
      to authenticated
      using (exists (
        select 1 from public.adhdice_custom_behavior_rulesets ruleset
        where ruleset.id = ruleset_id and ruleset.user_id = (select auth.uid())
      ));
  end if;
end;
$$;
