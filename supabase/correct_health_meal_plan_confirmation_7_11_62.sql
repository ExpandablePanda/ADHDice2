-- ADHDice 7.11.62: Done marks a planned meal consumed at the confirmation time.
-- Authored only. Apply manually after review; this migration is not run by the app.

drop function if exists public.adhdice_confirm_health_meal_plan_entry(uuid);

create or replace function public.adhdice_confirm_health_meal_plan_entry(
  p_plan_entry_id uuid,
  p_actual_entry_date date
)
returns table (
  actual_meal_entry_id uuid,
  confirmed_at timestamptz,
  newly_created boolean
)
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.adhdice_health_meal_plan_entries%rowtype;
  v_actual_id uuid;
  v_confirmed_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into v_plan
    from public.adhdice_health_meal_plan_entries
   where id = p_plan_entry_id
     and user_id = v_user_id
   for update;

  if not found then
    raise exception 'Meal plan not found';
  end if;

  if v_plan.confirmed_at is not null then
    if v_plan.confirmed_meal_entry_id is null then
      raise exception 'Meal plan confirmation is incomplete';
    end if;
    return query
      select v_plan.confirmed_meal_entry_id, v_plan.confirmed_at, false;
    return;
  end if;

  insert into public.adhdice_health_meal_entries (
    user_id,
    entry_date,
    meal_slot,
    logged_at,
    food_name,
    brand_name,
    serving_label,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    barcode,
    provider,
    provider_item_id,
    attribution,
    source_food_id,
    consumed_quantity,
    consumed_unit,
    serving_fraction,
    food_snapshot,
    nutrition_snapshot
  ) values (
    v_user_id,
    p_actual_entry_date,
    v_plan.meal_slot,
    v_confirmed_at,
    v_plan.food_name,
    v_plan.brand_name,
    v_plan.serving_label,
    v_plan.calories,
    v_plan.protein_g,
    v_plan.carbs_g,
    v_plan.fat_g,
    v_plan.barcode,
    v_plan.provider,
    v_plan.provider_item_id,
    v_plan.attribution,
    v_plan.source_food_id,
    v_plan.consumed_quantity,
    v_plan.consumed_unit,
    v_plan.serving_fraction,
    v_plan.food_snapshot,
    v_plan.nutrition_snapshot
  ) returning id into v_actual_id;

  update public.adhdice_health_meal_plan_entries
     set confirmed_at = v_confirmed_at,
         confirmed_meal_entry_id = v_actual_id
   where id = v_plan.id
     and user_id = v_user_id
     and confirmed_at is null;

  return query
    select v_actual_id, v_confirmed_at, true;
end;
$$;

revoke all on function public.adhdice_confirm_health_meal_plan_entry(uuid, date) from public, anon;
grant execute on function public.adhdice_confirm_health_meal_plan_entry(uuid, date) to authenticated;

notify pgrst, 'reload schema';
