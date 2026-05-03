create table if not exists public.adhdice_task_grid_layouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  layout_json text not null default '[]',
  updated_at timestamptz not null default now()
);

create index if not exists adhdice_task_grid_layouts_updated_at_idx
  on public.adhdice_task_grid_layouts (updated_at desc);

alter table public.adhdice_task_grid_layouts enable row level security;

drop policy if exists "Users can read their own task grid layouts" on public.adhdice_task_grid_layouts;
create policy "Users can read their own task grid layouts"
  on public.adhdice_task_grid_layouts
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own task grid layouts" on public.adhdice_task_grid_layouts;
create policy "Users can create their own task grid layouts"
  on public.adhdice_task_grid_layouts
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own task grid layouts" on public.adhdice_task_grid_layouts;
create policy "Users can update their own task grid layouts"
  on public.adhdice_task_grid_layouts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own task grid layouts" on public.adhdice_task_grid_layouts;
create policy "Users can delete their own task grid layouts"
  on public.adhdice_task_grid_layouts
  for delete
  using (auth.uid() = user_id);

drop trigger if exists adhdice_task_grid_layouts_set_updated_at on public.adhdice_task_grid_layouts;
create trigger adhdice_task_grid_layouts_set_updated_at
  before update on public.adhdice_task_grid_layouts
  for each row
  execute function public.adhdice_clean_set_updated_at();

alter publication supabase_realtime add table public.adhdice_task_grid_layouts;
