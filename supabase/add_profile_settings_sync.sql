alter table public.adhdice_user_profiles
  add column if not exists accent_color text,
  add column if not exists day_start_time text not null default '06:00',
  add column if not exists low_stim_mode boolean not null default false,
  add column if not exists theme_preference text not null default 'light'
    check (theme_preference in ('light', 'dark'));
