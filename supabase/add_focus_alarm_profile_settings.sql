alter table public.adhdice_user_profiles
  add column if not exists focus_alarm_enabled boolean not null default false,
  add column if not exists focus_alarm_interval_minutes integer not null default 20
    check (focus_alarm_interval_minutes between 5 and 120);
