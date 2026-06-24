do $$
begin
  if to_regtype('public.adhdice_clean_task_repeat_monthly_mode') is null then
    create type public.adhdice_clean_task_repeat_monthly_mode as enum ('day_of_month', 'ordinal_weekday');
  end if;
end
$$;

do $$
begin
  if to_regtype('public.adhdice_clean_task_repeat_monthly_ordinal') is null then
    create type public.adhdice_clean_task_repeat_monthly_ordinal as enum ('first', 'second', 'third', 'fourth', 'last');
  end if;
end
$$;

alter table public.adhdice_clean_tasks
  add column if not exists repeat_monthly_mode public.adhdice_clean_task_repeat_monthly_mode not null default 'day_of_month',
  add column if not exists repeat_monthly_ordinal public.adhdice_clean_task_repeat_monthly_ordinal,
  add column if not exists repeat_monthly_weekday smallint;

alter table public.adhdice_clean_tasks
  drop constraint if exists adhdice_clean_tasks_repeat_monthly_weekday_check,
  add constraint adhdice_clean_tasks_repeat_monthly_weekday_check
    check (repeat_monthly_weekday is null or (repeat_monthly_weekday >= 0 and repeat_monthly_weekday <= 6)),
  drop constraint if exists adhdice_clean_tasks_repeat_monthly_ordinal_fields_check,
  add constraint adhdice_clean_tasks_repeat_monthly_ordinal_fields_check
    check (
      (repeat_monthly_mode = 'day_of_month' and repeat_monthly_ordinal is null and repeat_monthly_weekday is null)
      or (repeat_monthly_mode = 'ordinal_weekday' and repeat_monthly_ordinal is not null and repeat_monthly_weekday is not null)
    );
