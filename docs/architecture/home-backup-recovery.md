# Home Backup and Recovery Foundation

Last reviewed: 2026-10-14
Role: current implementation and deployment contract

## Scope

Version 7.16.165 adds one shared, versioned recovery-point store and registers
Home Todo as its first domain. A point contains the full persisted Home Todo
JSON state, including ordered To-do, Urgent, and Routine IDs, section
assignments, day offsets, Scratchpad data, and other fields already present in
that row. Health, Journal, Focus, Task History, economy, and whole-app restore
are outside this foundation.

Each point records its owner, ID, database creation time, app and recovery
schema versions, trigger, domain manifest, payload byte count, SHA-256 digest,
verification state, and protection metadata. Payloads are stored in one
RLS-enabled table with no client table grants or row policies. Authenticated
users use owner-checked RPCs to list metadata, preview a point, request a
manual point, inspect capacity, and restore Home. The RPCs do not expose
another user's point IDs or payloads.

The snapshot and restore functions run inside PostgreSQL transactions. A
snapshot is inserted as pending, checked against its explicit payload version
and digest, marked verified, and only then is ordinary retention applied.
Any later storage or retention error rolls the entire snapshot change back;
the previous verified point remains. Protected points are not eligible for
rotation. Restore compares the current Home row revision and restore
generation from preview, validates the selected point and its Task references,
attempts a protected pre-restore point, then changes only the Home row and
increments its server revision and restore generation atomically.

The common point table and domain manifest allow later domains to join this
recovery system. New domains need an explicit payload version and validator;
they do not get a parallel backup table or browser download flow.

## Home write and stale-cache protection

Home state writes use save_home_todo_state instead of direct table upserts.
The RPC compares the caller's expected restore generation with the current
server generation while holding an owner lock. A mismatch returns the current
server snapshot as a restore conflict and does not write the submitted cache.

The Home browser cache now stores a versioned envelope with the server
revision and restore generation. Pre-7.16.165 raw-state caches are read as
generation zero. When a remote row has a different generation, the server row
wins regardless of either clientUpdatedAt value. A superseded meaningful
local cache is copied to an owner-scoped conflict key before the visible cache
is updated. Network failures leave the local state dirty and do not claim a
server save. Restore itself is not wired to a Settings screen in this release.

The revision also closes the old direct-write route for authenticated users.
Do not apply the migration while relying on 7.16.164 clients to continue
syncing: those clients do not know the RPC contract. Deployment requires a
coordinated database-first/app release and a plan for existing open clients.

## Approved limits and measurement

Defaults are stored in the server-only adhdice_recovery_settings row:

| Limit | Default | Enforcement |
| --- | ---: | --- |
| Automatic checkpoint interval | 4 hours | One database cycle checks all Home owners |
| Recovery points per user | 10 | Oldest unprotected point rotates after replacement verifies |
| Recovery table allocation | 50 MiB | pg_total_relation_size over the recovery-point table, including indexes and TOAST |
| Warning threshold | 40 MiB | Exposed by the owner-scoped status RPC |
| Whole database allocation | 400 MiB | New capture rolls back when the database is at or above the limit |

The payload byte count is UTF-8 bytes of PostgreSQL's uncompressed jsonb::text
representation. It is metadata and is not used as a substitute for allocated
storage. The table limit uses PostgreSQL relation allocation, including
index/TOAST space; deleted tuple space can remain allocated for reuse and can
therefore keep the measured table above the budget until maintenance. Whole
database size uses pg_database_size(current_database()). Status also reports
the owner's current point count, latest verified point, latest attempt, and
latest failed attempt and reason.

The status table stores one bounded latest-attempt record per owner rather than
an unbounded attempt history. It is not included in the 50 MiB recovery-payload
table budget. No capacity path deletes live Tasks or any other ADHDice data.

## Migration and activation

The source migration is
supabase/20261014000000_home_backup_recovery_foundation_7_16_165.sql.
It has **not** been applied to any production database. Applying it creates the
tables and functions and revokes authenticated direct Home writes; that is a
production behavior change and needs its separate release review.

The project currently has no pg_cron extension. To prepare deployment:

1. Review the migration and its table-allocation measurements against a
   disposable PostgreSQL database.
2. Confirm the hosted project's PostgreSQL version, current database size,
   backup retention policy, and maintenance process for relation bloat.
3. In the Supabase Dashboard, enable pg_cron from **Integrations → Cron** (or
   **Database → Extensions**, depending on the Dashboard surface).
4. Apply the recovery migration only after approval and before shipping a
   client that calls save_home_todo_state.
5. Keep automatic capture disabled until a separate activation review. After
   that review, execute
   supabase/activate_home_recovery_cron.sql as postgres. It creates one job
   named adhdice-home-recovery-4h at minute 0 every four hours and calls the
   database-local cycle. The cycle iterates users in one transaction; it makes
   no HTTP request and does not depend on browser sessions.
6. Verify the single job in cron.job, then inspect cron.job_run_details and
   home_recovery_status() after its first approved run.

This ticket creates the activation script only. It does not enable
pg_cron, apply the migration, or schedule any production job. Supabase
documents that Cron uses the pg_cron extension and supports SQL/function
jobs managed through the Dashboard or SQL:
[Cron](https://supabase.com/docs/guides/cron),
[Cron installation](https://supabase.com/docs/guides/cron/install).

## Rollback

If Cron has been approved and activated, first remove only the named job with
select cron.unschedule(jobid) from cron.job where jobname =
'adhdice-home-recovery-4h';. Do not disable the shared pg_cron extension if
other jobs use it.

Do not drop recovery tables or points as a routine rollback. If the database
migration was applied but no Home restore has ever completed, use
supabase/rollback_home_backup_recovery_7_16_165.sql after disabling Cron. Its
guard refuses rollback after any Home restore. Then the app can be rolled back
to a version that uses direct Home writes. Keep the revision columns and
recovery data.
If any restore has completed (restore_generation > 0), an older client
cannot enforce the generation fence; use a fix-forward client that retains the
RPC contract. Never restore direct write access or discard the generation
columns after a restore.

## Verification boundaries

The SQL migration and activation script are source artifacts only. Production
SQL, production Cron, live Home data, and browser behavior are not changed or
verified by this ticket. The owner-scoped RPC contracts and generation fence
must pass focused local database and Home hydration tests before release.
