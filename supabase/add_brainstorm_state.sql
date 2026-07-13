create table if not exists public.adhdice_brainstorm_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source_markdown text not null default '',
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  client_updated_at timestamptz not null,
  constraint adhdice_brainstorm_state_answers_object check (jsonb_typeof(answers) = 'object')
);

alter table public.adhdice_brainstorm_state enable row level security;

drop policy if exists "Users can read their own Brainstorm state" on public.adhdice_brainstorm_state;
create policy "Users can read their own Brainstorm state" on public.adhdice_brainstorm_state for select using (auth.uid() = user_id);
drop policy if exists "Users can create their own Brainstorm state" on public.adhdice_brainstorm_state;
create policy "Users can create their own Brainstorm state" on public.adhdice_brainstorm_state for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update their own Brainstorm state" on public.adhdice_brainstorm_state;
create policy "Users can update their own Brainstorm state" on public.adhdice_brainstorm_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own Brainstorm state" on public.adhdice_brainstorm_state;
create policy "Users can delete their own Brainstorm state" on public.adhdice_brainstorm_state for delete using (auth.uid() = user_id);

drop trigger if exists adhdice_brainstorm_state_set_updated_at on public.adhdice_brainstorm_state;
create trigger adhdice_brainstorm_state_set_updated_at before update on public.adhdice_brainstorm_state
  for each row execute function public.adhdice_clean_set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'adhdice_brainstorm_state'
  ) then
    alter publication supabase_realtime add table public.adhdice_brainstorm_state;
  end if;
end $$;
