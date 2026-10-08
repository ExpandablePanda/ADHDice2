-- ADHDice 7.16.116: user-owned Journal Trigger definitions and occurrence links.
-- Authored source only. Review and apply manually; this migration is not run by the app.

begin;

create table if not exists public.adhdice_health_journal_triggers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint adhdice_health_journal_triggers_name_nonempty_check
    check (char_length(trim(name)) > 0)
);

create table if not exists public.adhdice_health_journal_trigger_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_id uuid not null,
  symptom_occurrence_id uuid,
  journal_signal_occurrence_id uuid,
  effect text not null,
  previous_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_health_journal_trigger_links_occurrence_check
    check (num_nonnulls(symptom_occurrence_id, journal_signal_occurrence_id) = 1),
  constraint adhdice_health_journal_trigger_links_effect_check
    check (effect in ('associated', 'worsened', 'improved')),
  constraint adhdice_health_journal_trigger_links_previous_score_check
    check (previous_score is null or previous_score between 0 and 10),
  constraint adhdice_health_journal_trigger_links_associated_score_check
    check (effect <> 'associated' or previous_score is null),
  constraint adhdice_health_journal_trigger_links_trigger_fk
    foreign key (user_id, trigger_id)
    references public.adhdice_health_journal_triggers (user_id, id)
    on delete cascade,
  constraint adhdice_health_journal_trigger_links_symptom_occurrence_fk
    foreign key (user_id, symptom_occurrence_id)
    references public.adhdice_health_symptom_entries (user_id, id)
    on delete cascade,
  constraint adhdice_health_journal_trigger_links_signal_occurrence_fk
    foreign key (user_id, journal_signal_occurrence_id)
    references public.adhdice_health_journal_signal_occurrences (user_id, id)
    on delete cascade,
  unique (user_id, id)
);

create unique index if not exists adhdice_health_journal_triggers_user_name_uidx
  on public.adhdice_health_journal_triggers (user_id, lower(name));
create unique index if not exists adhdice_health_journal_trigger_links_symptom_uidx
  on public.adhdice_health_journal_trigger_links (user_id, trigger_id, symptom_occurrence_id)
  where symptom_occurrence_id is not null;
create unique index if not exists adhdice_health_journal_trigger_links_signal_uidx
  on public.adhdice_health_journal_trigger_links (user_id, trigger_id, journal_signal_occurrence_id)
  where journal_signal_occurrence_id is not null;
create index if not exists adhdice_health_journal_trigger_links_trigger_idx
  on public.adhdice_health_journal_trigger_links (user_id, trigger_id, created_at);
create index if not exists adhdice_health_journal_trigger_links_symptom_occurrence_idx
  on public.adhdice_health_journal_trigger_links (user_id, symptom_occurrence_id)
  where symptom_occurrence_id is not null;
create index if not exists adhdice_health_journal_trigger_links_signal_occurrence_idx
  on public.adhdice_health_journal_trigger_links (user_id, journal_signal_occurrence_id)
  where journal_signal_occurrence_id is not null;

create or replace function public.adhdice_normalize_health_journal_trigger_name()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  if char_length(new.name) = 0 then
    raise exception using
      errcode = '23514',
      message = 'Journal Trigger name cannot be empty.';
  end if;
  return new;
end;
$function$;

alter table public.adhdice_health_journal_triggers enable row level security;
alter table public.adhdice_health_journal_trigger_links enable row level security;
revoke all on table public.adhdice_health_journal_triggers from anon, authenticated;
revoke all on table public.adhdice_health_journal_trigger_links from anon, authenticated;
grant select, insert, update, delete on table public.adhdice_health_journal_triggers to authenticated;
grant select, insert, update, delete on table public.adhdice_health_journal_trigger_links to authenticated;

drop policy if exists "Users can read their own health journal triggers"
  on public.adhdice_health_journal_triggers;
drop policy if exists "Users can create their own health journal triggers"
  on public.adhdice_health_journal_triggers;
drop policy if exists "Users can update their own health journal triggers"
  on public.adhdice_health_journal_triggers;
drop policy if exists "Users can delete their own health journal triggers"
  on public.adhdice_health_journal_triggers;
create policy "Users can read their own health journal triggers"
  on public.adhdice_health_journal_triggers for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create their own health journal triggers"
  on public.adhdice_health_journal_triggers for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own health journal triggers"
  on public.adhdice_health_journal_triggers for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own health journal triggers"
  on public.adhdice_health_journal_triggers for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their own health journal trigger links"
  on public.adhdice_health_journal_trigger_links;
drop policy if exists "Users can create their own health journal trigger links"
  on public.adhdice_health_journal_trigger_links;
drop policy if exists "Users can update their own health journal trigger links"
  on public.adhdice_health_journal_trigger_links;
drop policy if exists "Users can delete their own health journal trigger links"
  on public.adhdice_health_journal_trigger_links;
create policy "Users can read their own health journal trigger links"
  on public.adhdice_health_journal_trigger_links for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can create their own health journal trigger links"
  on public.adhdice_health_journal_trigger_links for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own health journal trigger links"
  on public.adhdice_health_journal_trigger_links for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own health journal trigger links"
  on public.adhdice_health_journal_trigger_links for delete to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists adhdice_health_journal_triggers_normalize_name
  on public.adhdice_health_journal_triggers;
create trigger adhdice_health_journal_triggers_normalize_name
  before insert or update of name on public.adhdice_health_journal_triggers
  for each row execute function public.adhdice_normalize_health_journal_trigger_name();
drop trigger if exists adhdice_health_journal_triggers_set_updated_at
  on public.adhdice_health_journal_triggers;
create trigger adhdice_health_journal_triggers_set_updated_at
  before update on public.adhdice_health_journal_triggers
  for each row execute function public.adhdice_clean_set_updated_at();
drop trigger if exists adhdice_health_journal_trigger_links_set_updated_at
  on public.adhdice_health_journal_trigger_links;
create trigger adhdice_health_journal_trigger_links_set_updated_at
  before update on public.adhdice_health_journal_trigger_links
  for each row execute function public.adhdice_clean_set_updated_at();

notify pgrst, 'reload schema';

commit;
