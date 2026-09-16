-- ADHDice 7.13.18: effective-dated per-user TaskType behavior profiles.
-- SOURCE ONLY: this reviewed migration must not be applied automatically.
-- It intentionally does not migrate existing Task, Pursuit, History, or reward data.

create table if not exists public.adhdice_task_type_behavior_profiles (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_type text not null,
  effective_from_logical_date date not null,
  unresolved_occurrence text not null default 'missed',
  positive_streak_on_unhandled text not null default 'break',
  missed_streak_on_unhandled text not null default 'increment',
  rewards text not null default 'enabled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, task_type, effective_from_logical_date),
  constraint adhdice_task_type_behavior_profiles_task_type_check
    check (task_type in ('task', 'pursuit', 'goal', 'custom')),
  constraint adhdice_task_type_behavior_profiles_unresolved_occurrence_check
    check (unresolved_occurrence in ('missed', 'blank')),
  constraint adhdice_task_type_behavior_profiles_positive_streak_check
    check (positive_streak_on_unhandled in ('break', 'preserve')),
  constraint adhdice_task_type_behavior_profiles_missed_streak_check
    check (missed_streak_on_unhandled in ('increment', 'ignore')),
  constraint adhdice_task_type_behavior_profiles_rewards_check
    check (rewards in ('enabled', 'disabled'))
);

alter table public.adhdice_task_type_behavior_profiles enable row level security;

revoke all on table public.adhdice_task_type_behavior_profiles from anon, authenticated;
grant select, insert, update, delete on table public.adhdice_task_type_behavior_profiles to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_task_type_behavior_profiles'
      and policyname = 'Users can read their own TaskType behavior profiles'
  ) then
    create policy "Users can read their own TaskType behavior profiles"
      on public.adhdice_task_type_behavior_profiles for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_task_type_behavior_profiles'
      and policyname = 'Users can create their own TaskType behavior profiles'
  ) then
    create policy "Users can create their own TaskType behavior profiles"
      on public.adhdice_task_type_behavior_profiles for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_task_type_behavior_profiles'
      and policyname = 'Users can update their own TaskType behavior profiles'
  ) then
    create policy "Users can update their own TaskType behavior profiles"
      on public.adhdice_task_type_behavior_profiles for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_task_type_behavior_profiles'
      and policyname = 'Users can delete their own TaskType behavior profiles'
  ) then
    create policy "Users can delete their own TaskType behavior profiles"
      on public.adhdice_task_type_behavior_profiles for delete
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end;
$$;
