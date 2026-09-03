# Current State

Last reviewed: 2026-09-02
Role: active working

## Current Release

- Current working app version: `7.12.73`.
- Current release group: `7.12.x` overnight Quick Fix bundle.
- Version surfaces that should stay aligned for code-changing implementation work:
  - `package.json`
  - `package-lock.json`
  - `public/app-version.json`
  - visible `APP_VERSION` / `HUD_VERSION` constants in `src/components/task-app.tsx`

## 2026-09-02 7.12.63 Health Report Nutrition Semantics and Presentation

Health Report nutrition target comparisons are descriptive: above target,
below target, or at target, without generic success/failure wording.
Incomplete macro coverage remains explicit, with null nutrients unknown and
numeric zero preserved as known data. Feeling/Symptom occurrence grammar is
singular or plural as appropriate, and Current Health Goals formats Sleep
with the shared human-readable duration formatter. Underlying Food/provider
nutrition anomalies are intentionally not repaired by Reports. No SQL,
schema, or persistence changes were made.

## 2026-09-02 7.12.62 Detailed Report Due Authority

Detailed ADHDice Report `Due` now uses the canonical presentation `due_on`
projection also shown by Table/List. Internal `active_occurrence_due_on` no
longer overrides the user-facing Due field. No Health reporting behavior
changed, and no SQL, schema, or persistence changes were made.

## 2026-09-02 7.12.61 ADHDice Report Health and Task Metadata

The existing Tasks -> Reports workspace now extends the copied/previewed
ADHDice Report with range-specific Health read data from persisted authority:
Food/Nutrition, confirmed Water, Journal, Feelings, Symptoms, Weight,
Movement, the Health sleep selector, and Workouts. Current Health goals and
settings are included as context and are not represented as historical goal
snapshots. Health Awards and Fitness Plans remain deferred from the behavioral
report.

All Available now includes dates from the fetched Health domains. Summary stays
compact and analytical; Detailed adds user-facing Health records and current
Task metadata including canonical Due, time, Energy, estimates, actual time,
Lists, Tags, links, and Notes. Task list names use the current membership
projection and retain the warning that historical membership is unavailable.
Health reads are independent of Health page activation, paginated for
unbounded ranges, and report domain failures as warnings without fabricating
zero data. No SQL, schema change, Health persistence change, Task State
authority change, report persistence, or Calendar work was added; Calendar
remains paused.

## 2026-09-01 7.12.59 Recurring Success Occurrence Identity

Recurring Done, Did My Best, and Complete outcomes now resolve and persist the
occurrence they actually satisfy through the canonical Task State authority.
Fixed recurrence targets the nearest scheduled occurrence on or after the
handled date; rolling recurrence resolves the current rolling obligation and
advances from its canonical cursor. Legacy identity-less successful History
facts self-heal during in-memory canonical read/replay when a prior Missed fact
makes the target safe to infer. Historical Missed facts remain preserved, and
Table/List, Calendar, and other projections continue to consume the shared
canonical result. No SQL, schema migration, or manual production-row repair
was used.

## 2026-09-02 7.12.60 Canonical Due Projection and Rolling Missed-Streak Read

Canonical current Due now travels through the shared Task read projection
alongside Active Status, so Table/List and related task surfaces no longer
rely on stale compatibility `due_on` when the engine derives a different
cursor. The projection revision includes canonical Due changes. Legacy rolling
success replay handles an already-advanced task cursor and closes the prior
active Missed streak while preserving historical Missed facts. The Play New
Game production Task was manually rescheduled by the user and was not altered
or repaired by this ticket. No SQL, schema change, or manual production data
repair was used.

## 2026-09-01 7.12.58 Metadata Home Navigation and Description Placement

Completed full-editor metadata edits now return to Summary after explicit
Save, Apply, terminal choice, or submit-key actions. Multi-select,
intermediate, textarea-blur, and ongoing timer interactions remain open until
Back; full-editor Delay returns to Summary after successful Apply without
closing Edit Task. Parent Description moved from the left column to the right
metadata card and follows the active Parent, Step, or Substep target. No SQL,
schema, or persistence changes were made.

## 2026-09-01 7.12.57 Edit Task Metadata Summary Navigation

The Metadata Summary is now the full-editor metadata home screen. The redundant
horizontal Metadata navigator was removed; existing property rows still open
the existing editors, and each non-Summary property editor provides a Back to
Summary control. Summary uses a compact responsive one-, two-, and three-column
layout. No persistence, schema, or SQL changes were made.

## 2026-09-01 7.12.56 Edit Task Metadata Summary

The full Edit Task inspector now defaults to a presentation-only Summary for
each newly opened Task, Step, or supported Substep metadata target. Summary
covers Title, Status, Priority, Energy, Due, Repeat, Estimated, Actual, Lists,
Tags, Link, and Notes; each property row routes into its existing editor.
Manual property selection remains open for the current target, while explicit
property focus requests still override the Summary default. No SQL, schema, or
persistence changes were made.

## 2026-09-01 7.12.55 Health Today Timeline

Health Today now adds a chronological Timeline beneath the existing Snapshot
and Quick Log. Timeline rows derive Food, Water, Feeling, Workout, Weight,
Journal, and precise Sleep events from canonical Health records, with no Today
persistence authority. Aggregate movement metrics and imported Sleep totals do
not receive fabricated activity times. No SQL or schema changes were made.

## 2026-09-01 7.12.54 Health Today Snapshot foundation

Health Today now provides a canonical-record-derived Snapshot for Journal,
Food, Water, Sleep, and Movement, plus Quick Log routes into the existing
Health tabs and forms. No Today database or persistence authority was added;
the chronological Today Timeline remains next. No SQL or schema changes were
made.

## 2026-09-01 7.12.53 Logged food calorie emphasis correction

Logged-food calories are emphasized inline within the existing metadata summary;
the standalone calorie line introduced in 7.12.52 was removed. The
snapshot-first calorie authority remains shared by logged cards and meal
totals, while planned food cards remain unchanged. No SQL or schema changes
were made.

## 2026-09-01 7.12.52 Logged food calorie readability

Individual logged foods in Health > Food now expose calories as a dedicated,
prominent line using the existing snapshot-first meal calorie authority. Meal
section totals and logged meal nutrition remain unchanged; planned food cards
are unchanged. The logged-card summary omits its calorie portion to avoid
duplicate display. No SQL or schema changes were made.

## 2026-09-01 7.12.51 Health Settings tab

Health Settings is now the final Health tab. The existing Health Settings
panel moved intact into that tab and no longer renders beneath every Health
section. The existing `profileDraft` and `saveProfile` profile persistence
authority remains unchanged. No SQL or schema changes were made.

## 2026-09-01 7.12.48 Journal QA and Feeling Trends UX

Journal History cards now keep Logged metadata collapsed independently per
entry, with `created_at` as the immutable Logged timestamp authority and
`MM/DD/YYYY` plus 12-hour AM/PM display when expanded. Core ratings and custom
Daily Template Feelings now flow through one responsive grid: one column on
mobile, two at medium widths, and three in the normal wide desktop Journal
pane; split mode remains at two columns for readability.

Feeling Trends now uses a grouped multi-select for All Feelings, category-all
groups, and individual cross-category blends. Selected no-history Feelings stay
selectable without zero-filled series, while active and archived-with-history
definition visibility remains unchanged. Successful Journal Save and Update
actions reuse `startNewJournalEntry()` to open a fresh entry while preserving
the selected Journal date and split workspace mode. No SQL, migration, or
schema changes were made.

## 2026-09-01 7.12.49 Journal rating cards, trend averages, and History dates

Journal core ratings and custom Feelings now use one shared rating-card design;
core cards show their scale descriptors, and the nested custom Feeling
`Not logged` shell is removed. Feeling Trends chips show a range-sensitive
visible-point average per Feeling, formatted as `Avg. N/10`, while selected
no-history Feelings still produce no chart line or zero chip. Journal History
date groups are independently collapsible by canonical `entry_date`, with
per-entry Logged metadata disclosure remaining independent. No SQL, migration,
schema, or persistence-model changes were made.

## 2026-09-01 7.12.50 Feeling Trends range polish

Feeling Trends now offers `1D`, `3D`, `7D`, `30D`, `90D`, and `All` in that
order. The 1D range is limited to the as-of date, the 3D range includes the
as-of date and prior two calendar dates, and existing longer/all-range
semantics remain unchanged. Existing per-Feeling visible-point averages and
no-zero-fill behavior apply automatically to the new ranges. No SQL or schema
changes were made.

## 2026-09-01 7.12.45 Journal UX correction

Journal now uses one responsive History/Journal toggle: short press switches
between Entry and History, while desktop long press or `ArrowDown` opens the
compact History Left/Right dock menu. Split History remains desktop-only, and
History mode keeps `+ New Entry`. Logged Date/Time metadata is collapsed behind
a chevron; Logged Date uses `MM/DD/YYYY`, and Logged Time reuses the compact
read-only AM/PM treatment. Core ratings and custom Daily Template Feelings now
share one `How are you feeling?` section, and all Journal scale pickers can be
closed without selecting a score. Feeling Trends include every active Feeling,
retain archived Feelings with occurrence history, and show occurrence notes in
History hashtag popovers. No SQL or schema changes were made.

## 2026-09-01 7.12.46 Journal metadata sizing correction

Journal and Logged Time now share one fixed compact `8.5rem × 32px` control
contract through `HealthStandardTimeInput` in both editable and read-only modes,
while retaining normalized storage and 12-hour AM/PM display. Journal Date and
Logged Date retain matching compact width, height, border, spacing, and responsive
typography; Logged Date remains read-only and uses `MM/DD/YYYY`. No SQL or schema
changes were made.

## 2026-09-01 7.12.47 Journal unsaved metadata sizing correction

Unsaved Logged Time now uses the shared read-only `HealthStandardTimeInput`
placeholder treatment, so `When saved` has the same compact `8.5rem × 32px`
control size as Journal Time and saved Logged Time without presenting a fake
timestamp. Unsaved Logged Date remains `When saved` with matching Journal Date
sizing. No SQL or schema changes were made.

## 2026-09-01 7.12.44 Journal workspace QA corrections

Journal workspace split controls (`History Left` and `History Right`) are now
desktop-only at `md+`; narrow screens retain the normal History single-pane
action. History-only mode now exposes `+ New Entry` in the workspace header and
uses the existing `startNewJournalEntry()` authority, while split-mode Entry
actions continue to preserve split mode. No SQL, schema, or migration changes
were made.

## 2026-09-01 7.12.43 Journal Feeling ownership, time display, and workspace

Journal is now the only rendered workspace for Feeling Occurrences. Symptom
occurrences are Journal-owned by required `journal_entry_id`; the authored-only
`supabase/enforce_health_feeling_journal_ownership_7_12_43.sql` removes known
orphan test rows, enforces the constraint, and verifies the cascade FK. It has
NOT been applied remotely.

Journal displays Journal Date/Time separately from immutable Logged Date/Time,
using the shared compact 12-hour AM/PM control for Journal and occurrence
times. Entry and History are one responsive workspace with exact-ID editing,
desktop History Left/Right split options, and a mobile single-pane fallback.

Feeling Trends graph raw timestamped occurrences for Symptoms, Emotions, and
Other Feelings as separate colored series, including archived definitions;
Daily Log snapshot ratings are excluded. Focused source/tests were updated.
Browser, live Supabase, deployment, full build, typecheck, and full-suite
verification remain outstanding.

## 2026-08-31 7.12.41 Journal snapshots and Feeling Occurrences

Journal Entries are now identified by row `id`, so multiple timestamped
snapshots may share one `entry_date`. Each snapshot requires an `entry_time`,
while immutable `created_at` remains the actual Logged time. The Journal editor
now combines core metrics and explicit Journal Library `in_template` Feelings
under `How are you feeling?` / `Your Daily Template`. Snapshot ratings remain
separate per Journal Entry and retain 0 versus Not logged semantics.

Symptoms, Emotions, and Other Feelings are presented as unified `Feeling
Occurrences`. Hashtags create occurrence drafts only; they do not add template
Feelings or snapshot ratings. Canonical symptom occurrences continue using
`adhdice_health_symptom_entries`; Emotion and Other Feeling occurrences persist
through `adhdice_health_journal_signal_occurrences` with 1–10 scores and
occurrence timestamps. The authored migration is
`supabase/add_health_journal_multiple_entries_7_12_41.sql`; it has NOT been
applied remotely. No schema deployment was performed. Browser, live Supabase,
and deployment verification remain outstanding.

## 2026-09-01 7.12.42 Journal persistence hardening

The approved 7.12.41 Journal architecture is preserved. Its authored-only
migration is hardened before live deployment with idempotent occurrence-table
policies/triggers, and database validation now restricts native Feeling
Occurrences to Emotion and Other signals. The migration remains NOT remotely
applied; no live schema deployment was performed. Focused source and
persistence checks cover the guard and preserve canonical symptom occurrence
storage.

## 2026-08-31 7.12.40 Journal Feeling overlay color picker

The Your Day post-hashtag rating overlay now exposes the existing shared color
control for Emotion and Other Feeling tags beside the compact `Skip` action.
Both controls use the anchored `HealthColorControl` / `HealthAccentColorPalette`
treatment and persist through the existing `HealthJournalSignal.color` and
`updateJournalSignal` authority. Symptom occurrence overlays remain on the
canonical `HealthSymptom.color` and `setSymptomColor` path. No SQL or schema
change was made. Multiple Journal Entries per day is deferred to 7.12.41.
Browser, live Supabase, and deployment verification remain outstanding.

## 2026-08-31 7.12.39 Journal History hashtag interaction and overlay stabilization

Journal History now preserves reflection prose while rendering recognized current
canonical Symptom, Emotion, and Other Feeling hashtags as accessible interactive
tags. Each tag opens a compact read-only detail popover: symptom tags show only
timestamped occurrences owned by that Journal Entry and canonical symptom,
repeated same-symptom tags show the same complete occurrence set, and a separate
Daily Log overall score is shown when present. Emotion and Other Feeling tags
show their Journal Entry rating or `Not logged` using the persisted scale labels.
Tag accents use the canonical symptom or Journal Feeling color. The Your Day
hashtag overlay remains floating and does not autofocus or scroll the page;
closing it restores the reflection caret with `preventScroll: true`. The
symptom occurrence overlay reuses the canonical symptom color picker, so color
changes update the HealthSymptom everywhere. The independent symptom-history
surface now uses softened user-facing terminology. No SQL or schema change was
made. Multiple Journal Entries per day is deferred to 7.12.41. Browser, live
Supabase, and deployment verification remain outstanding.

## 2026-08-31 7.12.38 Journal hashtag occurrence overlay and color correction

Journal hashtag selection still captures the active query before asynchronous
symptom-wrapper creation and replaces only that query in the latest controlled
reflection state, preserving newer prose and earlier tags. Symptom hashtag
selection adds or reuses one Daily Log row, then opens a compact floating
occurrence overlay with 1–10 severity and a time input. Saving appends a new
`journalOccurrences` draft with no database ID; repeated same-symptom hashtags
remain independent timestamped occurrences, while the Daily Log overall score
stays separate. Emotion and Other Feeling hashtags retain their 0–10,
0-versus-Not-logged Daily Log behavior through the same overlay authority.
Symptom, Emotion, and Other Feeling color controls now use the same anchored
palette popover treatment while preserving their existing color authorities.
There is no schema or SQL change. Multiple Journal Entries per day remains
deferred to 7.12.40. Browser, live Supabase, and deployment verification remain
outstanding.

## 2026-08-30 7.12.36 Journal readability/layout polish

Journal expanded scales now use readable two-column layouts with full labels.
Core metrics remain 1–10 with a separate `Not logged` action; custom Feelings
show an explicit score-0 `None` option while preserving null as Not logged.
Your Day fills the Journal Entry column, and the Journal Library now creates
Emotions and Other Feelings from compact section-local rows using default
labels. The hashtag picker keeps its existing behavior with clearer spacing
between Symptoms, Emotions, and Other Feelings. No SQL, schema, persistence,
History, native, or iOS behavior changed; browser verification remains
outstanding.

## 2026-08-30 7.12.35 Journal Feeling UX and unified Symptoms Library

Journal now presents user-facing Journal signals as Feelings and exposes one
Symptoms Library backed by canonical Health symptoms. Symptom-backed Journal
wrappers remain internal and are created or reused only when Journal behavior
needs them; canonical renames flow through to Journal display names, while
archived symptoms are excluded from new templates, Add, and hashtag choices.
Journal Feelings use normalized eleven-label 0–10 scales with legacy endpoint
compatibility, compact collapsed score controls, readable core metric labels,
and full-label editing. The Journal Library header is always visible and
manually collapsible; Manage Journal Library expands, scrolls, and focuses it.
Symptom color palettes use a full-width Library row. Typing `#` in Your Day
opens a keyboard-accessible picker that adds a selected Feeling to the current
Daily Log without assigning a score or synchronizing deletion from reflection
text. The authored migration is
`supabase/add_health_journal_scale_labels_7_12_35.sql`; it has not been
applied. Focused source/logic tests and diff checks passed; browser, live
Supabase, and deployment verification remain outstanding.

## 2026-08-30 7.12.34 Journal Entry and customizable Daily Log foundation

Health Journal now has one date-unique Journal Entry editor with nullable Mood,
Energy, Stress, and Mental Clarity scores, reflection text, a persistent
per-user Journal Library, and a customizable Daily Log template. Signals are
stored independently from entries, support symptom-backed canonical names plus
emotion and other labels, preserve stable template order, and use explicit
0/Not logged semantics. Journal-owned symptom occurrences retain their own
timestamped severity rows and cascade with the parent entry; standalone symptom
history remains separate. Legacy symptom tags remain readable but are no longer
written by the Journal editor. The migration
`supabase/add_health_journal_daily_log_7_12_34.sql` is live; this 7.12.35
refinement follows its browser QA findings, while live deployment verification
for the refinement remains outstanding.

## 2026-08-30 7.12.31 Tasks Calendar Month View

Tasks now includes a first-class Calendar Month View with a Monday-through-Sunday
grid, compact timed and untimed task rows, and a collapsed No Due Date section.
Calendar placement is a live projection of each visible Task's `due_on` and
`due_time`, including the current resolved metadata for recurring Tasks; future
recurrence projection and drag-to-reschedule remain intentionally deferred.
Calendar uses the existing Tasks workspace scope, filters, hierarchy visibility,
Include Steps preference, Task editor, and Add Task flow. No SQL, schema,
Calendar-specific persistence, or independent recurrence behavior was added;
browser QA remains outstanding.

## 2026-08-30 7.12.32 Calendar TaskApp hook-order correction

The Calendar Tasks derivation now runs in TaskApp's unconditional derived-data
section before the boot and authentication render guards. This preserves the
React Rules-of-Hooks ordering across loading, signed-out, and ready renders.
Calendar UI, filtering, metadata authority, recurrence behavior, and persistence
are unchanged; browser QA remains outstanding.

## 2026-08-30 7.12.33 shared Task editor retirement

The obsolete `TaskEditorModal` and its modal-only state, flow contract, and
restore path are retired. `TaskManagementTableV2` is now the sole active Task
editor. Calendar Add, normal New Task, Scratch-created Tasks, and Health
reminder templates use canonical Task creation and immediately open the
persisted row in the shared editor; Calendar dates are stored as the real
`due_on` value. Existing Calendar metadata authority, filters, Include Steps,
No Due Date, and recurrence behavior are unchanged. Future recurrence
projection and drag-to-reschedule remain deferred. No SQL or schema change was
made; browser QA remains outstanding.

## 2026-08-30 7.12.23 Health Journal symptom management

Symptom Trends now supports an `All Symptoms` view with one persisted-color
series per symptom that has visible timestamped entries, including archived
symptoms with history. The shared activity chart derives date-axis labels from
the combined date domain, while preserving raw points and same-day positions.
Symptom Library now supports definition-only creation and reuses the approved
symptom color palette for persistent color editing. No schema, SQL, Supabase,
native, or iOS behavior changed; browser verification remains outstanding.

## 2026-08-30 7.12.24 Health Journal trend collision and Library row polish

Journal trend points that share a calendar date and severity now receive a small
timestamp-ordered visual micro-spread around the canonical date position, while
axis labels remain calendar dates and paths, circles, pointer selection, and
active markers share the adjusted coordinates. Opt-in Journal collision details
show every collided symptom entry together; Focus and Nutrition retain their
existing detail behavior. Symptom Library creation controls now share a compact
wrapping row on wider screens. No SQL, schema, persistence, native, or iOS
behavior changed; browser verification remains outstanding.

## 2026-08-30 7.12.25 Symptom Library create row sizing

The Symptom Library definition-creation row now lets its input fill the
available desktop/tablet width while keeping Cancel and Save compact at the
right edge. The row still wraps naturally on narrow mobile screens. Journal
trend, chart collision, symptom color, and persistence behavior are unchanged;
browser verification remains outstanding.

## 2026-08-30 7.12.26 overnight Quick Fix bundle

The Task Table Edit Task surface now selects visible Steps and Substeps as
metadata targets while retaining the parent editor root. HUD and Task Table
layout cloud freshness now arbitrate independently inside the existing account
settings envelope, including legacy timestamp fallback. Home Todo edge arrows
move within the current visible day or Later section. Water now supplements
its existing controls and history with the shared daily fl oz line chart, and
Nutrition calorie plus Sleep charts show their existing persisted goals as
optional shared reference lines. No SQL, schema, native, or iOS changes were
made; browser and cross-device verification remain outstanding.

## 2026-08-30 7.12.30 Water UI polish

Water new-entry amount and Daily Water Goal controls now use compact Health
input sizing. New-entry Date and Time share a compact wrapping row, while
historical Water entries use full-width expanded rows with readable compact
Amount, Unit, Date, and Time edit controls. Historical confirmed entries now
reuse the existing Delete action. Water goal controls stay on one row at
desktop/tablet widths and wrap on narrow mobile. Water persistence, Pending /
Confirm semantics, calculations, analytics, graphs, SQL, schema, native, and
iOS behavior are unchanged; browser QA remains outstanding.

## 2026-08-30 7.12.29 QA corrections and UI polish

Step/Substep title handoff now targets the active metadata child and starts
inline rename as one interaction, including when an earlier child rename
blurs. The desktop Edit Task metadata card keeps its natural height while
staying sticky in the existing editor scroller. Water entry controls now
separate Confirmed/Pending status from Fl oz/Cups/Custom mode, use 5/10/20 fl
oz or 1-cup presets, and pass the selected local date and time into new
entries. The Daily Water Goal editor is compact and collapsible, and Water
point details show current-goal over/under context. Navigator Search raises
only the active dock layer above sticky Table headers. No SQL, migration,
schema, native, or iOS changes were made; browser QA remains outstanding.

## 2026-08-30 7.12.28 QA failure corrections

Step/Substep title clicks in the current parent Edit Task surface now target
the clicked child in the existing metadata pane and begin the existing inline
rename, while the parent remains the editor root. Health Page now destructures
the existing Water confirmation callback, preventing the Water-page runtime
ReferenceError. No SQL, migration, schema, persistence, or Supabase changes
were made; browser QA remains outstanding.

## 2026-08-30 7.12.27 QA corrections and Water/import workflow

Edit Task source Step/Substep rows now use the existing current-editor routing
for neutral row clicks while preserving nested controls. Home Todo arrows now
move tasks to the absolute durable first/last positions and assign Today/Later
edge offsets. Water adds a persisted positive `water_goal_ml`, a shared-chart
goal line, and nullable `confirmed_at` Pending/Confirm semantics with
confirmed-only totals and history. The shared Import Tasks adapter now reports
real recursive persistence progress, including failed or skipped descendants.
The authored-only `supabase/add_health_water_goal_and_confirmation_7_12_27.sql`
migration was applied manually; browser, cross-device, and live SQL
verification remain outstanding.

## 2026-08-30 7.12.22 Health Journal color picker Safari correction

Health Journal symptom color actions and palette buttons now prevent pointer
focus transfer before click, keeping the parent `HealthDropdown` open while
the color action runs. Keyboard activation remains available, and symptom
selection still closes the parent dropdown. No schema, SQL, Supabase,
persistence, chart, native, or iOS behavior changed.

## 2026-08-30 7.12.21 Health Journal symptom colors

Health Journal symptom definitions now persist an approved accent color with a
purple fallback for legacy rows. Both Journal symptom dropdowns expose a
compact per-symptom palette action without nesting controls inside a label or
selecting the symptom. Symptom Trends passes the selected definition color to
the existing shared chart. The authored-only
`supabase/add_health_journal_symptom_colors_7_12_21.sql` migration must be
applied manually; no production SQL, browser, native, or iOS verification was
performed.

## 2026-08-30 7.12.20 Health Journal dropdown structure correction

Health Journal `HealthDropdown` controls now use neutral composite field wrappers
so Safari label activation cannot reopen a closed option panel after a pointer
selection. Focus and Nutrition chart defaults, symptom trends, symptom
persistence, and other Health UI behavior are unchanged.

## 2026-08-30 7.12.19 Health Journal trend QA corrections

Health → Journal Symptom Trends now uses the approved compact plot proportions,
groups same-day entries on one calendar-date X position without collapsing raw
points, and prevents pointer selection from reopening `HealthDropdown` after a
symptom choice. Focus and Nutrition chart defaults, symptom persistence, and
other Health UI behavior are unchanged.

## 2026-08-30 7.12.18 Health Journal trend summary correction

Health → Journal Symptom Trends now labels the graph summary `Latest` and
shows the severity from the last plotted timestamped entry in the selected
range. Raw entries remain separate points; symptom severities are not summed,
averaged, or otherwise aggregated. No persistence, schema, SQL, recovery,
dropdown, Focus, Nutrition, or browser behavior changed.

## 2026-08-30 7.12.17 Health Journal symptom trends

Health → Journal now includes a read-only Symptom Trends section backed by the
timestamped symptom-entry ledger. Users can select active symptoms or archived
symptoms with history, view 7D/30D/90D/All ranges (30D by default), and inspect
each severity 1–10 entry as its own chronological graph point, including
multiple entries on the same day. The graph reuses `ActivityLineChartCard`,
including its existing responsive, hover, keyboard, and pinning behavior. No
schema, SQL, persistence, mutation, native, Realtime, or browser work changed.

## 2026-08-29 7.12.8 Health Journal symptom recovery

Health symptom definitions and timestamped entries now reconcile local-only
rows into Supabase before successful remote hydration replaces the visible
snapshot. Definitions are recovered before dependent entries, recovery is
stable-ID based and idempotent, and local rows remain visible if either
recovery step fails. The existing 7.12.7 migration filename is unchanged;
symptom tables are not added to Realtime because no subscriber exists. No
production SQL, browser, native, or iOS verification was performed.
Journal Trends/Graphs were deferred here and are delivered in 7.12.17.

## 2026-08-28 7.12.7 Health Journal symptom tracking foundation

Health → Journal now keeps the existing daily check-in authority for Mood,
Energy, Signals, and Reflection, with Mood and Energy expanded to 1–10. A
separate user-owned symptom library and timestamped severity ledger support
multiple measurements of the same symptom on one day, including notes and
edit/delete controls. Definitions archive rather than being removed, so
historical entries continue to resolve their names. Symptom persistence has a
narrow local fallback boundary while the authored-only
`supabase/add_health_journal_symptom_tracking_7_12_7.sql` migration is pending;
no production SQL, browser, native, or iOS verification was performed.

## 2026-08-28 7.11.96 Commit-time Fitness scope invalidation

Fitness Goal and Level scope authority now synchronizes in a
commit-synchronous `useLayoutEffect`, before the passive Fitness reload
lifecycle effect runs. Scope and epoch changes therefore invalidate old
mutation responses as soon as the new committed Fitness activation, account,
or Supabase client is observable. Reload generation remains separate and
reload-only; ordinary reloads do not change the Fitness scope epoch. No Goal or
Level behavior or persistence semantics changed; no SQL, migration, Edge,
browser, or device work was performed.

## 2026-08-28 7.11.95 Fitness mutation scope epoch

Fitness Goal and Level mutations now capture both the active Fitness
client/user scope and a per-hook Fitness scope epoch. The epoch advances when
Fitness activation, account, or Supabase client scope changes, including leave
and re-entry with the same account/client; ordinary reloads advance only the
reload generation. Reload responses remain protected by scope plus reload
generation, while Goal/Level mutation responses remain protected by scope plus
scope epoch. No Fitness Goal behavior or persistence semantics changed; no SQL,
migration, Edge, browser, or device work was performed.

## 2026-08-28 7.11.94 Fitness mutation scope decoupling

Fitness Goal and Level mutations now use only their captured active
client/user scope for response validity. Same-scope reloads may still advance
reload generation without discarding a successful mutation response, while
reload responses remain protected by the existing scope-plus-generation guard.
No Fitness Goal behavior or persistence semantics changed; no SQL, migration,
Edge, browser, or device work was performed.

## 2026-08-28 7.11.93 Fitness Goals stale-scope mutation guard

Fitness Goal and Level mutations now capture the existing Fitness client/user
scope and reload generation before asynchronous work. Stale responses are
quietly ignored before Goal/Level state or hook errors are changed, and an
`updateGoal` Exercise Library lookup cannot continue into a Goal write after a
scope change. Reorder reload follow-ups retain the same guard while accepting
their own fresh reload generation. No Fitness Goal behavior or persistence
semantics changed; no SQL, migration, Edge, browser, or device work was
performed.

## 2026-08-28 7.11.92 Water History entry editing

Health → Water → Water History now exposes individual historical water entries
inside an ephemeral per-day `Entries` expansion. Historical rows reuse the same
canonical `WaterEntryCard` editor and `updateWaterEntry` save path as Today’s
Water, including amount/unit conversion and date/time recalculation. Successful
date edits re-group entries immediately; moving an entry to today removes it
from History and shows it in Today’s Water, while empty historical groups
disappear naturally. The existing 14-day History window remains unchanged. No
water schema, SQL, migration, persistence hook, deployment, or iOS behavior
changed.

## 2026-08-28 7.11.91 Fitness Goals UI metric authority

Health → Fitness exposes the existing canonical Fitness Goals system. Goal
metric selection is independent of the Exercise Library compatibility
`default_measurement` field; current PR, Goal progress, Level progress, and
reached state are derived from matching canonical Workout Exercise
observations and self-heal after corrections or deletions.

## 2026-08-28 7.11.89 Navigator Search inline mode

Navigator Search now opens inline inside the expanded Navigator. Search is the
far-left control; activating it temporarily replaces the Navigator icons with
a search field and dock-attached results. Existing destination registry,
ranking, and navigation authorities remain unchanged.

## 2026-08-28 7.11.88 Navigator Search

The expanded Navigator now includes a compact `Go To` search palette for direct
navigation to visible top-level pages, Tasks surfaces and views, canonical
Health tabs, and selected Settings sections and controls. Search uses a local
destination registry with simple title/breadcrumb/keyword ranking; it does not
search user content, query Supabase, or introduce another navigation authority.
Tasks reuse the existing surface and view state seams, Health reuses the shared
tab preference, and Settings uses a one-shot mount-aware section scroll request.

## 2026-08-27 7.11.84 Trusted History outcome batch

Multi-date History Calendar Done / Did My Best / Missed edits now use one
trusted browser-to-Edge `history_outcome_batch` request. The Edge branch
validates and deterministically orders the dates, then sequentially executes
ordinary canonical `set_outcome` children with threaded revisions and stable
child replay identities. Each child retains its own History fact, canonical
revision, and reward entitlement decision. Child Achievement evaluation is
deferred through a backend-only SQL wrapper and one deterministic final
Achievement evaluation runs after the children complete. Partial failures keep
earlier committed dates; final Achievement failure is reported as a
post-commit warning. Production has been verified with migration
`20260828033531 patch_task_state_history_batch_achievement_boundary_7_11_84`,
`adhdice_execute_task_state_command_deferred_achievements(uuid,jsonb)`,
`adhdice_finalize_task_history_batch_achievements(uuid,uuid)`, Task State
ACTIVE v27, and the Edge deployment pinned to reviewed 7.11.85 commit
`5b47fcf4ab03802ad57d6ef7cc0c0d006dc7c73e`. This is a documentation
correction; no SQL was reapplied and the Edge Function was not redeployed.

## 2026-08-27 7.11.85 Partial History batch Achievement finalization

Partial History outcome batches now run the same deterministic final
Achievement evaluation whenever at least one deferred child committed or
replayed before the batch stopped. The canonical child failure remains the
primary error, while finalizer failure is reported as a post-commit warning;
zero-commit failures do not run the finalizer. The outer replay identity and
deterministic Achievement operation identity remain unchanged for recovery.

## 2026-08-27 7.11.86 Non-blocking startup History hydration

Initial workspace rendering no longer waits for the full canonical Task History
table. Tasks/profile render after critical startup data is ready; full History
hydrates asynchronously, and rollover remains gated until History hydration
completes. A History failure leaves the workspace visible, keeps History
not-ready, and preserves the existing warning path.

- Active Workout Sandbox MVP is implemented as a temporary local runtime using the existing canonical Workout → Workout Exercise → Set system rather than introducing another permanent session authority.
- This document summarizes current authority and known limits; it does not establish browser parity or gate activation.

## 2026-08-28 7.11.87 History readiness boundary for Active Status

Workspace rendering remains non-blocking, but History-dependent Active Status
authority does not activate until full History readiness. While History is
pending or failed, persisted canonical compatibility Task status is used for
presentation rather than treating unloaded History as an empty History
snapshot. History-dependent smart-list rules likewise remain inactive until
the full snapshot is ready, while ordinary status filters and buckets use the
persisted status projection. Rollover remains gated by full History readiness.

## 2026-08-27 7.11.82 Multi-date History Calendar sync optimization

Multi-date History Calendar Done / Did My Best / Missed edits now use the
existing multi-date canonical sync path, preserving sequential revision-safe
commands while collapsing repeated History reload/streak reconciliation into
one final refresh.

## 2026-08-27 7.11.83 History Calendar Realtime containment

Multi-date History mutations now suppress their own Task Realtime echoes for
the full mutation lifetime, and known-task History Realtime changes use
targeted History reconciliation rather than whole-account History scans.

## 2026-08-27 7.11.81 Authoritative Task search selector excludes trashed descendants

Versions 7.11.79 and 7.11.80 corrected parallel derived search evidence, but
browser QA showed the authoritative Task search selector re-added trashed
descendants during selected-root hierarchy expansion. Version 7.11.81 fixes
that selector eligibility while preserving active descendant search,
manual/smart list descendant behavior, and Trash search.

## 2026-08-27 7.11.79 Active Task search excludes trashed child evidence

Normal active Task search no longer lets stored-trashed Step/Substep titles
pollute an active parent result. Active child title and tag ancestor-context
search remains supported, and direct Trash search remains findable through the
existing Trash scope and hierarchy behavior. No hierarchy, Task State,
recurrence, History, SQL, Edge, or iOS behavior changed.

## 2026-08-27 7.11.80 Real child-preview search filtering

The 7.11.79 source-child search filters did not cover the parallel child-preview
search path exposed by browser QA. Version 7.11.80 filters stored-trashed child
preview evidence outside Trash while preserving active child title/tag search
and existing Trash hierarchy behavior. No global child-preview construction,
hierarchy, delete, Task State, recurrence, History, SQL, Edge, or iOS behavior
changed.

## 2026-08-27 7.11.78 Task State Achievement-deferral RPC compatibility

The 7.11.77 Achievement-deferral architecture passed source review, but
production `pg_get_functiondef` compact formatting caused the two literal
loop/finalization migration anchors to miss. Version 7.11.78 makes only those
anchors whitespace-tolerant and fail-closed. Task State and Achievement
semantics are unchanged; SQL remains unapplied and no Edge source changed.

## 2026-08-27 7.11.77 Task State schedule-backfill Achievement deferral

Live QA task AB3 confirmed that Daily schedule backdating could return Edge
422 after roughly 9–10 seconds because the canonical Task State RPC inserted
each automatic Missed fact separately while the History trigger performed a
full Achievement evaluation for every row. The transaction rolled back
cleanly; this was a performance timeout, not a recurrence or business-rule
rejection. The authored-only
`supabase/patch_task_state_achievement_deferral_7_11_77.sql` reuses the
established `defer_rollover_achievement_evaluation_7_1_0.sql` architecture:
it keeps per-row Achievement source capture and Step-set refresh active,
defers only repeated full evaluation with a transaction-local setting, clears
that setting, then runs one deterministic command-scoped strict final
evaluation and raises on any non-success status. Automatic Missed generation,
History, Calendar, recurrence, streaks, rewards, and `statement_timeout` are
unchanged. The migration remains authored-only pending source review; no SQL
was applied and no Edge source or deployment changed.

## 2026-08-27 7.11.76 Task State client reconciliation

Canonical Due and Repeat commits now force a fresh task-scoped History read
before the existing local History and streak-summary reconciliation callback,
including schedule replays that generate automatic Missed facts without a
normal History side-effect ID. The committed canonical Task and fresh History
therefore update current streak, missed streak, Last Done, and related fields
without a page reload. Table, List, Step, and Substep Delay status surfaces now
share an eligibility rule requiring a real due date and an allowed lifecycle;
the direct Task-app Delay handler also fails closed for unscheduled Tasks.
Canonical occurrence validation remains authoritative. No SQL or Edge source
changed; no SQL application, Edge deployment, browser QA, or device QA was
performed.

## 2026-08-27 7.11.75 Task History Calendar correctness

Ordinary canonical Calendar projection now consumes a proven non-null
`effective_due_on` from a canonical Delay row, so the original obligation is
Not Due until the effective occurrence date; legacy identity-less Delay
fallback remains unchanged. History Calendar outcome replacements now send one
canonical `set_outcome` command, allowing the existing trusted planner and RPC
contract to atomically replace an automatic Missed outcome, remove dependent
automatic Missed facts, and replay the rolling recurrence. Not Due and explicit
Clear retain their `clear_outcome` plus Calendar-override semantics. No Edge
source or SQL changed; no Edge deployment, SQL application, browser QA, or
device QA was performed.

## 2026-08-27 7.11.74 Task State forward patch correction

The 7.11.73 TypeScript/source behavior passed architecture review. Review of
the installed production RPC formatting exposed an authored SQL anchor mismatch:
the forward patch assumed a pretty-printed automatic History guard while
production used the same guard in compact form. Version 7.11.74 corrected the
forward patch with an exact, whitespace-tolerant, fail-closed anchor check.
SQL and Edge deployment remain pending; browser QA and device QA were not
performed for this source correction.

## 2026-08-27 7.11.73 Canonical Task State correctness

Status-circle Delayed actions on Table/List task, Step, and Substep surfaces now
open the existing Delay date-selection flow; the selected date is committed
through canonical `delay_occurrence`, preserving the original occurrence and
updating the compatibility `due_on` projection to the effective delayed date.
Canonical schedule replay now materializes only past unresolved automatic
Missed facts for a backdated schedule change in the same command transaction.
Manual History and Calendar overrides remain authoritative, Not Due stays
derived, current logical day remains live, and automatic Missed facts carry no
positive completion or reward side effects. Fitness Goals migration is live and
verified; Goals UI remains explicitly parked. Focused source tests cover the
7.11.73 regressions. An authored-only forward RPC patch extends the existing
automatic History contract for schedule replay; no SQL was applied. Edge
deployment, browser QA, and device QA were not performed by this source change.

## 2026-08-26 7.11.72 Fitness Goals source-review corrections

The 7.11.71 Meal Plan pending mutation recovery source review passed. Fitness
Goals reload failures now use the shared error formatter: missing-table,
schema-cache, `42P01`, and `PGRST205` failures return only the friendly
7.11.69 migration message, while unrelated errors remain unchanged. The
consolidated `supabase/schema.sql` Goal and Level policies now mirror the
authored migration's authenticated owner predicates. The
`supabase/add_health_fitness_goals_7_11_69.sql` migration is now live and
verified. Goals UI remains parked; no performance/PR engine or generic Records
or Achievements integration was added.

## 2026-08-26 7.11.71 Explicit Meal Plan pending mutation recovery

The 7.11.70 source review found that absence-based Meal Plan recovery was
ambiguous across devices: an arbitrary local-only row could be either an
unsynced create or stale cache for a legitimate remote deletion. Version
7.11.71 replaces that rule with a per-user, Meal-Plan-specific pending mutation
journal. Local fallback create/edit/delete operations record explicit upsert or
delete intent; successful remote hydration replays only those journal entries,
clears only completed operations, and keeps failed local intent visible for
retry. Unmarked local-only cache now yields to successful remote authority.
No SQL or migration changed or was applied.

## 2026-08-26 7.11.70 Meal Plan recovery

Meal Plan hydration now reconciles local-only rows against successful remote
results, promotes those rows with owner-scoped idempotent upserts, and keeps
local rows visible for retry when promotion fails. The live Meal Plan Done RPC
is already the corrected two-argument function
`adhdice_confirm_health_meal_plan_entry(uuid, date)`: the 7.11.62 confirmation
correction and 7.11.63 qualified ambiguity correction are live. This source
inspection does not establish browser or device QA.

## 2026-08-26 7.11.69 Fitness Goals + Levels Foundation

The 7.11.68 On-Time source review passed; browser QA remains deferred. Fitness
Goals + Levels foundation adds `single_set_reps`, `session_total_reps`,
`longest_set_duration`, and `session_total_duration`, while keeping Workout →
Workout Exercise → Set as the canonical performance authority. Personal Records,
threshold reached state, and reached dates are derived from current canonical
rows, so corrections and deletions self-heal; no PR, record-history, or
achievement rows are persisted. Goals and Levels persist configuration only,
with owner-scoped relationships and explicit Level ordering. The
`supabase/add_health_fitness_goals_7_11_69.sql` migration is live and verified.
Goals UI remains parked; no Goals/Records UI, generic Records integration, or
Achievement integration was added.

## 2026-08-26 7.11.68 Preserve On-Time Stop & Save Progress

The 7.11.67 Table Due implementation/source review passed; real offline browser
failure-path QA remains deferred. On-Time Stop & Save now persists
occurrence-owned linked-item `savedElapsedSeconds` inside the existing JSON
`plan_state`. The root cause was active-timer-only elapsed accounting, which
lost progress when the timer row was deleted. `Task.actual_seconds` remains
lifetime Task time and is not planner-progress authority. Start continues saved
progress, Restart resets planner deadline progress semantics, and Reset Deadline
preserves saved progress. Recurring occurrences remain isolated, Finish & Log
records the same timer progress exactly once, and no SQL/schema migration was
added.

## 2026-08-26 7.11.66 Table Due optimistic failure reconciliation

Food work from 7.11.59 through 7.11.65 is QA accepted. The Coke/Open Food
Facts accuracy investigation remains deferred. Table Due mutations now receive
canonical success/failure acknowledgement; failed optimistic Due changes
restore their captured complete Table row snapshot, and stale failed requests
cannot overwrite newer Due edits. No SQL, schema, or canonical Task State
redesign was added.

## 2026-08-26 7.11.67 Distinguish persisted Due edits from refresh failures

The 7.11.66 source review found that Table's boolean acknowledgement conflated
true canonical persistence failure with post-commit reconciliation failure.
Table rollback now occurs only when the canonical Due mutation never persisted.
Committed-but-unreconciled Due changes keep their optimistic state and retain
the existing `Task was saved, but ADHDice couldn't refresh...` warning. The
existing complete-row snapshot, stale-generation, multi-target rollback, and
viewport-hold logic is preserved. No SQL, migration, Task State RPC, or schema
changes were added.

## 2026-08-25 7.11.65 Inline Food Date Chip

Meal Logging now keeps the selected Food date chip directly beside the
selected-day meal title and calorie total in a compact wrapping row. The
shared `SectionMiniTitle` default remains right-aligned for its existing
callers, and Daily Totals plus other Health section-title layouts are
unchanged. No SQL or migration was added.

## 2026-08-25 7.11.64 Compact Meal Logging Header

Meal Logging now opts into a compact `HealthPanel` header (`py-2` at mobile and
desktop) and minimal body top spacing (`pt-1`), while all other Health panels
retain the generic header padding and body defaults. Its collapse chevron gets
a small upward optical adjustment for the single-line label; the existing
full-header clickable collapse target and accessible state remain unchanged.
Daily Totals and other Health panels are unchanged. No SQL or migration was
added.

## 2026-08-25 7.11.63 Meal Plan Done SQL Fix + Food Scanner Reset

QA 3, 4, 5, and 8 passed in the 7.11.62 Food flow. The remaining Done failure
was diagnosed as a PL/pgSQL naming ambiguity: the `confirmed_at` output
variable collided with the plan table column in the unqualified update
predicate. The additive
`supabase/fix_health_meal_plan_done_ambiguity_7_11_63.sql` migration qualifies
the plan row references and preserves the row-locked, idempotent RPC behavior.
The 7.11.62 confirmation correction and this 7.11.63 ambiguity correction are
live; the current live RPC is the corrected two-argument
`adhdice_confirm_health_meal_plan_entry(uuid, date)` function.

Custom Food barcode scanning now captures a safe pre-scan draft baseline,
offers a compact Clear action, restores that baseline for both blank and
manually edited foods, and ignores stale lookup responses after Clear. Meal
Logging uses compact body spacing without changing other Health panels.
The native scanner architecture and barcode nutrition accuracy investigation
remain unchanged/deferred. Browser and device QA are not established by this
source inspection.

## 2026-08-25 7.11.62 Food Logging Speed + Meal Plan Done Correction

Combined Food QA corrections keep the native barcode scanner unchanged while
adding a shared draft Clear action, a compact Food | Measurement | Amount | Time
| Scan layout, Categories beneath Food without changing fast keyboard order,
Measurement open-on-focus behavior, and Amount Enter fast-submit for actual
food, new plans, and edited plans. Food times render as forced 12-hour AM/PM;
hydrated PostgreSQL `time` values accept and normalize both `HH:MM` and
`HH:MM:SS`.

Meal plans now use planned time as intention only. Done is available before,
at, or after the planned time and creates the actual meal with the user's local
current date and server confirmation timestamp while preserving the plan's
meal slot and immutable snapshots. The
`supabase/correct_health_meal_plan_confirmation_7_11_62.sql` correction keeps
confirmation row-locked and idempotent. That correction is live; the follow-up
7.11.63 ambiguity correction is also live, and the current live RPC is the
corrected two-argument `adhdice_confirm_health_meal_plan_entry(uuid, date)`
function.

Combined Food QA 1–3 passed. Barcode nutrition provider accuracy remains under
observation and is deferred for a separate basis/provider investigation.

## 2026-08-25 7.11.61 Meal Planning + Confirm to Actual

The 7.11.60 source-reviewed Food fast-entry workflow now supports a separate
planned-occurrence authority in `adhdice_health_meal_plan_entries`. Plan Food
reuses the shared inline MealDraft editor for Custom Foods, Favorites, Recent
options, Recipes, Saved Meals, Quick Entry, and barcode scanning. Unconfirmed
plans are excluded from actual meals, totals, Recently Eaten, food-log counts,
and consumption achievements. Future dates and planned times are supported;
actual Add Food keeps its future-timestamp protection. Confirm uses the
authenticated atomic/idempotent `adhdice_confirm_health_meal_plan_entry` RPC,
copies the current plan snapshots into one canonical HealthMealEntry, and
retains the confirmed plan audit anchor. Planned and actual nutrition totals
remain separate, including expanded nutrition coverage semantics. The
`supabase/add_health_meal_planning_7_11_61.sql` migration is live; the 7.11.62
confirmation correction and 7.11.63 ambiguity correction are also live. The
7.11.59/7.11.60 browser QA remains deferred and should be combined with later
QA; native scanner implementation is unchanged.

## 2026-08-25 7.11.60 Faster Add Food Entry

Inline Add Food no longer exposes a manual barcode input or Lookup action. Barcode acquisition remains scanner-only through the compact `ScanBarcode` icon, with the existing native and web scanner architecture unchanged. Custom Food category chips are collapsed by default, fresh meal editors clear any prior category filter, and a collapsed active filter remains visible on the Categories control. HealthAutocomplete options are not Tab stops; Arrow keys and Enter continue to select suggestions, Tab commits the highlighted food and advances through the normal Food → Measurement → Amount → Time order, and pointer selection keeps keyboard focus predictable. No SQL or migration changes were added. The 7.11.59 expanded-nutrition browser QA remains deferred and can be combined with 7.11.60 browser QA later.

## 2026-08-25 7.11.59 Expanded Nutrition Facts

Native barcode scanner real-device QA passed checks 1–6 and barcode scanning is closed for the 7.11.x cycle. The Food architecture now carries one canonical `HealthNutritionDetails` structure for fat subtypes, sodium, fiber, sugars, vitamins, minerals, caffeine, and omega fats. Unknown values remain null/blank and are never normalized to zero; a numeric zero remains a known value. Custom Food rows remain the current Food Library definition authority, while logged meals use immutable `food_snapshot` and `nutrition_snapshot` data. Recipes and Saved Meals copy and aggregate expanded nutrition, and daily totals report known-entry coverage for incomplete nutrients. Open Food Facts normalization now uses one explicit per-serving or per-100g basis across calories, macros, and expanded nutrients, and missing barcode calories remain null. The additive `supabase/add_health_expanded_nutrition_7_11_59.sql` migration adds `adhdice_health_food_library.nutrition_details` and is live. Browser QA remains deferred to the combined 7.11.60 pass.

## 2026-08-25 7.11.58 Native iOS Food Barcode Scanner

Real iOS QA proved that `BarcodeDetector` is unavailable in the installed WKWebView, so 7.11.58 adds the official `@capacitor/barcode-scanner` 3.1.1 native fallback behind the shared `HealthBarcodeScanner` boundary. Native Capacitor scanning now uses the rear camera and returns the raw barcode to the existing Add Food and Custom Food flows; the browser keeps the existing `BarcodeDetector` plus `getUserMedia` fallback and browser-only unsupported message. Open Food Facts remains the lookup authority, scanning never saves automatically, and no-match barcodes remain available for manual completion. No SQL or migration was added.

## 2026-08-25 7.11.57 iOS Barcode Camera Permission Readiness

The 7.11.56 scanner source review passed, but real iOS review found that `ios/App/App/Info.plist` did not declare `NSCameraUsageDescription`. This checkpoint adds the required native camera privacy declaration for real-device scanner QA. The scanner still uses the shared `HealthBarcodeScanner` with `BarcodeDetector` plus `getUserMedia`; no native scanner plugin has been added. Real device QA is the next gate. If `BarcodeDetector` or WKWebView support fails after camera permission is correct, diagnose a native scanner implementation in a follow-up rather than assuming the shared WebView path is sufficient.

## 2026-08-25 7.11.56 Compact Food entry and shared barcode scanning

The 7.11.55 inline meal-ledger workflow otherwise passed manual QA. Add Food now removes public USDA/text search, keeps custom-food autocomplete, Favorites, Recent Foods, Recipes/Saved Meals, and barcode lookup, and presents the useful controls in a tighter inline layout. Barcode camera behavior is implemented by the reusable shared `HealthBarcodeScanner`, using `BarcodeDetector` plus `getUserMedia` with a rear-camera preference; Open Food Facts remains the barcode lookup provider. A scanned no-match barcode stays on the meal draft for manual completion, and scanning never saves automatically. Custom Nutrition Library Foods now support typed or scanned barcodes, barcode persistence, edit preservation, and review-before-save Open Food Facts prefilling. No SQL or migration was added. Barcode scanning is now part of the 7.11.x native/iOS scope; real iOS device QA is required, and if WKWebView support is insufficient, a follow-up native scanner implementation is required. No native barcode plugin, native build, simulator, or device deployment ran for this checkpoint.

## 2026-08-25 7.11.55 Food shortcuts use the inline meal ledger

Favorites and Recent Foods now only populate a visible active inline meal editor. With no active Breakfast, Lunch, Dinner, or Snack editor, both shortcut actions are disabled with `Open a meal first`; they cannot save or mutate a hidden draft. Favorite and Recent Food selection preserves the selected history date, active meal section, current time, and normal inline Add confirmation. All new food persistence remains on `handleSaveMeal` → `addMealEntry`. No SQL or migration was added.

## 2026-08-25 7.11.54 Inline meal ledger food entry

The global Food composer has been removed. The selected-day meal ledger is now the creation authority: Breakfast, Lunch, Dinner, and Snack each expose an inline `Add Food` editor, with Date and Meal implicit from the selected ledger date and active section. Successful Add stays open, preserves date, meal slot, and time, and clears only food-specific data for rapid multi-add. Completely empty selected days still render all four sections and actions. Existing canonical Health Meal Entry persistence, editing, deletion, nutrition snapshots, and totals remain unchanged. No SQL or migration was added.

## 2026-08-25 7.11.53 Selected-day meal logging

Health Food logging now keeps the selected meal-history date aligned with the meal composer. Breakfast, Lunch, Dinner, and Snack each expose an `Add Food` action that targets the selected date and slot, reveals the existing composer, and preserves editable Date and Meal controls. Successful logging clears food-specific draft data while preserving date, meal slot, and time for multi-add; Quick Entry follows the same context rules. Completely empty selected days still render all four meal sections and their add actions. Existing canonical Health Meal Entry persistence, editing, deletion, nutrition snapshots, and totals remain unchanged. No SQL or migration was added.

## 2026-08-25 7.11.52 Fitness Runtime Stabilization

The 7.11.51 Active Workout functionality passed manual browser QA; visual redesign and polish remain deferred. This release corrects partial-Finish timer locking, preserves removed historical Workout Type values in the active runtime selector, and guards Fitness Plans and Structured Fitness reloads against stale user, active-scope, client, generation, loading, and error responses. The 7.11.46 Structured Fitness Sessions migration, 7.11.46 index-name correction, and 7.11.50 Exercise sort-order migration are live. No new migration is expected for 7.11.52.

## 2026-08-25 7.11.50 Fitness settings reorder, set flow, and history totals

The structured Set builder now grows above a bottom Add Set action. Workout Types and Exercises share the same clean settings-row treatment and pointer-based reorder implementation. Exercise Library ordering is persisted per user through `adhdice_health_exercises.sort_order`, with existing rows backfilled alphabetically and new rows appended after active exercises. Structured Workout History now shows per-exercise aggregate reps or duration while preserving individual Set values and the canonical Workout duration. The `add_health_exercise_sort_order_7_11_50.sql` migration is live. No new SQL, builds, or device deployment ran for this checkpoint; browser QA was covered by the 7.11.51 manual QA pass.

## 2026-08-25 7.11.51 Active Workout Sandbox MVP

Active Workout is a temporary versioned local runtime at `adhdice-health-active-workout:<userId>` (version 1). It restores after same-device navigation or reload and uses timestamp-derived overall and per-Set elapsed time; display intervals are not time authority. The canonical Workout is created or reused only during Finish Workout, followed by structured Workout Exercise/Set persistence and explicit Fitness Plan links. Partial saves retain the runtime and `canonicalWorkoutId` for retry, while Discard refuses to silently remove a partially canonicalized workout. Cross-device runtime sync is deferred. Active Workout functionality passed manual browser QA; visual redesign and polish remain deferred. No new SQL was added or run; no native build or device deployment ran.

## 2026-08-25 7.11.49 Exercise selection, per-workout measurement, and chip alignment

Exercise Library entries are reusable exercise identities: Settings requires only an exercise name and archive/rename behavior. The existing `default_measurement` column remains in the live-compatible schema as deprecated compatibility data; new rows receive `reps`, and the application does not present or edit that value. `adhdice_health_workout_exercises.measurement_type` is the actual measurement authority for each Workout Exercise occurrence. Every occurrence exposes both Reps and Duration, and switching modes clears incompatible set values while preserving set IDs, count, and notes. The selector retains its current active or archived exercise option alongside active alternatives, and replacement updates only the Workout Exercise ID/name snapshot without deriving measurement from the library. Shared icon-bearing `AdhdChip` controls now use compact `gap-1`, a centered shrink-resistant icon wrapper, and slightly reduced leading padding while text-only/count-only chips and `AdhdIconButton` remain unchanged. No live SQL was run; browser QA, builds, and device deployment remain unverified. The next planned feature is `7.11.50 Active Workout Sandbox MVP`.

## 2026-08-25 7.11.47 Fitness retry safety and Home capacity

Fitness Plan saves now reconcile each newly created planned item’s returned database ID into the open editor draft before later item/archive operations continue, so a partial save retry updates the successful item instead of inserting it again. Structured Fitness saves now return a reconciled draft result; newly created Workout Exercise and Set rows reconcile their returned database IDs into the editor before any later child or association failure, while the canonical workout remains in edit mode for retry. Home To-Do automatic placement now consumes only each day’s remaining capacity after explicit manual placements; pinned items stay authoritative, Later pins do not consume normal-day capacity, and overflow remains Later. The existing Health tab preference signal now gates Fitness Plan and Structured Fitness hook loading to the Fitness tab. The 7.11.46 Structured Fitness Sessions migration, its index-name correction, and the 7.11.50 Exercise sort-order migration are live; no SQL was applied or run in this source checkpoint. Focused Plan, Structured Fitness, Home, and Health regression tests passed 130/130; narrow focused-file ESLint passed, while broader changed files retain pre-existing warnings/errors outside this ticket. Browser QA, live SQL, builds, and device deployment remain unverified for that checkpoint.

## 2026-08-24 7.11.46 Structured Fitness sessions

Fitness keeps `adhdice_health_workouts` as the canonical manual/imported session ledger and adds isolated Exercise Library, Workout Exercise snapshot, and ordered Set child data. Manual workout create/edit saves the canonical row first, then diffs structured children by stable IDs, then saves optional Fitness Plan links; partial child or association failures preserve the workout and keep the editor open for retry. Library entries archive rather than delete, workout deletion cascades children in SQL and clears local structured state after canonical success, and imported workout edit restrictions remain unchanged. Focused structured Fitness tests passed 25/25, targeted new-file ESLint passed, and `git diff --check` passed; browser QA, live SQL, builds, and device deployment remain unverified. The 7.11.46 Structured Fitness Sessions migration and index-name correction are live.

## 2026-08-24 7.11.45 Fitness Plan item workflow

The Fitness Plan editor keeps its existing Add Planned Item behavior in the bottom action group beside Save Plan and Cancel, so additional planned items can be appended after editing the last item without returning to the section header. Fitness Plan persistence, associations, completion semantics, week behavior, and the authored-only 7.11.44 migration are unchanged. Browser QA, live SQL, builds, and device deployment remain unverified.

## 2026-08-24 7.11.44 Multiple Fitness Plans

Fitness now has durable multiple-plan structures (`adhdice_health_fitness_plans`, planned items, and explicit workout links) alongside the canonical `adhdice_health_workouts` ledger. Health > Fitness supports active-plan creation/edit/archive, Monday–Sunday current-week completion, first-week start-date semantics, and optional multi-select associations from the existing workout form. Workouts remain the authority for actual activity; plan loading/recovery is isolated from Health workout recovery. Focused Fitness Plan and Health regression tests are the implementation verification boundary; browser QA, live SQL, builds, and device deployment remain unverified. The migration is authored only and must be applied manually before the database-backed plan UI can persist data.

## 2026-08-19 7.10.1 QA polish

Health Food Logging now searches and applies custom Foods, Recipes, and Saved
Meals through the existing meal snapshot path; Health dropdown keyboard
navigation keeps the highlighted option visible. Activity Summary supports
Focus Type and primary Focus Subtype filters across Daily, Weekly, and Monthly
views. Task History Calendar multi-select now exposes only the canonical Not
Due override and applies selected eligible dates sequentially. No SQL or Edge
changes were required; browser and live Supabase parity remain unverified.

## 2026-08-19 7.10.2 History Calendar replacement

Task History Calendar now replaces same-date handled outcomes before applying
Not Due, clears active Not Due overrides before outcome edits, processes
multi-select Not Due sequentially, and surfaces clear/override/reconciliation
failures through the existing Task edit notification. No SQL or Edge changes
were required; browser and live Supabase parity remain unverified.

- Historical patch descriptions are intentionally excluded from this active document.

## 2026-08-19 7.10.5 permanent Task-day rewards

Canonical reward entitlements now snapshot a positive reward amount when first
earned and are unique by `(user_id, entity_id, logical_date)` regardless of
reward-program version. History replacement or clearing may set the provenance
History reference to null without removing or changing the entitlement. The
authoritative 7.10.5 migration combines the fail-closed existing-data backfill
with the updated Task State command and fulfillment RPC definitions in one
transaction. Pending entitlement backfill accepts a later successful History
label edit without changing the original outcome snapshot. SQL has not been
applied, Edge functions have not been deployed, and browser/live parity remain
unverified.

The earlier 7.10.3 and 7.10.4 artifacts were superseded before any live
application; only `patch_task_reward_entitlement_permanence_7_10_5.sql` is deployable for
this release.

## 2026-08-19 Dead tables and legacy plumbing retirement

The 7.9.50 source retires the approved dead tables, separate Subtask and
promotion runtime, completed pending-reward and Focus migration bootstraps,
the obsolete direct reward path, and the reward-claim `subtask_id` relationship.
Canonical parent/Step/Substep rows remain in `adhdice_clean_tasks`.
Canonical reward entitlement fulfillment, pending dice, reward rolls/claims,
Focus counters/events, canonical Achievement tables, and
`adhdice_task_migration_operations` remain current. The forward SQL migration is
authored only; live SQL, deployment, and browser parity remain unverified.

The reviewed backend seam order for any future activation remains:

- `supabase/add_task_state_command_rpc.sql`
- `supabase/add_canonical_reward_entitlement_bridge.sql`
- `supabase/functions/task-state-command/index.ts`
- `supabase/functions/task-state-command/auth.ts`
- `supabase/functions/task-state-command/domain.ts`
- `supabase/functions/task-state-command/orchestration.ts`
- `src/lib/task-state-canonical/command-service.ts`
- `src/lib/task-state-canonical/engine-input.ts`
- `src/lib/task-state-canonical/read-model.ts`
- `src/lib/task-state-engine/engine.ts`

Install the reviewed SQL. Deploy the exact reviewed Edge bundle. Verify RPC signatures. Verify deployed Edge version. Run controlled authenticated backend smoke test, then enable the browser canonical gate. None of those live steps is claimed here.

## 2026-08-19 Dead architecture purge

The 7.9.49 source now retires the obsolete `adhdice_task_history` and
`adhdice_task_actual_time_entries` paths, migration/backfill support tables and
functions, learned-duration code, and proven-dead blob/prize-board tables.
Canonical History remains `adhdice_task_history_facts`; active Task Timer
seconds remain on the current timer/task paths. `adhdice_task_migration_operations`
and its canonical provenance references remain intentionally intact. The purge
SQL is authored only; live SQL, deployment, and browser parity remain
unverified.

## 2026-08-18 Achievement canonical History cleanup

Task Achievement evidence now targets `adhdice_task_history_facts` exclusively.
The 7.9.48 source patch preserves the legacy `p_history_id` SQL parameter name
because PostgreSQL `CREATE OR REPLACE FUNCTION` cannot rename input parameters;
the parameter identifies `adhdice_task_history_facts.id`. It retains the 7.9.46
canonical logical-identity Tier E reconciliation
after ordered source evidence and zero-row Task/date fallback. It preserves one
completed nonrecurring lifetime Achievement occurrence across repeated
canonical terminal facts, while true Tier D ambiguity still creates the
canonical fallback and dequalifies stale siblings without deleting rows or
touching permanent awards/notifications. The patch and consolidated SQL are
authored only; one-time and resumable Task sources now exclude irrelevant
nonqualifying facts while retaining evidence-backed corrections. Live SQL,
deployment, and browser parity remain unverified.

## 2026-08-18 Milestone canonicalization

Milestones remain metadata attached to canonical top-level parent Tasks.
Complete, Trash, and Restore use the trusted `task-state-command` boundary and
an atomic backend-only orchestration that invokes the existing canonical Task
State executor before committing Milestone awards, reminders, and events.
Milestone Complete now preserves returned canonical History/reward side-effect
IDs, refreshes/reconciles canonical History, and fulfills only the returned
canonical reward entitlement. Permanent deletion uses the normal Task deletion
path, preserving nullable historical Milestone rows. The old Milestone
Task-mutating RPCs and legacy History writes were removed from production
wiring. Reverse completion remains explicitly unavailable because canonical
Task State has no reopen command; no snapshot restoration is performed. The
7.9.42 SQL patch is authored only and has not been applied or deployed.

## 2026-08-18 Task State closure

The simplified Task State model is now the product authority. All saved Task
History is canonical fact with its recorded logical date; automatic Missed and
automatic Did My Best are real History; old History without occurrence metadata
remains valid and cannot consume an arbitrary current/future occurrence. Calendar
projects saved past/today facts and future schedule only. One shared Active Status
result is consumed by every surface. Scheduled unresolved obligations may
materialize canonical automatic Missed, while Unscheduled blank dates never do.
All status-changing surfaces use one canonical command infrastructure.

Full canonical Task History for all Tasks is loaded into the shared startup
snapshot. `resolveActiveTaskStatuses` is the sole shared Active Status
authority; Calendar uses canonical/effective-timeline authority; and Task State
mutations route through the canonical command infrastructure. The rewrite is
active architecture, not pending design.

The final production facts are: 0 active `legacy_uninitialized`, 0 active
`needs_attention`, 0 active canonical Tasks missing a schedule boundary, 581
active canonical Tasks (181 `canonical_proven`, 400 `canonical_runtime`), and
0 remaining legacy-only History rows. Remaining legacy-only History and fake
`legacy_uninitialized` Tasks were intentionally deleted; no old data was
migrated or reconstructed.

The 7.9.33 History migration and 7.9.34–7.9.37 canonical initialization
artifacts are retired historical source records and must not be applied. No
replacement migration SQL was created. Frontend, Edge, SQL, browser, live
Supabase, and deployment parity remain unverified unless separately stated.

## Historical release chronology (not current authority)

### 7.9.34 Final canonical Task initialization correction

- Added dynamic preview, forward migration, and read-only verification for
  active `legacy_uninitialized` Tasks. Initialization preserves raw Task
  metadata, sets canonical lifecycle/workflow state, and creates one
  prospective schedule boundary from the current stored schedule settings.
  It creates no History, occurrences, Calendar overrides, rewards, workflow
  dates, or occurrence identity; malformed schedules fail closed and reruns
  find no candidates after successful initialization.
- Active canonical direct reads now fail closed when their schedule boundary is
  missing, so raw status/repeat/due fields cannot silently regain authority.
- 7.9.35 corrects the preview/migration parent alias and scopes strict
  initialization semantics in the verifier to 7.9.34 migration-created Tasks.
- 7.9.36 corrects the verifier's monthly weekday column alias only; it does not
  change Task State or migration behavior.
- 7.9.37 corrects the initialization migration/preview's raw monthly weekday
  alias so normalized `candidate.*` expansion has no duplicate output column;
  it does not change Task State or migration semantics.
- No 7.9.34/7.9.35/7.9.36/7.9.37 SQL was applied, no Edge Function was deployed, and no production
  data was mutated. The existing 7.9.33 literal History-copy artifacts remain
  unchanged. Browser/live validation remains pending.

### 7.9.33 Final legacy Task State authority cutover

- Added dynamic, execution-time preview/copy/verification SQL for every
  remaining legacy-only History date. The copy preserves Task/date/outcome,
  source legacy ID, and only present `occurrence_due_on` metadata; canonical
  same-date facts win, reruns are safe, legacy rows remain archival, and no
  Task, schedule, occurrence, override, reward, or automation data is created.
- Active Status, Calendar, rollover, action planning, and canonical command
  input now use one direct canonical engine-input mapper. Canonical lifecycle,
  workflow, schedule boundaries, canonical History, occurrences, and Calendar
  overrides are authoritative; raw compatibility status/repeat/due values do
  not overrule them. The legacy adapter remains only as explicit migration/test
  compatibility.
- Added focused cutover and SQL-contract regressions. No SQL was applied, no
  Edge Function was deployed, and no production Tasks/History were changed.
  Browser/live validation remains pending.

### Verified production deployment baseline

For Supabase project `mnwcuinnshsncqrhvsks`, the existing Task State backend is
installed and deployed:

- Before the 7.9.33 deployment, production migration history was verified to
  include `20260818045732 patch_task_state_auto_missed_history_copy_7_9_31`
  and `20260818045827 migrate_legacy_history_copy_7_9_31`.
- `task-state-command` Edge Function is ACTIVE at version `24` with
  `verify_jwt=true`.
- Pinned commit:
  `17f6badd751fe38261aae9cbb5828a979f32de62`.
- Deployment SHA:
  `9c07a32e504333008d08ff79abf04b2641cbfa06dec4c546454e927a9b1d9d65`.

This baseline proves the listed pre-7.9.33 production migrations and the
existing Edge deployment only. It does not prove 7.9.33 or 7.9.34 SQL/app
cutover. The 7.9.33 History copy and 7.9.34/7.9.35 Task initialization artifacts are prepared
but unapplied; production data, remaining legacy decision paths, and browser QA
remain unchanged.

### 7.9.32 Migration Delayed read-authority correction

- Canonical History projection now marks only a `migration_reconstruction`
  Delayed fact with `effective_due_on = NULL` as
  `recurrence_authoritative = false`. The copied fact remains visible on its
  historical Calendar/History date, but cannot establish current Delay state,
  move recurrence, change the due date, or act as a Delay target.
- Normal runtime/user Delayed History with a real `effective_due_on` remains
  recurrence-authoritative. Auto Missed logic and migration SQL structure were
  not changed. Focused source regressions cover historical display, unchanged
  future scheduling, and normal runtime Delay Active Status.
- No SQL was applied, no Edge Function was deployed, and production data was
  not mutated. Browser/live validation remains pending.

### 7.9.31 Final Auto Missed persistence and literal legacy History copy

- Canonical rollover candidate selection now executes a trusted
  `reconcile_rollover` command when the plan contains either a Task patch or
  planned History inserts/deletes. Daily History-only recovery therefore
  persists passed Auto Missed facts without reintroducing settled-task command
  storms; a successful retry is a semantic no-op.
- Zero-History recovery still accepts the current due/cursor, but a historical
  schedule boundary now qualifies only when `anchor_confidence = proven`.
  `high_confidence` alone cannot create historical Auto Missed facts.
- The 7.9.31 exact-ID migration is a literal copy of supported legacy
  Task/date/outcome facts. It preserves `source_legacy_history_id` and only an
  explicitly stored `occurrence_due_on`; it creates no occurrence, schedule
  boundary, effective Delay target, recurrence metadata, Task update, reward,
  automation replay, or additional History inference. Existing canonical
  Task/date facts win and the migration is fail-closed and rerunnable.
- Canonical History now permits `effective_due_on = NULL` for Delayed only when
  the row is a copied historical `migration_reconstruction` fact with migration
  actor, operation, and source-legacy identity. Normal runtime/user Delay
  remains strict and requires a later effective due date.
- Added one forward 7.9.31 SQL patch for the currently installed 7.9.20 RPC
  baseline, plus read-only preview, forward copy, and read-only verification
  artifacts. The three 7.9.30 migration artifacts are marked
  `SUPERSEDED - DO NOT APPLY`.
- Source changes are complete. No SQL was applied to Supabase, no Edge Function
  was deployed, no production migration was executed, and production
  Tasks/History/rewards remain unchanged. Next step: ChatGPT review, then
  explicit production authorization for any SQL, Edge, or migration action.

### 7.9.30 Canonical Auto Missed and legacy migration preparation (superseded)

- Source now extends the existing trusted `reconcile_rollover` command to persist idempotent authorized-automation Missed facts only for passed, provable scheduled obligations. Recovery starts after the latest saved History date, or at a proven current cursor/boundary when History is empty, and never materializes the current open logical day.
- Manual correction can reconcile only later authorized-automation Missed rows that depend on the same rolling occurrence. Independent Daily/fixed facts and manual Missed facts are preserved. Existing stale In Progress automatic Did My Best remains on the same command path, and Missed creates no reward entitlement.
- The 7.9.30 migration preview, forward migration, and verifier are superseded
  by the 7.9.31 literal-copy artifacts and must not be applied.
- This is source implementation only. The Task State SQL/RPC and Edge source changes are **not deployed**, the legacy migration is **not applied**, and production Tasks/History remain unchanged. The next step is ChatGPT review followed by explicit SQL/Edge deployment and migration approval.

### Confirmed legacy-only History finding for later migration

Read-only production audit found legacy-only explicit History dates. The product
owner confirmed these real Task names must be preserved during the later,
preview-first migration: Voids; Advanced Cosmetic and Implant Dentistry, 17th
St Allentown; Bethlehem Smile Design LLC; Gummy Vitamins; Call Jasmine Mavani
and get referall faxed; Chicken Legs; Confirm Referral was faxed; Get Pills;
Ground Turkey; Otter Lego Bootleg; Popsicles; See a Friend.

The 7.9.31 source includes an exact-ID migration that re-queries these rows at
execution time, plus preview and post-verification SQL. It has not been applied;
obvious QA/test Tasks and duplicate-title Tasks outside the confirmed IDs remain
out of scope.

### 7.9.25 Semantic no-action scope correction

- The Edge semantic no-action RPC bypass is now constrained to `reconcile_rollover` only. Other canonical commands retain their existing RPC behavior; the existing production Edge baseline is ACTIVE at v23, while browser/live QA for the simplified architecture remains pending.

### 7.9.26 Rollover History read/cache ownership correction

- Read-only production inspection verified that Vera Reports and Roth Reports still retain their complete canonical History; no History repair, backfill, migration, or other data correction was required.
- The UI regression came from internal rollover History reads sharing the user-visible task-scoped `ready` cache. Rollover now uses an isolated, ephemeral, batched canonical History read lifecycle and does not populate `taskHistoryByTaskId` or `taskHistoryLoadStateByTaskId`.
- Opening the Task History modal revalidates complete canonical Task History with a forced task-scoped read. Existing rows are retained until a successful response replaces them; failures remain in the existing error/retry state, and Retry forces a fresh canonical request.
- The 7.9.23 active-status authority remains intact: an actually hydrated task-scoped canonical History cache outranks sparse workspace History for status, counts, streaks, and Calendar. Internal rollover reads do not opt a Task into that modal-cache lifecycle.
- The 7.9.26 source change itself did not modify SQL or Edge code and did not mutate live data. The verified production baseline is the ACTIVE v23 `task-state-command` deployment and the installed 7.9.20 migration; browser QA remains pending.

### 7.9.27 Simplified Task State read/runtime convergence

- Startup now loads all paged canonical Task History for the authenticated workspace before Task State readiness. TaskApp, Calendar, streaks, filters, counts, smart lists, child previews, editor, Table, and List consume the shared snapshot; task-scoped History refreshes replace that same snapshot, and opening History cannot establish a private status authority.
- Active Status now always uses the Task State Engine projection. The legacy Active Status switch is retained only as a compatibility input surface and no longer selects a current-state result.
- Calendar reads show exact saved outcomes on their recorded dates, Not Due for unsaved past dates, live Open/Due for an unsaved current obligation, and schedule projection only for future dates. Identity-less History before the live fixed or rolling cursor cannot consume that cursor; rolling replay uses the latest relevant successful point.
- Added production-shaped regression coverage for Vera Reports, Roth Reports, FedEx child recurrence, Address Corrections, bounded/full History invariance, unresolved Missed with today Due, rolling correction, Unscheduled streaks, unrelated old History, and zero-History recovery boundaries.
- Persistence-side automatic Missed creation, legacy-only production History canonicalization, SQL/RPC and Edge deployment parity, live Supabase validation, and browser QA remain deferred. No SQL/Edge source or production data changed in this pass.

### 7.9.28 Active Status read/command convergence correction

- `evaluateTaskState` now calculates Active Status once from the resolved engine inputs. Canonical `calendarOverrides` and `workflow` presence no longer selects a competing Effective Timeline status; Effective Timeline remains the Calendar/streak projection.
- Recurring Done and Did My Best facts remain on their Calendar dates while the resolved next due date immediately drives Active Status to Upcoming or Not Due. Unresolved Missed remains higher priority than future schedule labels, including when today is an unsaved Due/Open date.
- Read authority no longer lets stale stored Done/Missed compatibility values override an engine-derived Unscheduled result. Legitimate current workflow and permanent lifecycle states remain engine-derived.
- Added ordinary-read/canonical-plan parity coverage for Done, Did My Best, omitted versus empty canonical inputs, stale Unscheduled statuses, and actual Every 3 Days correction replay. Vera, Roth, FedEx, and Address regression coverage remains passing.
- Auto Missed persistence, legacy History migration, SQL/RPC changes, Edge deployment, live Supabase validation, production data work, and browser QA remain deferred. No SQL/Edge source or production data changed in this pass.

### 7.9.29 Final narrow read-convergence cleanup

- Removed the schedule-change compatibility exception that allowed stored Done or Did My Best to override the resulting future schedule. Active Status now remains derived from the resolved schedule, while saved Done/Did My Best remains History for its handled date.
- Added command/planner regressions for recurring Done and Did My Best due-date changes, repeat changes after a handled outcome, and unresolved Missed precedence over a future schedule.
- Removed standalone Effective Timeline assertions for calculated historical Missed rows and aligned the remaining coverage with saved History, unsaved past Not Due, and current Open/Due rules.
- Auto Missed persistence, legacy History migration, SQL/RPC changes, Edge deployment, live Supabase validation, production data work, and browser QA remain deferred. No SQL/Edge source or production data changed in this pass.

### 7.9.24 Canonical rollover orchestration and no-op correction

- Production rejected invalid `reconcile_rollover` commands during the 7.9.22 source-level SQL/Edge activation attempt, including empty canonical patches and repeated canonical revision increments. The compatibility candidate planner had omitted real stale canonical In Progress workflows when `active_status_logical_date` was null or compatibility status was Missed, while compatibility output could also misclassify current-day canonical workflows. This historical note is not deployment proof.
- Canonical rollover eligibility now uses `workflow_state = in_progress` plus a stale `workflow_logical_date`; current-day canonical workflows are excluded, and compatibility-only rollover projections remain eligible only when no canonical workflow owns the Task.
- Semantic `reconcile_rollover` no-ops return success before the canonical RPC, create no operation row, and preserve `canonical_revision`. Partial sweeps reconcile successful/no-op Tasks and retain only failed candidates for retry, preventing settled Tasks from receiving new revisions on timer, visibility, or pageshow reruns.
- Automatic Did My Best remains the existing trusted 7.9.20–7.9.23 contract, including explicit stale-date History precedence, occurrence identity, recurrence/streak parity, reward-entitlement idempotence, and workflow clearing. The existing 7.9.20 SQL/RPC patch is installed and the task-state-command Edge baseline is ACTIVE at v23. Future SQL/RPC changes required for simplified canonical Auto Missed remain pending; browser QA remains pending, and no live data was mutated by this docs pass.

### 7.9.23 Canonical History active-status read correction

- The production-visible regression was a read-boundary split: a sparse active-status History input could retain an older Missed boundary without the later canonical Done/Did My Best evidence that resolved it. The Task State engine itself returns `pending` (user-facing Open) when the complete canonical chronology is supplied.
- The workspace critical read correction used a preceding scheduled occurrence as a bounded causal boundary. That is transitional implementation evidence, not the locked loading contract: converged startup must load the full canonical History snapshot and the modal must not become more authoritative.
- Added exact Log Calories mixed-history coverage, unresolved-Missed and Done/Did My Best controls, Not Due/Delayed non-success controls, canonical-over-legacy precedence, cache invalidation, status-count parity, and child/Table/List shared-map contracts. No SQL or Edge code changed in that source correction and no live data was mutated; the existing production SQL/RPC and ACTIVE v23 Edge baseline remain installed. Browser QA remains pending.

### 7.9.22 Rollover SQL migration parser correction

- The reviewed 7.9.20 rollover migration was attempted against production and failed atomically at PostgreSQL parse/compile time with `42601` (`syntax error at end of input`) while executing the generated RPC definition. At that failed attempt, the then-current migration history, RPC source/MD5, grants, Tasks, History, and reward data were verified unchanged after rollback. A later verified production migration history now contains `20260817162634 patch_task_state_command_rollover_7_9_20`.
- The defect was the trusted provenance predicates' unparenthesized `<> CASE WHEN ... END` expressions inside PL/pgSQL `IF` conditions. PostgreSQL's PL/pgSQL condition grammar parsed the CASE as an unfinished condition and reached end-of-input. The authoritative `supabase/add_task_state_command_rpc.sql` source and the forward patch now parenthesize those CASE expressions.
- Added an executable local PostgreSQL regression that installs the exact pre-7.9.20 RPC from repository history, applies the real forward migration, and verifies compilation, automatic-rollover guard replacement, authorized-automation provenance fencing, and service-role-only execution. SQL contract coverage remains required.
- At the time of the 7.9.22 correction, reapplication and deployment were still pending. The later verified baseline includes the 7.9.20 migration and ACTIVE task-state-command Edge v23; simplified Auto Missed changes and browser/live QA remain pending.

### 7.9.14 Persistent Batch Edit progress

- Batch Edit preflight remains modal-owned. After the full `taskPlans` preflight succeeds, the modal closes before sequential execution begins.
- A TaskApp-owned session notification reports real `BatchTaskPlan` progress: processed includes both successes and failures, and remaining derives from actual plan completion.
- The final result reports updated and failed counts, while low-energy fallback remains separate from failure accounting. There is no cancellation/retry behavior, no routing architecture change, and no schema change.

### 7.9.15 Batch Edit committed-row reconciliation

- Authoritative Task rows returned by a committed update are reconciled into local Task state even when the containing plan later fails its required History write. Plan accounting remains unchanged: the plan is processed and failed, but not updated. No rollback, schema, or live-data change was introduced.

### 7.9.16 Batch Edit selection cleanup

- Batch Edit now clears selection after any actually applied batch effect, including a committed Task row whose required History write later failed. Plan accounting remains unchanged.

### 7.9.21 Canonical workflow occurrence coherence correction

- Canonical engine input now resolves a non-null workflow occurrence ID against `readModel.occurrences` and uses that occurrence's `scheduled_due_on` as `task.activeOccurrenceDueOn` while the workflow is In Progress. The trusted automatic rollover command and planned History fact therefore use the same canonical occurrence identity and due date as recurrence, streak, and reward planning.
- A dangling non-null workflow occurrence reference fails closed with `WORKFLOW_OCCURRENCE_REFERENCE_INVALID` before the privileged RPC; compatibility `active_occurrence_due_on` remains only the fallback when no canonical workflow occurrence is present. SQL source remains unchanged and retains its existing occurrence agreement validation.
- At the time of the 7.9.21 source correction, SQL/RPC installation and Edge deployment validation were pending. The later verified baseline includes the 7.9.20 migration and ACTIVE task-state-command Edge v23; browser QA and live-data validation for the new architecture remain pending.

### 7.9.20 Automatic stale In Progress rollover

- Canonical rollover now derives a trusted automatic Did My Best only when an active In Progress workflow's logical date is stale and has no authoritative explicit History outcome. The existing engine record-outcome path supplies the stale logical date, actual command execution timestamp, recurrence/cursor behavior, streak resolution, and normal reward entitlement identity; late reconciliation finalizes only the one stale workflow date.
- Existing explicit History wins. No-stale rollover is a no-op at the planner boundary. Successful rollover clears workflow_state, workflow_logical_date, workflow_occurrence_id, workflow_command_id, workflow_revision, active_status_logical_date, and active_occurrence_due_on through the existing canonical/compatibility projection.
- Added the forward-only `supabase/patch_task_state_command_rollover_7_9_20.sql` contract patch. It allows only server-derived authorized-automation `did_my_best` for a stale workflow date, keeps ownership/revision/replay guards, rejects unrelated schedule/Calendar/Delay/terminal/reward payloads, and preserves canonical reward entitlement idempotence. The patch is present in verified production migration history and the task-state-command Edge baseline is ACTIVE at v23; simplified Auto Missed behavior, live data changes, and browser validation remain pending.
- Focused source/test checks are being run for engine rollover, canonical planning, Edge intent/orchestration, recurrence, rewards, replay/idempotence, and SQL contracts. Full build/lint/typecheck and any baseline failures are reported separately after the final edit.

### 7.9.17 Calendar / streak / active-status reconciliation

- Calendar projection presents unhandled dates as Due or Not Due, while active status presents an ordinary pending task as Open. Fixed recurrence non-occurrence dates remain Not Due, unresolved Missed chains outrank Upcoming/Not Due, Not Due and Delayed pause both streak types, and Delayed windows remain Not Due until the delayed due date. Automatic stale In Progress finalization is implemented in 7.9.20; the 7.9.17 behavior itself remains unchanged.

### 7.9.18 Canonical Delay effective-due correction

- Canonical Delay now carries the selected `effective_due_on` into the existing Effective Timeline replay cursor, so the command's History fact, occurrence effective override, compatibility projection, RPC payload, and committed local Task all retain the selected next due date. Delay does not create a schedule boundary or alter recurrence configuration. Source and focused tests are updated; those checks did not independently validate deployment, while the existing SQL/RPC and ACTIVE v23 Edge baseline are verified separately. Simplified-architecture browser validation remains pending.

### 7.9.19 Active Delay History Calendar reconstruction correction

- Failed browser QA found that a canonical Delay saved the live Task due date and Delayed status correctly, but reopening History Calendar reconstructed from the old recurrence anchor. The persisted canonical `effective_due_on` stopped at the History projection boundary, so the ordinary read path could not rebase the active occurrence; a pre-cursor Delayed row was then skipped.
- The read-side correction carries canonical `effective_due_on` through the existing History transport into Effective Timeline reconstruction. Only an authoritative Delayed fact whose effective target agrees with the currently active Delayed Task and current Task due cursor can seed the active cursor. Older or stale Delay facts do not rebase it, and the active Delay is retained even when its action date precedes the original scheduled occurrence.
- Changed-path Effective Timeline, recurrence, non-batch Task History, canonical History projection/read-input, and targeted lint checks passed, plus `git diff --check`. The existing Task History batch-action suite still has 14 baseline failures, the raw-Node read-authority test remains blocked by its `.tsx` loader boundary, and full typecheck retains unrelated baseline errors. Manual browser QA is still required for the live Test I flow: reopen History after Delay, confirm 8/16 Delayed, 8/18–9/5 Not Due, 9/6 Due, resumed Daily recurrence, and unchanged Active Status. Existing SQL/RPC and ACTIVE v23 Edge deployment are verified; simplified-architecture live data and browser validation remain pending.

### 7.9.11 Independent Step/Substep pinning

- Pinning is entity-local for canonical Task, Step, and Substep rows. Table and List child rows can Pin/Unpin independently through the existing Task mutation callback, and the canonical child preview exposes the Task row's `pinned_at` state.
- Pinned membership is the exact entity's non-null `pinned_at`. Directly pinned children appear in Pinned even when Include Steps is off; a pinned parent does not pull unpinned descendants into Pinned.
- Required ancestors may render as hierarchy context only. Context ancestors are not Pinned members and do not inflate the Pinned count. No schema, SQL, or Task State changes are included.

### 7.9.12 Pinned active-search parity

- Pinned active search is direct-entity only: a matching pinned parent does not expand independently pinned descendants, and Include Steps does not change that membership rule. Required ancestors remain hierarchy context only and do not enter Pinned counts or status facets. No persistence or schema changes are included.

### 7.9.13 Pinned hierarchy visibility

- Pinned membership remains the exact entity-local non-null `pinned_at`. The existing Include Steps option can reveal descendants beneath directly pinned entities for hierarchy browsing; revealed descendants are visibility/context only unless independently pinned. Pinned counts remain direct-membership only, and the 7.9.12 direct-only active-search behavior is unchanged. No persistence, SQL, schema, or live-data changes are included.

### 7.9.10 Browser-QA correction: Table hierarchy origin and status footprint

- The 7.9.8 and 7.9.9 browser-alignment attempts remained incomplete because header/parent grids began at a 10px inset while canonical, draft, and source/legacy hierarchy grids began at zero. All Table hierarchy grids now share one origin, preserving the established parent/header geometry; title hierarchy indentation remains internal to the title cell. Normal Table current-status circles use one uniform Task/Step/Substep size, and the Unscheduled Calendar glyph uses the standard status-glyph footprint. Status-state behavior, selectable statuses, and persistence are unchanged.

### 7.9.9 Browser-QA correction: Step/Substep Table alignment

- Attempted to correct the failed 7.9.8 browser-QA portion for Step/Substep Table alignment. Child horizontal alignment follows the resolved column setting while every child cell remains vertically centered; Task Title remains horizontally left aligned with its hierarchy indentation, notes, and multiline behavior intact. Browser QA still found the parent/child grid-origin and current-status footprint mismatches corrected by 7.9.10. No manual-list search behavior changed.

### 7.9.8 Manual-list search and Table alignment parity

- Add Existing Task search in an eligible manual list matches the task title or the task's own tags, case-insensitively, while preserving existing open-task, exclusion, ordering, limit, and direct-membership rules.
- Step and Substep Table cells inherit their configured column alignment through the shared child-cell alignment authority; Task Title remains left aligned regardless of its configured alignment.

### 7.9.7 Repeat filter correction

- The canonical Tasks workspace Repeat filter uses the same `getTaskRepeatCategory` classification as the visible Repeat column. A task displayed as `Weekdays` therefore matches the `Weekdays` filter and does not match `Weekly`; ordinary Weekly, Daily, Daily Until Complete, Monthly, Custom, and No Repeat categories retain their existing identities. Weekdays remains a derived UI/read-model category backed by the existing weekly recurrence configuration; no storage value, recurrence persistence, or scheduling behavior changes.

### 7.9.6 QA correction pass

- Repeat structured filtering and normal ascending/descending sorting classify the exact Monday-Friday weekly interval-1 preset as the derived `weekdays` category. Weekdays has no separate sort mode and remains a normal category between Daily/Daily Until Complete and generic Weekly; recurrence persistence and editor labels are unchanged.
- Last Handled is the latest logical date of an explicit manual Task State action. Its compact workspace summary unions canonical user History facts, active manual Calendar overrides, and committed runtime/manual command operations, while excluding calculated states, rollover, automation, migration reconstruction, repeat configuration, and metadata-only edits. Logical date orders first; legitimate same-date timestamps remain presentation metadata under cutover/provenance rules. Explicit Unscheduled carries an action-origin marker through the existing canonical command result reference so ordinary due-date clears do not count.
- Manual Not Due is neutral for the current positive completion streak and therefore does not break `Did My Best`, `Done`, or `Complete` success continuity. It remains a Missed-streak boundary. Calculated Not Due remains neutral. Browser QA, live Supabase validation, and deployment verification remain unrun.

### 7.9.5 Historical rolling-outcome replay correction

- Historical outcome replay for rolling recurrence processes every later authoritative History row in logical-date order. An older edit cannot leave the rolling cursor at an intermediate date before a later success; the existing Effective Timeline remains the sole replay authority.
- The protected regression is the confirmed Shop sequence: rolling every 2 days, authoritative 2026-08-12 and 2026-08-13 `Did My Best`, then editing 2026-08-12. The projection remains pending with `due_on = 2026-08-15`, keeps the 2026-08-13 fact, and does not synthesize Missed on 2026-08-14. Fixed weekly/monthly cursor protection and ordinary rolling replay remain unchanged. Browser QA, live Supabase validation, and deployment verification remain unrun.

### 7.9.2 Derived Unscheduled display status

- Unscheduled is a UI-only active/display status for open pending Tasks and Steps/Substeps without a current due date. It is projected from the canonical active-status read and is used consistently by status chips, counts, filters, sorting, and status actions.
- Selecting Unscheduled clears the existing schedule/date mutation path; it does not write a database status or create History. Browser QA, live Supabase validation, and deployment verification remain unrun for this release.

### 7.9.4 Manual-list context correction

- Manual-list context removal now requires the exact Task ID to have a direct manual membership in the current eligible list; inherited hierarchy visibility remains display-only for this action. Browser QA, live Supabase validation, and deployment verification remain unrun for this release.

### 7.9.3 Tasks workspace refinements

- Manual-list context removal and the initial Last Handled/Repeat presentation pass were corrected by 7.9.6; see the current release contract above.

### 7.8.18 Legacy History promotion rollback recovery

- Added an unapplied, preview-first rollback tool for one exact `legacy-history-promotion-v1` migration operation. It validates the stored source fingerprint, user, operation identity, provenance markers, expected fact count, and migration contract before a future service-role RPC can delete canonical migration facts. The operation row is retained and marked `failed_retryable` with `ROLLBACK_COMPLETED` metadata; legacy History, legacy evidence, Task State, and rewards are not mutated. Live promotion, rollback, SQL/RPC application, and browser validation remain unrun.

### 7.7.38 Canonical In Progress read projection

- The active-status read path now supplies canonical current-day `workflow_logical_date` through a presentation-only compatibility projection, so canonical In Progress tasks display as In Progress without changing the canonical Task row or persistence semantics. Stale prior-day workflow remains non-current; browser QA remains pending.

### 7.7.37 Canonical Task State runtime activation (historical source note)

- The reviewed trusted Task State boundary is deployed in production through
  `task-state-command` Edge version 23 and the installed Task State SQL/RPC,
  including migration `20260817162634 patch_task_state_command_rollover_7_9_20`.
  This establishes the existing baseline, not completion of the 2026-08-17
  architecture lock; runtime convergence remains pending.
- Browser QA, live runtime parity, and legacy-path removal remain unverified.

## Current Architectural Authorities

### 7.7.40 Canonical creation source parsing

- The trusted canonical Task creation Edge boundary accepts both explicit `task_creation` and omitted creation sources, continues to accept explicit `task_import`, and rejects unsupported source values. SQL, RPC, planner, recurrence, History, reward, Import behavior, and deployment state are unchanged.

### 7.7.39 Trusted canonical Task creation

- With the canonical runtime gate enabled, normal Add Task, editor-based Task creation, and Import now send creation intent through the authenticated `task-create-canonical` Edge boundary. The Edge path derives the verified owner, validates the draft and parent entity kind, builds the canonical TypeScript creation plan, and invokes the service-role-only `adhdice_create_canonical_task` RPC.
- The RPC atomically inserts the Task with `canonical_revision = 1`, initialized terminal/container/workflow state, and its initial schedule boundary. Creation does not write legacy History or canonical reward records. Imported outcome/lifecycle snapshots that require provenance fail closed and remain visible as import errors; pending/open metadata and parent/Step/Substep relationships are preserved.
- The `task-create-canonical` SQL and Edge implementation were source-only for
  that release; this historical note does not describe the existing deployed
  `task-state-command` v23 baseline. SQL execution, live mutations, and browser
  QA for that creation path remain separately unverified.

### M3A.5 Trusted Task State Command Boundary

- The trusted M3A Task State backend/RPC and `task-state-command` Edge path are
  installed/deployed in the verified production baseline: Edge version 23,
  function ID `a2c74ca6-8ddb-4100-8902-5e527fe552c4`, active SHA256
  `7eb64fa20f7eedc2c000bc0c4f3ee1bed3e3de406f31e609afbc54994927e8fd`.
  Runtime convergence and the simplified architecture remain pending.
- The trusted `task-state-command` Edge Function accepts authenticated intent only. Direct authenticated submission of canonical plans or privileged persistence sections is forbidden.
- The Edge Function derives owner identity from verified Supabase Auth, reads only that user's canonical Task State and logical-day profile, invokes the existing pure TypeScript planner, and sends its serialized plan through the backend-only invoker RPC using the modern secret-key admin client.
- Runtime provenance, command identity, entity/owner IDs, timestamps, migration fields, and the SHA-256 accepted-payload digest are established inside the trusted boundary. History/occurrence collection max revisions are not runtime fences; canonical Task `canonical_revision` remains authoritative and schedule `boundary_sequence` protection remains active.
- This trusted boundary is the installed existing baseline. New simplified
  Auto Missed behavior, full-History startup, legacy decision-path removal, and
  active-UI convergence remain pending.

### 7.7.36 M3B pre-activation reward correction behind the disabled gate

- Canonical reward fulfillment is now an authored, minimal RPC contract: `adhdice_fulfill_canonical_reward_entitlement(p_entitlement_id uuid)`. The server locks the owned entitlement, validates exact canonical History provenance, derives successful-occurrence streaks and the existing dice tier, builds one-task/one-claim pending-reward payloads, and records one canonical grant, pending dice item, and award operation. Browser reward payloads, streaks, dice counts, Task arrays, claim references, and token-generating Task counts are not accepted.
- The canonical reward client receives `reward_entitlement_id` from the committed canonical command and invokes only the entitlement ID. Transient fetch retry repeats that same deterministic entitlement identity; it does not read canonical History, recreate History, finalize legacy recurrence, or independently decide eligibility. Successful fulfillment retains the existing pending-reward refresh.
- `blocked` entitlements fail closed. Exact provenance requires the authenticated owner, the entitlement's exact `canonical_history_id`, matching owner/entity/entity kind/logical date/outcome snapshot, a successful `Done`/`Did My Best`/`Complete` outcome, and an authenticated-owner canonical Task. Missed has no entitlement and remains reward-ineligible.
- Reward streaks count consecutive successful logged canonical occurrences, not consecutive calendar dates. Explicit non-successful facts, including Missed, break the streak; one-time Tasks are capped at one occurrence. Existing 1/2/3/4/5/6-die tiers and the existing claim/economy pipeline are unchanged.
- Rewarded Calendar clear remains a temporary initial-activation limitation: if an explicit canonical Calendar fact is already linked to a reward entitlement, clear fails closed with a useful provenance-preservation error and never falls back to legacy History. No tombstone/void system is included here; this single correction path is not an initial activation blocker.
- The source gate value is not deployment or convergence evidence; browser QA and
  runtime parity remain pending.

#### Simplified-architecture deployment follow-up (pending)

- [x] Existing Task State SQL/RPC is installed; production migration history includes `20260817162634 patch_task_state_command_rollover_7_9_20`.
- [x] Existing `task-state-command` Edge Function is ACTIVE at version 23 with the verified deployment ID and SHA256 recorded above.
- [ ] Apply future reviewed SQL/RPC changes required for canonical automatic Missed behavior.
- [ ] Install the reviewed `supabase/add_canonical_reward_entitlement_bridge.sql` source, including removal of the old browser-authoritative overload and installation of `adhdice_fulfill_canonical_reward_entitlement(uuid)`.
- [ ] Deploy and verify any future Edge bundle changes required by the simplified architecture; do not treat v23 as proof of those changes.
- [ ] Verify RPC signatures and privileges for the future changes: authenticated can execute the minimal fulfillment RPC and the trusted command RPC remains service-role-only; anon/public cannot execute either privileged function.
- [x] Record the current deployed Edge version/source identity; future source parity must be checked against the active v23 baseline before cutover.
- [ ] Run the new authenticated smoke and browser QA required by the simplified architecture after its SQL/RPC and Edge changes are installed.

### 7.7.34 M3B runtime wiring behind the disabled gate

- `src/lib/task-state-runtime-actions.ts` is the classification boundary for the next runtime cutover. It explicitly separates metadata-only fields (`title`, `notes`, priority/energy/presentation fields, links, tags, focus/editor metadata, and pin/sort fields) from Task State-owned fields (`status`, schedule/repeat fields, active-status projections, `completed_at`, `trashed_at`, and hierarchy parent changes).
- Runtime coordinator/executor wiring covers the named Task State commands as source implementation evidence, but runtime convergence remains pending. Canonical responses are intended to reconcile the local Task from `canonical_task_patch`, `compatibility_projection`, and `next_revision`; History refreshes must preserve canonical facts and must not recreate legacy truth.
- Canonical History reads are wired through `adhdice_task_history_facts` in the source for workspace, task-scoped, streak, realtime, Records, and report-range paths. The retired legacy table is no longer a runtime read or translation path; the adapter projects explicit facts, including automatic Missed, without synthetic substitutes.
- Remaining-writer audit classification: `CANONICAL` = coordinator-routed lifecycle/outcome/schedule/History-calendar/rollover/batch paths; `METADATA_ONLY` = title, notes, priority, energy, links, tags, focus, pin, and sort persistence; `LEGACY_ONLY_NONCANONICAL_ENTITY` = intentionally unpromoted checklist rows, the inactive `/classic` demo surface, and Settings JSON restore while the gate is disabled; `MILESTONE_ATOMIC_TRUSTED_SEAM` = the trusted Milestone metadata orchestration that invokes canonical Task State for completion/trash/restore. Promoted Steps/Substeps use the same-table canonical Task coordinator, and Milestone Done/Did My Best/Missed outcomes use the canonical coordinator. Settings JSON restore is explicitly fenced while the gate is enabled so its legacy ID-based upsert cannot overwrite canonical status or schedule state.
- Activation installation item: `supabase/add_canonical_reward_entitlement_bridge.sql` is authored for review but not installed. It consumes canonical entitlement identity, derives the existing dice tier from canonical successful facts, and is idempotent by entitlement/grant identity. Delay now resolves a materialized canonical occurrence and fails closed when none exists; undated bench Delay remains unsupported by the locked command contract.
- The prior-day Calendar completion assertion is historical implementation
  evidence only. Under the architecture lock, saved automatic Missed is
  canonical History and may be recomputed only when a manual correction proves
  the dependent obligation was not due; a calculated Missed must not substitute
  for that canonical fact.
- Canonical Calendar replacement upserts the existing entity/logical-date fact while preserving its canonical identity. Clearing removes explicit facts and deactivates dependent Calendar/override references only when no reward entitlement references that fact; reward-linked clear fails closed because the locked entitlement-to-history foreign key cannot be safely orphaned or clawed back in this ticket.
- 7.7.34 activation blocker: the exact unsupported action is clearing an explicit Calendar outcome after its canonical reward entitlement exists. The smallest missing capability is a reviewed canonical void/tombstone outcome (or an equivalently reviewed entitlement-provenance retention change) that preserves the referenced fact without awarding twice; this ticket deliberately does not invent or install that capability.
- Earlier gate-state notes are superseded by the architecture lock: legacy paths
  are migration/translation evidence only and must stop deciding current state
  after convergence.

### Task State Engine

- The shared Task State Engine is the canonical active authority for pure state evaluation, active-status reads, Calendar facts, action planning, rollover planning, reward eligibility, and the allow-listed persistence projection.
- Engine-derived values remain distinct from persisted task-row values. In particular, engine-only `unscheduled` is projected to supported stored `pending`; engine-only cursor or occurrence metadata is not persisted as task-row metadata.
- Guarded revisions, explicit History identity, idempotent no-op handling, and engine/legacy mutual exclusion remain load-bearing safety boundaries.
- [`docs/TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md) is the canonical contract reference; release chronology remains in the historical archive.

### Workspace, Loading, and Cache Ownership

- Full canonical Task History for all Tasks is required at workspace startup. The
  former bounded critical-vs-modal-full distinction is transitional and must be
  collapsed; modal History is not a more authoritative state read.
- Query changes should reuse stable workspace facts and avoid invalidating canonical entities, status authority, Archive/Trash sets, or unrelated page data.
- Workspace performance diagnostics are development-only. Browser evidence for commit counts, inactive-page CPU, cross-tab/BFCache behavior, and Safari paint behavior remains unverified.
- [`docs/WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) is a qualified source diagnostic, not canonical runtime proof; its browser, deployment, and performance questions remain unresolved.

### Task History and Readiness

- Startup readiness includes the full canonical Task History snapshot. A failed
  or incomplete History load must expose error/retry and must not become an empty
  successful snapshot or a legacy fallback.
- History consumers must expose loading and retry states until the requested task's data is ready.
- History readiness must not widen unrelated startup work or replace canonical current-state facts with partial detail payloads.
- Existing task/History contradictions are not repaired by this runtime correction; they require a separate preview-first data-repair ticket after runtime QA.

### 7.7.11 Task State Engine Authority Hardening

- Confirmed failure modes: task-scoped History query failures returned `false`, while multi-task callers discarded those failures and continued with cached, partial, or empty arrays; full editor and batch saves also continued after Task State Engine `validationErrors`.
- The corrected loader contract is `TaskHistoryLoadResult`: `{ status: "ready", history, error: null }` for a complete load or `{ status: "error", history: null, error }` for a failed/incomplete load. `loadTaskHistoryForTasks` returns that result per task and never substitutes stale cache data for a failed load.
- Generic task updates, full editor saves, batch edits, TaskApp status/delay/complete actions, and engine rollover now abort occurrence-sensitive work on a failed authoritative History load before task, History, reward, recurrence, or fallback writes. The successful History snapshot is forwarded into the History writer to avoid a second unguarded reload.
- The shared occurrence-sensitive classification covers changed `status`, `due_on`, `due_time`, all repeat/cadence fields (`repeat_frequency`, `repeat_interval`, `repeat_days_of_week`, `repeat_day_of_month`, `repeat_monthly_mode`, `repeat_monthly_ordinal`, `repeat_monthly_weekday`), `completed_at`, `active_status_logical_date`, `active_occurrence_due_on`, and explicit engine/history actions (`engineManaged`, `historyStatus`, `historyEntry`, or `historyEntries`).
- Metadata-only title, notes, link, priority, tags, energy, estimate, focus, and related non-occurrence edits do not force a full task History reload. Batch preflight rejects the whole batch before any task write when an occurrence-sensitive task fails loading or authority validation.
- Verification performed for this slice: 118 focused Task State Engine, workspace-data, integration, and task-action-hook tests passed; targeted ESLint for changed production hooks/libs reported 0 errors and 2 existing workspace warnings; `git diff --check` passed; `npm run build` passed with Next.js 16.2.4/Turbopack.
- Deferred risks: browser-visible failure notifications, live Supabase/deployed RPC behavior, multi-tab/BFCache behavior, broad lint/typecheck/full-suite debt, batch History query optimization, rollover concurrency changes, stale In Progress schedule-edit behavior, and historical data repair remain separate tickets.

### 7.7.12 Live Task Status Reconciliation

- Failed 7.7.12 browser result: after moving a recurring task due today to a future date, persistence and Calendar recalculation succeeded, but the open Table status circle stayed Pending/Open until refresh.
- The prior cache-only diagnosis was incomplete: 7.7.12 reconciled the task-scoped History cache, but the visible Table row projection did not consume the resulting active-status authority map.
- Affected paths: generic due-date/task updates, full editor schedule saves, batch schedule edits, Task History calendar updates, and shared direct status actions that reconcile through the same History writer.
- Reconciliation mechanism: successful schedule mutations now pass their authoritative loaded Task History snapshot through the shared local mutation callback; successful History inserts, replacements, and removals pass their complete post-mutation snapshot through the same callback. The callback updates an already-open task cache and its one-task streak summary, while the Task State Engine still derives visible status from the updated Task plus History inputs.
- Focused verification: 108 focused hook, Task History, Task State Engine, rollover, streak-summary, and workspace-data tests passed, including immediate future Not Due, restored-today Pending, History replacement, Test D fail-closed behavior, and no-cache-mutation failure paths.
- Deferred risks: browser QA, live Supabase/deployed RPC parity, multi-tab/BFCache behavior, stale In Progress schedule handling, batch History-query optimization, rollover concurrency optimization, historical repair, and full lint/typecheck/full-suite debt remain separate.

### 7.7.13 Live Active Status Row Projection Correction

- Confirmed runtime diagnosis: the due-date-only schedule mutation carried the raw persisted `missed` state into `change_schedule`; the active-status evaluator then let ambiguous older Missed History override the later `Done` outcome and non-overdue future schedule. The renderer, row cache, and display-status map correctly displayed that upstream result.
- Correction: due-date-only intent remains limited to changed schedule fields, while `change_schedule` derives the post-edit active status from the updated schedule, logical date, authoritative History, active occurrence fields, overdue authority, current-day outcome, and recurrence authority. Ambiguous or non-matching older Missed rows no longer force active `missed`; a concrete active Missed occurrence or genuine overdue authority is required.
- Older Missed History and the later Done History remain intact. No History rows are inserted, deleted, or rewritten for the confirmed future-date case, and explicit Missed status actions retain their status and History behavior. Temporary status tracing was removed completely.
- Focused verification: `test/task-state-engine.test.ts` and `test/task-state-engine-integration.test.ts` passed 76/76; `test/task-live-status-render-integration.test.ts` passed 1/1. Narrow semantic ESLint passed cleanly. Broader targeted lint remains baseline-red with 51 existing errors and 76 warnings in protected TaskApp/Table/List surfaces. `git diff --check` passed, and elevated `npm run build` passed with Next.js 16.2.4/Turbopack.
- Browser QA remains Andrew's next step: move Test D with the 8/3 and 8/4 Missed plus 8/5 Done History to a future date, confirm the circle immediately becomes the existing future/Not Due state, then refresh and confirm it remains unchanged.

### Task Hierarchy and Orchestration

- Same-table Steps/Substeps already have shared hierarchy derivation, previews, editor routing, and same-parent reorder/drag behavior.
- Remaining deferred hierarchy work is narrower: cross-parent movement, promote/demote, broader legacy-subtask migration, custom child metadata/reward rules, and any recurrence semantics that still require product approval.
- [`docs/TASKAPP_ARCHITECTURE.md`](TASKAPP_ARCHITECTURE.md) and [`docs/TASKAPP_SOURCE_MAP.md`](TASKAPP_SOURCE_MAP.md) describe current TaskApp ownership and source boundaries; [`docs/task-hierarchy-plan.md`](task-hierarchy-plan.md) is the active hierarchy decisions document.

### Persistence Boundaries

- Mutations must use the shared guarded task and History paths, preserve optimistic-concurrency checks, and avoid zero-effective writes.
- The existing Task State deployment baseline is verified separately: ACTIVE `task-state-command` Edge v23 and migration `20260817162634 patch_task_state_command_rollover_7_9_20`. Future simplified-architecture SQL/RPC changes still require separate installation and verification.
- Optional Google integration configuration exists in source, but public Pages variables, Edge deployment, and user-facing activation remain unverified.
- Existing release history records the exact repair scopes, SQL filenames, row counts, and verification limitations in the [historical archive](archive/2026-08-retired/current-state-release-history.md).

## Confirmed Open Issues and Unverified Risks

- The black/glitched HUD/UI state during reload or boot remains an open source-documented issue; it is not documented as fixed.
- Browser behavior remains unverified for the startup/rendering, Safari paint, performance, cross-tab, and BFCache claims recorded in the 7.6.x history.
- The refreshed engine authority and workspace diagnostic still require review when their covered seams change; runtime evidence gaps remain unresolved.

## Fragile and High-Risk Seams

- Root workspace ownership and startup sequencing around `TaskApp` and `useWorkspaceData`.
- Task History readiness, recurrence rollover, and explicit occurrence identity.
- Shared task mutation, reward, revision/conflict, and persistence-projection paths.
- Shared Table/List hierarchy rendering, editor routing, row-model caching, and render boundaries.
- The boundary between the verified existing SQL/RPC and future simplified-architecture deployment, including any path that could reconcile stale state.
- Browser/Safari paint behavior around scaled shells, sticky/nested scrollers, and translucent layers remains an evidence problem, not a claimed fix.

## Active Warnings and Constraints

- Treat the Task State Engine switch and its connected read/action/Calendar/rollover consumers as one compatibility boundary.
- Do not persist engine-only status, cursor, or occurrence metadata, and do not replace canonical rows with partial payloads.
- Do not use historical release notes as current authority; use the linked canonical contracts and verify freshness caveats.
- Browser QA, simplified-architecture live Supabase behavior, future RPC state, multi-tab behavior, BFCache behavior, and Safari rendering require separate authorized verification; the existing Edge v23/migration baseline is recorded above.

## Immediate Priorities

1. Keep the black/glitched reload seam isolated for a dedicated diagnosis before changing adjacent UI or performance paths.
2. Obtain the missing browser/runtime evidence for startup, search responsiveness, History readiness, cross-tab/BFCache behavior, and Safari paint before claiming those risks resolved.
3. Keep future recurrence, hierarchy, persistence, and migration tickets bounded by their documented authority and approval requirements.
4. Treat snapshot/restore and broader legacy-subtask migration as deferred work; no implementation scope is inferred here.

## Related Canonical Documents

- [`docs/INDEX.md`](INDEX.md) — documentation roles and source-of-truth map.
- [`docs/AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md) — work modes, scope control, and handoff rules.
- [`docs/VERIFICATION.md`](VERIFICATION.md) — production-path verification and reporting requirements.
- [`docs/TASKAPP_ARCHITECTURE.md`](TASKAPP_ARCHITECTURE.md) — current TaskApp production routing and ownership contract.
- [`docs/TASKAPP_SOURCE_MAP.md`](TASKAPP_SOURCE_MAP.md) — current TaskApp source and symbol lookup.
- [`docs/TASK_STATE_ENGINE.md`](TASK_STATE_ENGINE.md) — canonical engine authority and persistence boundary.
- [`docs/WORKSPACE_LOADING_ARCHITECTURE.md`](WORKSPACE_LOADING_ARCHITECTURE.md) — qualified source diagnostic for loading and readiness ownership.
- [`docs/task-hierarchy-plan.md`](task-hierarchy-plan.md) — current hierarchy decisions and unresolved movement/migration boundaries.
- [`docs/daily-until-complete-plan.md`](daily-until-complete-plan.md) — current Daily Until Complete rules, limitations, and unresolved decisions.
- [Historical 7.6.x and earlier release notes](archive/2026-08-retired/current-state-release-history.md).

## Historical Release Notes

- Historical release chronology is preserved in [`docs/archive/2026-08-retired/current-state-release-history.md`](archive/2026-08-retired/current-state-release-history.md).
- The archive is reference-only and is not part of routine current-state context.
- This file is the operating summary; the archive is the detailed chronology.
- Keep new operational facts here only when they are confirmed by current documentation.
