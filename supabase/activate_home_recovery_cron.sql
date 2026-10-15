-- Apply only after pg_cron is enabled and deployment review approves activation.
-- The migration intentionally does not install pg_cron or create a live job.
do $activation$
declare
  v_job record;
begin
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron must be enabled before scheduling Home recovery';
  end if;
  if current_user <> 'postgres' then
    raise exception 'schedule the Home recovery cycle as postgres so the job owner can execute the private cycle function';
  end if;
  for v_job in
    select jobid from cron.job where jobname = 'adhdice-home-recovery-4h'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
  perform cron.schedule(
    'adhdice-home-recovery-4h',
    '0 */4 * * *',
    'select public.run_home_recovery_checkpoint_cycle();'
  );
end;
$activation$;
