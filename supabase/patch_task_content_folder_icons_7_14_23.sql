-- ADHDice 7.14.23: Persist the user-selectable Lucide icon for Task Content Folders.
-- Additive and rerunnable: existing and new Folders resolve to the standard Folder icon.

alter table public.adhdice_task_content_folders
  add column if not exists icon_key text not null default 'folder';

update public.adhdice_task_content_folders
set icon_key = 'folder'
where icon_key is null;

alter table public.adhdice_task_content_folders
  alter column icon_key set default 'folder',
  alter column icon_key set not null;
