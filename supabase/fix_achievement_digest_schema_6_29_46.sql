-- Qualify Achievement runtime pgcrypto calls for functions with an empty search path.
-- Apply after add_achievement_mvp_foundation.sql and add_achievement_mvp_runtime.sql.
-- Safe to reapply: CREATE OR REPLACE preserves tables, rows, ownership, and grants.
begin;

do $migration$
declare
  v_signature text;
  v_target regprocedure;
  v_targets regprocedure[] := array[]::regprocedure[];
  v_definition text;
  v_rewritten text;
begin
  foreach v_signature in array array[
    'public.adhdice_refresh_achievement_step_set(uuid,uuid)',
    'public.adhdice_rebuild_achievement_progress(uuid,uuid,timestamp with time zone)'
  ] loop
    v_target := to_regprocedure(v_signature);
    if v_target is null then
      raise exception 'Required Achievement runtime function is missing: %', v_signature;
    end if;
    v_targets := array_append(v_targets, v_target);
  end loop;

  foreach v_target in array v_targets loop
    v_signature := v_target::text;
    select pg_get_functiondef(v_target) into v_definition;
    v_rewritten := regexp_replace(
      v_definition,
      '(^|[^[:alnum:]_.])digest[[:space:]]*\(',
      '\1extensions.digest(',
      'g'
    );
    v_rewritten := replace(
      replace(
        replace(
          v_rewritten,
          'extensions.digest(v_occurrence_ids::text, ''sha256'')',
          'extensions.digest(v_occurrence_ids::text, ''sha256''::text)'
        ),
        'extensions.digest(v_set_key, ''sha256'')',
        'extensions.digest(v_set_key::text, ''sha256''::text)'
      ),
      'extensions.digest(required_tracks::text,''sha256'')',
      'extensions.digest(required_tracks::text, ''sha256''::text)'
    );

    if v_rewritten ~ '(^|[^[:alnum:]_.])digest[[:space:]]*\(' then
      raise exception 'Unqualified digest call remains in %', v_signature;
    end if;

    execute v_rewritten;
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
