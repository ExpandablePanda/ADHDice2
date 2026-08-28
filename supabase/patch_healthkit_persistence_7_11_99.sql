begin;

-- Live HealthKit data is a separate source from legacy XML/ZIP imports.
alter table public.adhdice_health_metric_entries
  drop constraint if exists adhdice_health_metric_entries_source_check;
alter table public.adhdice_health_metric_entries
  add constraint adhdice_health_metric_entries_source_check
  check (source in ('manual', 'apple_health_import', 'apple_health'));

alter table public.adhdice_health_weight_entries
  add column if not exists source_external_id text;
alter table public.adhdice_health_weight_entries
  drop constraint if exists adhdice_health_weight_entries_source_check;
alter table public.adhdice_health_weight_entries
  add constraint adhdice_health_weight_entries_source_check
  check (source in ('manual', 'apple_health_import', 'apple_health'));
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.adhdice_health_weight_entries'::regclass
       and conname = 'adhdice_health_weight_entries_user_source_external_id_key'
  ) then
    alter table public.adhdice_health_weight_entries
      add constraint adhdice_health_weight_entries_user_source_external_id_key
      unique (user_id, source, source_external_id);
  end if;
end
$$;

drop index if exists public.adhdice_health_workouts_user_source_external_id_idx;
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.adhdice_health_workouts'::regclass
       and conname = 'adhdice_health_workouts_user_source_external_id_key'
  ) then
    alter table public.adhdice_health_workouts
      add constraint adhdice_health_workouts_user_source_external_id_key
      unique (user_id, source, source_external_id);
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
