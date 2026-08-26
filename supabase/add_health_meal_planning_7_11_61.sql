-- ADHDice 7.11.61: planned meal occurrences remain separate from actual meal entries.
-- Authored only. Apply manually after review; this migration is not run by the app.

create table if not exists public.adhdice_health_meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_date date not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  planned_time time not null,
  -- Canonical timestamp captured from the user's local date/time at planning time.
  planned_at timestamptz not null,
  food_name text not null check (char_length(trim(food_name)) > 0),
  brand_name text,
  serving_label text,
  calories integer not null default 0 check (calories >= 0),
  protein_g numeric(7,2) check (protein_g is null or protein_g >= 0),
  carbs_g numeric(7,2) check (carbs_g is null or carbs_g >= 0),
  fat_g numeric(7,2) check (fat_g is null or fat_g >= 0),
  barcode text,
  provider text not null default 'manual',
  provider_item_id text,
  attribution text,
  source_food_id text,
  consumed_quantity numeric check (consumed_quantity is null or consumed_quantity > 0),
  consumed_unit text check (consumed_unit is null or char_length(trim(consumed_unit)) > 0),
  serving_fraction numeric check (serving_fraction is null or serving_fraction > 0),
  food_snapshot jsonb,
  nutrition_snapshot jsonb,
  confirmed_at timestamptz,
  -- Deliberately not a foreign key: deleting a later actual entry must not
  -- clear the confirmation audit anchor or make the plan active again.
  confirmed_meal_entry_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adhdice_health_meal_plan_entries_user_date_idx
  on public.adhdice_health_meal_plan_entries (user_id, planned_date, planned_time);
create index if not exists adhdice_health_meal_plan_entries_user_active_idx
  on public.adhdice_health_meal_plan_entries (user_id, confirmed_at, planned_date, planned_time);

alter table public.adhdice_health_meal_plan_entries enable row level security;

revoke all on table public.adhdice_health_meal_plan_entries from anon, authenticated;
grant select, insert, update, delete on table public.adhdice_health_meal_plan_entries to authenticated;

drop policy if exists "Users can read their own health meal plans"
  on public.adhdice_health_meal_plan_entries;
create policy "Users can read their own health meal plans"
  on public.adhdice_health_meal_plan_entries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own health meal plans"
  on public.adhdice_health_meal_plan_entries;
create policy "Users can create their own health meal plans"
  on public.adhdice_health_meal_plan_entries
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own health meal plans"
  on public.adhdice_health_meal_plan_entries;
create policy "Users can update their own health meal plans"
  on public.adhdice_health_meal_plan_entries
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own health meal plans"
  on public.adhdice_health_meal_plan_entries;
create policy "Users can delete their own health meal plans"
  on public.adhdice_health_meal_plan_entries
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop trigger if exists adhdice_health_meal_plan_entries_set_updated_at
  on public.adhdice_health_meal_plan_entries;
create trigger adhdice_health_meal_plan_entries_set_updated_at
  before update on public.adhdice_health_meal_plan_entries
  for each row
  execute function public.adhdice_clean_set_updated_at();

create or replace function public.adhdice_confirm_health_meal_plan_entry(
  p_plan_entry_id uuid
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
  v_confirmed_at timestamptz;
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

  if v_plan.confirmed_at is not null and v_plan.confirmed_meal_entry_id is not null then
    return query
      select v_plan.confirmed_meal_entry_id, v_plan.confirmed_at, false;
    return;
  end if;

  if v_plan.planned_at > now() then
    raise exception 'Meal plan time is still in the future';
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
    v_plan.planned_date,
    v_plan.meal_slot,
    v_plan.planned_at,
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

  v_confirmed_at := now();
  update public.adhdice_health_meal_plan_entries
     set confirmed_at = v_confirmed_at,
         confirmed_meal_entry_id = v_actual_id
   where id = v_plan.id;

  return query
    select v_actual_id, v_confirmed_at, true;
end;
$$;

revoke all on function public.adhdice_confirm_health_meal_plan_entry(uuid) from public, anon;
grant execute on function public.adhdice_confirm_health_meal_plan_entry(uuid) to authenticated;

notify pgrst, 'reload schema';
