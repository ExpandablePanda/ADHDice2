-- ADHDice 7.14.18: Task Content Folders.
-- This is additive. It intentionally does not model folders as Tasks or Task State entities.

create table if not exists public.adhdice_task_content_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_task_content_folders_name_check
    check (name = trim(name) and char_length(name) between 1 and 120),
  constraint adhdice_task_content_folders_user_id_id_key unique (user_id, id)
);

alter table public.adhdice_task_content_folders enable row level security;
revoke all on table public.adhdice_task_content_folders from anon, authenticated;
grant select, insert, update, delete on table public.adhdice_task_content_folders to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_task_content_folders'
      and policyname = 'Users can read their own Task Content Folders'
  ) then
    create policy "Users can read their own Task Content Folders"
      on public.adhdice_task_content_folders
      for select to authenticated
      using ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_task_content_folders'
      and policyname = 'Users can create their own Task Content Folders'
  ) then
    create policy "Users can create their own Task Content Folders"
      on public.adhdice_task_content_folders
      for insert to authenticated
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_task_content_folders'
      and policyname = 'Users can update their own Task Content Folders'
  ) then
    create policy "Users can update their own Task Content Folders"
      on public.adhdice_task_content_folders
      for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'adhdice_task_content_folders'
      and policyname = 'Users can delete their own Task Content Folders'
  ) then
    create policy "Users can delete their own Task Content Folders"
      on public.adhdice_task_content_folders
      for delete to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;

alter table public.adhdice_clean_tasks
  add column if not exists task_content_folder_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_parent_task_content_folder_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_parent_task_content_folder_check
      check (parent_task_id is null or task_content_folder_id is null);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_task_content_folder_owner_fkey'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_task_content_folder_owner_fkey
      foreign key (user_id, task_content_folder_id)
      references public.adhdice_task_content_folders(user_id, id)
      on delete set null (task_content_folder_id);
  end if;
end
$$;

create index if not exists adhdice_clean_tasks_content_folder_membership_idx
  on public.adhdice_clean_tasks (user_id, task_content_folder_id)
  where task_content_folder_id is not null;

drop trigger if exists adhdice_task_content_folders_set_updated_at
  on public.adhdice_task_content_folders;
create trigger adhdice_task_content_folders_set_updated_at
  before update on public.adhdice_task_content_folders
  for each row
  execute function public.adhdice_clean_set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_publication p on p.oid = pr.prpubid
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'adhdice_task_content_folders'
  ) then
    alter publication supabase_realtime add table public.adhdice_task_content_folders;
  end if;
end
$$;
