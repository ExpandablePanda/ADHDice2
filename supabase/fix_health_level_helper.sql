create or replace function public.adhdice_level_from_xp(p_xp integer)
returns integer
language plpgsql
immutable
as $body$
declare
  v_level integer := 1;
  v_safe_xp integer := greatest(coalesce(p_xp, 0), 0);
  v_threshold integer := 100;
begin
  while v_safe_xp >= v_threshold loop
    v_level := v_level + 1;
    v_threshold := 100 + ((v_level - 1) * 200);
  end loop;

  return v_level;
end;
$body$;
