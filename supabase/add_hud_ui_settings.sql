create table if not exists public.adhdice_hud_ui_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  hud_state jsonb,
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_hud_ui_settings_hud_state_is_object
    check (hud_state is null or jsonb_typeof(hud_state) = 'object')
);

create index if not exists adhdice_hud_ui_settings_updated_at_idx
  on public.adhdice_hud_ui_settings (updated_at desc);

alter table public.adhdice_hud_ui_settings enable row level security;

drop policy if exists "Users can read their own HUD UI settings" on public.adhdice_hud_ui_settings;
create policy "Users can read their own HUD UI settings"
  on public.adhdice_hud_ui_settings
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own HUD UI settings" on public.adhdice_hud_ui_settings;
create policy "Users can create their own HUD UI settings"
  on public.adhdice_hud_ui_settings
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own HUD UI settings" on public.adhdice_hud_ui_settings;
create policy "Users can update their own HUD UI settings"
  on public.adhdice_hud_ui_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own HUD UI settings" on public.adhdice_hud_ui_settings;
create policy "Users can delete their own HUD UI settings"
  on public.adhdice_hud_ui_settings
  for delete
  using (auth.uid() = user_id);

drop trigger if exists adhdice_hud_ui_settings_set_updated_at on public.adhdice_hud_ui_settings;
create trigger adhdice_hud_ui_settings_set_updated_at
  before update on public.adhdice_hud_ui_settings
  for each row
  execute function public.adhdice_clean_set_updated_at();

alter publication supabase_realtime add table public.adhdice_hud_ui_settings;
