alter table public.adhdice_focus_categories
  add column if not exists secondary_subtype public.adhdice_clean_focus_subtype,
  add column if not exists type_label text,
  add column if not exists subtype_label text,
  add column if not exists secondary_subtype_label text,
  add column if not exists daily_goal_seconds integer,
  add column if not exists weekly_goal_seconds integer;

alter table public.adhdice_focus_categories
  drop constraint if exists adhdice_focus_categories_daily_goal_seconds_check,
  drop constraint if exists adhdice_focus_categories_weekly_goal_seconds_check;

alter table public.adhdice_focus_categories
  add constraint adhdice_focus_categories_daily_goal_seconds_check
    check (daily_goal_seconds is null or daily_goal_seconds >= 0),
  add constraint adhdice_focus_categories_weekly_goal_seconds_check
    check (weekly_goal_seconds is null or weekly_goal_seconds >= 0);
