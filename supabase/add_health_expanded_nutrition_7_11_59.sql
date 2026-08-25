-- ADHDice 7.11.59: expanded Food Nutrition Facts.
-- Additive only. Existing foods remain NULL and historical meal JSON is untouched.
alter table public.adhdice_health_food_library
  add column if not exists nutrition_details jsonb;
