begin;

-- The live 7.11.46 application briefly used this misspelled index name.
-- Keep the repository migration history aligned without changing data or schema.
drop index if exists public.adhdice_health_workout_sets_user_exercise_order_indx;

create index if not exists adhdice_health_workout_sets_user_exercise_order_idx
  on public.adhdice_health_workout_sets (user_id, workout_exercise_id, sort_order, created_at);

commit;
