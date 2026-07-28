begin;

create table if not exists public.adhdice_home_todo_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"schemaVersion":1,"taskIds":[],"clientUpdatedAt":"1970-01-01T00:00:00.000Z"}'::jsonb,
  client_updated_at timestamptz not null default '1970-01-01T00:00:00Z'::timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_home_todo_state_object check (jsonb_typeof(state) = 'object')
);

alter table public.adhdice_home_todo_state enable row level security;

drop policy if exists "Users can read their own Home todo state" on public.adhdice_home_todo_state;
create policy "Users can read their own Home todo state"
  on public.adhdice_home_todo_state for select using (auth.uid() = user_id);

drop policy if exists "Users can create their own Home todo state" on public.adhdice_home_todo_state;
create policy "Users can create their own Home todo state"
  on public.adhdice_home_todo_state for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own Home todo state" on public.adhdice_home_todo_state;
create policy "Users can update their own Home todo state"
  on public.adhdice_home_todo_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own Home todo state" on public.adhdice_home_todo_state;
create policy "Users can delete their own Home todo state"
  on public.adhdice_home_todo_state for delete using (auth.uid() = user_id);

drop trigger if exists adhdice_home_todo_state_set_updated_at on public.adhdice_home_todo_state;
create trigger adhdice_home_todo_state_set_updated_at
  before update on public.adhdice_home_todo_state
  for each row
  execute function public.adhdice_clean_set_updated_at();

alter publication supabase_realtime add table public.adhdice_home_todo_state;

notify pgrst, 'reload schema';

commit;
