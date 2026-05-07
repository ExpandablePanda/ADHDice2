-- Fix RLS on append-only audit tables.
--
-- adhdice_point_ledger, adhdice_roll_history, and adhdice_task_events are
-- meant to be an uneditable paper trail. The original "for all" policy
-- accidentally allowed users to UPDATE or DELETE their own rows, which would
-- let them erase or alter their transaction history.
--
-- This migration drops those broad policies and replaces them with
-- SELECT + INSERT only, so rows can be written but never modified or removed.

-- ── point_ledger ─────────────────────────────────────────────────────────────

drop policy if exists "Users manage own ledger" on public.adhdice_point_ledger;

create policy "Users can read own ledger"
  on public.adhdice_point_ledger
  for select
  using (auth.uid() = user_id);

create policy "Users can append to own ledger"
  on public.adhdice_point_ledger
  for insert
  with check (auth.uid() = user_id);

-- ── roll_history ──────────────────────────────────────────────────────────────

drop policy if exists "Users manage own roll history" on public.adhdice_roll_history;

create policy "Users can read own roll history"
  on public.adhdice_roll_history
  for select
  using (auth.uid() = user_id);

create policy "Users can append to own roll history"
  on public.adhdice_roll_history
  for insert
  with check (auth.uid() = user_id);

-- ── task_events ───────────────────────────────────────────────────────────────

drop policy if exists "Users manage own task events" on public.adhdice_task_events;

create policy "Users can read own task events"
  on public.adhdice_task_events
  for select
  using (auth.uid() = user_id);

create policy "Users can append to own task events"
  on public.adhdice_task_events
  for insert
  with check (auth.uid() = user_id);
