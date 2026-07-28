begin;

alter table public.adhdice_health_food_library
  add column if not exists category text,
  add column if not exists serving_size text,
  add column if not exists serving_weight_amount numeric(9,2)
    check (serving_weight_amount is null or serving_weight_amount > 0),
  add column if not exists serving_weight_unit text
    check (serving_weight_unit is null or serving_weight_unit in ('g', 'oz', 'fl_oz'));

update public.adhdice_health_food_library
set serving_size = serving_label
where serving_size is null
  and serving_label is not null;

notify pgrst, 'reload schema';

commit;
