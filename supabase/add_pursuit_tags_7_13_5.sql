-- ADHDice 7.13.5: additive Pursuit-native tags.
-- Author for review only. Do not apply directly to a live database.
begin;

alter table public.adhdice_pursuits
  add column if not exists tags text[] not null default '{}';

notify pgrst, 'reload schema';
commit;
