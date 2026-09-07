-- ADHDice 7.13.1: allow Pursuits to belong to a Task without entering the Task engine.
-- Authored only. Apply manually after review; this migration is not run by the app.

begin;

alter table public.adhdice_pursuits
  add column if not exists parent_task_id uuid;

alter table public.adhdice_pursuits
  drop constraint if exists adhdice_pursuits_parent_kind_ck;
alter table public.adhdice_pursuits
  add constraint adhdice_pursuits_parent_kind_ck
  check (not (parent_pursuit_id is not null and parent_task_id is not null));

alter table public.adhdice_pursuits
  drop constraint if exists adhdice_pursuits_parent_task_fk;
alter table public.adhdice_pursuits
  add constraint adhdice_pursuits_parent_task_fk
  foreign key (user_id, parent_task_id)
  references public.adhdice_clean_tasks (user_id, id)
  on delete set null (parent_task_id);

create index if not exists adhdice_pursuits_user_task_parent_idx
  on public.adhdice_pursuits (user_id, parent_task_id, sort_order, created_at desc);

notify pgrst, 'reload schema';

commit;
