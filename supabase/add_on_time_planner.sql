create table if not exists public.adhdice_on_time_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_state jsonb not null default '{"schemaVersion":1,"destinationLabel":"","arriveAt":null,"timezone":"UTC","travelMinutes":null,"arrivalBufferMinutes":0,"items":[],"clientUpdatedAt":"1970-01-01T00:00:00.000Z"}'::jsonb,
  client_updated_at timestamptz not null default '1970-01-01T00:00:00Z'::timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_on_time_plans_plan_state_object check (jsonb_typeof(plan_state) = 'object')
);

alter table public.adhdice_on_time_plans enable row level security;

drop policy if exists "Users can read their own On-Time plan" on public.adhdice_on_time_plans;
create policy "Users can read their own On-Time plan" on public.adhdice_on_time_plans for select using (auth.uid() = user_id);
drop policy if exists "Users can create their own On-Time plan" on public.adhdice_on_time_plans;
create policy "Users can create their own On-Time plan" on public.adhdice_on_time_plans for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update their own On-Time plan" on public.adhdice_on_time_plans;
create policy "Users can update their own On-Time plan" on public.adhdice_on_time_plans for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own On-Time plan" on public.adhdice_on_time_plans;
create policy "Users can delete their own On-Time plan" on public.adhdice_on_time_plans for delete using (auth.uid() = user_id);

drop trigger if exists adhdice_on_time_plans_set_updated_at on public.adhdice_on_time_plans;
create trigger adhdice_on_time_plans_set_updated_at before update on public.adhdice_on_time_plans
  for each row execute function public.adhdice_clean_set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_on_time_plans'
  ) then
    alter publication supabase_realtime add table public.adhdice_on_time_plans;
  end if;
end $$;
