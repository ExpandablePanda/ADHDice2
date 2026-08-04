begin;

alter table public.adhdice_health_food_library
  add column if not exists food_category text default 'Uncategorized'
    check (char_length(trim(food_category)) > 0),
  add column if not exists serving_quantity numeric default 1
    check (serving_quantity > 0),
  add column if not exists serving_unit text default 'serving'
    check (char_length(trim(serving_unit)) > 0),
  add column if not exists serving_measure_value numeric
    check (serving_measure_value is null or serving_measure_value > 0),
  add column if not exists serving_measure_unit text
    check (serving_measure_unit is null or serving_measure_unit in ('g', 'oz', 'ml', 'fl_oz'));

update public.adhdice_health_food_library
set food_category = coalesce(nullif(trim(category), ''), 'Uncategorized')
where food_category is null
   or trim(food_category) = ''
   or (food_category = 'Uncategorized' and category is not null and trim(category) <> '');

update public.adhdice_health_food_library
set serving_quantity = 1
where serving_quantity is null or serving_quantity <= 0;

update public.adhdice_health_food_library
set serving_unit = 'serving'
where serving_unit is null or trim(serving_unit) = '';

alter table public.adhdice_health_food_library
  alter column food_category set default 'Uncategorized',
  alter column food_category set not null,
  alter column serving_quantity set default 1,
  alter column serving_quantity set not null,
  alter column serving_unit set default 'serving',
  alter column serving_unit set not null;

notify pgrst, 'reload schema';

commit;
