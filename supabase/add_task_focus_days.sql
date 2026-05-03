create table if not exists public.adhdice_task_focus_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  focus_date date not null,
  task_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, focus_date)
);

create index if not exists adhdice_task_focus_days_user_date_idx
  on public.adhdice_task_focus_days (user_id, focus_date desc);

alter table public.adhdice_task_focus_days enable row level security;

drop policy if exists "Users can read their own task focus days" on public.adhdice_task_focus_days;
create policy "Users can read their own task focus days"
  on public.adhdice_task_focus_days
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own task focus days" on public.adhdice_task_focus_days;
create policy "Users can create their own task focus days"
  on public.adhdice_task_focus_days
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own task focus days" on public.adhdice_task_focus_days;
create policy "Users can update their own task focus days"
  on public.adhdice_task_focus_days
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own task focus days" on public.adhdice_task_focus_days;
create policy "Users can delete their own task focus days"
  on public.adhdice_task_focus_days
  for delete
  using (auth.uid() = user_id);

drop trigger if exists adhdice_task_focus_days_set_updated_at on public.adhdice_task_focus_days;
create trigger adhdice_task_focus_days_set_updated_at
  before update on public.adhdice_task_focus_days
  for each row
  execute function public.adhdice_clean_set_updated_at();

alter publication supabase_realtime add table public.adhdice_task_focus_days;
