-- ADHDice 7.7.1: preserve structured meal consumption and immutable nutrition snapshots.
-- This migration is intentionally additive. Existing legacy meals remain unchanged.

alter table public.adhdice_health_meal_entries
  add column if not exists source_food_id text,
  add column if not exists consumed_quantity numeric
    check (consumed_quantity is null or consumed_quantity > 0),
  add column if not exists consumed_unit text
    check (consumed_unit is null or char_length(trim(consumed_unit)) > 0),
  add column if not exists serving_fraction numeric
    check (serving_fraction is null or serving_fraction > 0),
  add column if not exists food_snapshot jsonb,
  add column if not exists nutrition_snapshot jsonb;

notify pgrst, 'reload schema';
