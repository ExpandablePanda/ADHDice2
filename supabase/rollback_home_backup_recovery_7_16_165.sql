-- Use only after disabling the optional Cron job and before rolling back the
-- client, and only if no Home restore has ever completed.
begin;

do $rollback_guard$
begin
  if exists (
    select 1
    from public.adhdice_home_todo_state
    where restore_generation > 0
  ) then
    raise exception 'fix forward: a Home restore generation exists and older clients cannot enforce it';
  end if;
end;
$rollback_guard$;

drop policy if exists "Users can create their own Home todo state" on public.adhdice_home_todo_state;
create policy "Users can create their own Home todo state"
  on public.adhdice_home_todo_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own Home todo state" on public.adhdice_home_todo_state;
create policy "Users can update their own Home todo state"
  on public.adhdice_home_todo_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own Home todo state" on public.adhdice_home_todo_state;
create policy "Users can delete their own Home todo state"
  on public.adhdice_home_todo_state for delete
  using (auth.uid() = user_id);

grant insert, update, delete on public.adhdice_home_todo_state to authenticated;

-- Recovery points and revision columns are intentionally retained.
commit;
