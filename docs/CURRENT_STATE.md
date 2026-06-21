# Current State

Last reviewed: 2026-06-20

Role: active working

## Current App Version
- Current working app version: `6.7.10`.
- Current release group: `6.7.x` same-parent Step/Substep drag reorder.
- Version surfaces that should stay aligned for code-changing implementation work:
  - `package.json`
  - `package-lock.json`
  - `public/app-version.json`
  - visible app constants in `src/components/task-app.tsx` (`APP_VERSION` / `HUD_VERSION`)

## 6.2 Checkpoint
- The existing dense task table experience is now explicitly `Table View`.
- A true `List View` exists for desktop and mobile.
- Table View and List View now share one stable task shell.
- The shared shell puts search, actions, and view controls on row 1, with list chips on row 2.
- List View metadata chips are back on the approved pill styling.
- List View quick-edit panels use the approved task-table chip language.
- In List View, status interaction opens an inline panel instead of instantly completing the task.
- Tags, due date, priority, repeat, and list/category quick-edit panels exist where supported in List View.
- In `6.2.7`, the desktop search width was widened to improve the shared shell layout.
- In `6.2.8`, first-boot authenticated body render is gated behind the same boot readiness seam as the HUD so default theme/profile state does not flash during reload.
- In `6.2.9`, the first-boot gate keeps the same behavior while moving its boot-complete effect back into the unconditional hook path, fixing the React hook-order crash during auth/session transitions.
- In `6.2.10`, the full HUD loading shell is limited to first boot so later tab-return and resume sync states keep the live HUD mounted instead of swapping back to the placeholder shell.
- In `6.2.11`, the live HUD brand tile and workspace glass surfaces keep subtle fallback fills so Safari tab-return resume is less likely to repaint them as black/glitched blocks while the live HUD remains mounted.
- In `6.2.12`, those live HUD fallback fills are still present, but their light/dark opacity balance is softened so the HUD reads closer to the earlier glass treatment instead of a solid gray slab.
- In `6.2.13`, List View task cards open the shared task row context menu on right-click so row actions stay aligned with Table View for the clicked task.
- In `6.2.14`, the live fixed HUD/header wrappers use slightly stronger light-mode fallback fills so the full-width top region is less likely to reveal a black compositor/backdrop state after idle or tab return, without changing the first-boot-only loading-shell gate or the inner HUD widget layout.
- In `6.2.15`, that wrapper-only hardening is rebalanced toward a cooler, lighter-tint glass and a softer inner blur so reload no longer washes the upper task body in a frosted-white slab while still avoiding the delayed black header seam.
- In `6.2.16`, the confirmed failing outer fixed HUD/header wrapper now paints as a direct light surface without the broad full-width backdrop blur, so Safari is less likely to mis-compose that top shell after reload, idle, or tab return while the inner live HUD layout stays intact.
- In `6.2.17`, the outer fixed HUD/header wrapper owns one solid direct-painted surface, while the accumulated brand-tile and widget fallback fills from the earlier hardening attempts are removed or returned to their pre-hardening treatment so the live HUD reads as one connected surface.
- In `6.2.18`, the live HUD shell, logo/version wrapper, workspace, and widget tiles inherit one solid white surface token in light mode instead of stacking different translucent fills; the XP label is also protected from flex shrink so it cannot collapse into an unlabeled purple block.
- In `6.2.19`, tab hide no longer writes visible resume-pending state, and silent resume refresh preserves existing task, subtask, economy, and profile identities when fetched values are unchanged; the rendered command-center avatar also receives the stable HUD fallback surface and priority loading.
- In `6.2.20`, the initial workspace loading gate now clears in the same React transition that commits critical task, subtask, profile, and economy data, so the loading shell cannot disappear one render before the authenticated workspace is ready.
- In `6.2.21`, the top HUD uses normal-flow sticky positioning instead of a separate full-width fixed compositor layer; the obsolete measured-height spacer and resize observer are removed while the HUD layout, controls, and first-boot shell remain unchanged.

## 6.3 Checkpoint
- In `6.3.1`, the Focus page history area gains a local client-side search for the existing “View all entries” list, matching existing session fields without changing scoped stats, timers, task search, or persistence.
- In `6.3.2`, the lower Focus page area becomes the first Focus Insights architecture pass: scoped category goal scoreboard first, KPI overview second, and the searchable session log third, while preserving timers, Focus history records, and edit/delete flows.
- In `6.3.3`, the Focus Insights lower page is visually tightened with a denser goal scoreboard, calmer KPI cards, softer empty states, reduced nested borders, and extra bottom-nav clearance without changing Focus data behavior.
- In `6.3.4`, the Focus Dashboard shell widens on desktop and the Goal Scoreboard switches to a responsive two-column layout at wide breakpoints while preserving the mobile/tablet single-column flow and existing Focus session behavior.
- In `6.3.5`, the Focus Dashboard Session Log gains a wide-desktop two-column layout and the Goal Scoreboard now sorts by active-scope logged focus time first, with zero-time categories grouped afterward alphabetically.
- In `6.3.6`, the Focus Dashboard gets additional page-local bottom scroll clearance so lower goal rows and session cards can scroll above the floating bottom navigation without changing dashboard data behavior.
- In `6.3.7`, the Focus Dashboard floating-nav overlap is addressed at the fixed dock render path: on desktop Focus, the default bottom dock renders as the existing right-side vertical rail, while mobile/tablet keep the bottom dock and Focus page padding is reduced from the large desktop spacer.
- In `6.3.8`, the Focus Dashboard removes the desktop-only forced right-rail override so the dock again respects the user’s existing nav placement/collapse settings on Focus, while keeping the wider dashboard shell, two-column Goal Scoreboard, two-column Session Log, active-scope-first Goal Scoreboard sorting, and modest desktop bottom clearance for horizontal dock mode.
- In `6.3.9`, the Focus Dashboard adds two more scoped analytics sections between the overview and Session Log: Time Distribution, which uses the existing in-memory session history to show daily totals across weekly/monthly scopes and individual session bars for daily scope, and Category Breakdown, which ranks scoped focus time with calm horizontal bars while preserving the earlier Goal Scoreboard layout/sorting and Session Log behavior.
- In `6.3.10`, the Focus Dashboard keeps the same Category Breakdown analytics and section order, but gives that section the same responsive two-column desktop layout pattern already used by the Goal Scoreboard and Session Log while preserving mobile/tablet single-column behavior.
- In `6.3.11`, the Focus Dashboard replaces the standalone Consistency View with an experimental Chart options section between Category Breakdown and Session Log: the grouped review area keeps multiple native CSS/SVG visualizations local to `focus-history.tsx`, including total bars, stacked category bars, ranked category bars, focus-type bars, session-length buckets, goal actual-vs-target bars, a cumulative line, and a compact consistency mini-grid, all derived from the existing scoped focus history/category data.
- In `6.3.12`, the first Chart options card is re-skinned into a compact Activity summary inspired by the selected reference: it keeps the same scoped in-memory total-bar data, but presents the total, prior-period delta, and rounded monochrome bars in a tighter review card without changing the rest of the Focus Dashboard experiments.
- In `6.3.13`, that first Chart options card is corrected to follow the provided Activity chart component structure more directly: a Card-style shell, dropdown trigger, large total, trend row with icon, and Framer Motion animated bars, all still kept local to `focus-history.tsx` because the repo does not currently ship the shadcn card/button/dropdown primitives the original snippet imports.
- In `6.3.14`, the Activity summary card is promoted out of the Chart options experiment into the main Focus Dashboard chart position immediately after the overview. It now supports Overall and Categories modes using only scoped focus history/category data, while the remaining experimental chart options stay grouped below Category Breakdown without duplicating the promoted Activity card.
- In `6.3.15`, the remaining chart experiment gallery is removed so the Focus Dashboard consolidates around one primary chart system: the Activity Summary card after the overview, followed by Category Breakdown and the Session Log. The Overall and Categories modes stay intact, while the duplicate ranked-category, goal, consistency, cumulative, type, and bucket experiments are deleted from `focus-history.tsx`.
- In `6.3.16`, the Activity Summary chart lane scrolls horizontally inside the card shell and each bar shows a compact time value above it, so category-heavy scoped views stay readable on mobile without changing the existing Overall/Categories data derivations.
- In `6.3.17`, the Activity Summary is pulled out of the lower Focus Insights shell and rendered as the primary summary card directly below the timer clocks, while the chart lane is tightened so labels and scroll affordance do not collide and Categories mode bars inherit their corresponding category colors with a neutral `Other` fallback.
- In `6.3.18`, the Activity Summary becomes a full-width stacked hero with its own independent Daily/Weekly/Monthly scope and date controls, while the lower Focus Insights shell keeps its full separate header and controls; empty daily activity now stays on the selected day instead of hiding the scope controls, so weekly and monthly remain immediately available from the card.
- In `6.3.19`, the lower Focus Dashboard resets around the Activity card language: the full-width Activity Summary remains directly under the timer clocks, the old mixed Focus Insights shell is replaced by stacked Goal Activity, Category Activity, and Scope Snapshot cards beneath it, and the Session Log stays intact below as the editable detailed source of truth.
- In `6.3.20`, the Focus page hides the lower Focus Dashboard, Focus Insights analytics, converted Activity analytics cards, and Session Log from the rendered page while keeping the full-width Activity Summary directly below the timer clocks for a cleaner review pass.
- In `6.3.21`, the single Focus Activity card is polished with readable wrapped axis labels, shared top-row segmented controls, human-readable date ranges, absolute previous-period duration deltas, goal tracks with actual fills, and restored goal-edit access from the card header.
- In `6.3.22`, the Focus Activity card switches its scope/mode controls and history actions to the shared task-table chip language, moves date/range arrows beside the displayed range label, improves compact bar-value typography, and adds an in-card collapsible Focus History list with the existing edit/delete entry flow.
- In `6.3.23`, the in-card Focus History area drops the muted purple panel fill, lays expanded entries out as responsive multi-column cards, and tightens the Activity range arrow chips while preserving the existing entry edit/delete flow.
- In `6.3.24`, Focus Activity and in-card Focus History duration totals round to the nearest minute and stop rendering seconds, while the global timer duration formatter remains untouched for live timer surfaces.
- In `6.3.25`, the Focus Activity Daily/Weekly/Monthly and Overall/Categories chip controls keep the shared task-table chip colors but connect into grouped segmented toggles with shared borders.
- In `6.3.26`, the Focus Activity date/range label becomes a clickable scrollable range picker with entry-count and rounded-duration hints while preserving the existing arrow-step controls.
- In `6.3.27`, Focus Activity date labels switch from dash dates to slash dates, and Daily picker rows append the weekday after the date.
- In `6.3.28`, the Focus Activity date/range picker trigger is tightened to a smaller chip scale while keeping the existing scrollable picker behavior.
- In `6.3.29`, Focus Activity utility and inactive controls switch to white/elevated outline fills so the chips read as outlines against the card surface.
- In `6.3.30`, the Focus Activity date/range picker trigger is tightened again by reducing text size, padding, gap, and chevron size.
- In `6.3.31`, the Focus Activity date/range picker trigger text is reduced to 10px for a smaller chip footprint.
- In `6.3.32`, the Focus Activity date/range picker trigger gets an explicit compact height, tighter line box, and smaller chevron so the size reduction is visually apparent.
- In `6.3.33`, the Focus Activity range arrow chips reduce horizontal padding, and the date/range picker trigger moves to 8px text with `px-2.5`.
- In `6.3.34`, the Focus Activity range arrows receive explicit compact chip dimensions and smaller icons, while the date trigger wraps its 8px label in its own line box for clearer vertical spacing.
- In `6.3.35`, Daily Overall Focus Activity session bars stop repeating the summed daily category goal and use richer session x-axis labels with category, subtype, note, and start-to-logged time.
- In `6.3.36`, the Focus Activity range arrow chips keep compact explicit dimensions but restore readable chevron sizing so the arrows do not collapse into tiny marks.
- In `6.3.37`, the Focus Activity date/range trigger label returns to a readable 10px text size while keeping the compact outline chip layout.
- In `6.3.38`, the Focus Activity date/range trigger moves to the same normal text scale as the trend row and expands the chip height/padding so the larger label is not visually constrained.
- In `6.3.39`, Focus Activity Daily Overall bars use each session category's daily goal, and Weekly Overall day bars derive goals only from categories logged on that day instead of repeating the full app-wide daily goal total.
- In `6.3.40`, the Focus page adds a second Activity-style card below the main Focus Activity card with a native SVG line graph whose series colors come from the logged focus categories.

## 6.4 Checkpoint
- In `6.4.2`, the architecture decision for children/substeps metadata was locked in `docs/task-hierarchy-plan.md`: same-table child tasks through `parent_task_id`, hybrid bridge/migration from legacy subtasks, and no expansion of `adhdice_task_subtasks` into a duplicate task model.
- In `6.4.3`, `src/lib/task-hierarchy.ts` gains a read-only same-table hierarchy adapter that identifies top-level tasks, children, grandchildren, deeper descendants, orphans, cycles, depth, sibling order, and parent/child lookup maps without changing visible rendering, persistence, schema, rewards, recurrence, archive/trash, or editing UI.
- In `6.4.5`, `computeTaskAppDerivedData` returns a hidden `taskHierarchyDiagnostics` object built from the current flat task array with `buildTaskHierarchyAdapter`, without changing task rendering, filters, counts, persistence, rewards, recurrence, archive/trash, or editing behavior.
- In `6.4.7`, `computeTaskAppDerivedData` also returns a read-only `childTaskPreviewByParentTaskId` lookup from the full flat task array, and the shared `TaskManagementTableV2` full overlay renders a source-distinct `Child tasks` preview for the selected task without changing Table/List top-level rows, filters, counts, sorting, persistence, legacy Steps, rewards, recurrence, archive/trash, or schema.
- In `6.4.8`, the `Child tasks` preview can create real same-table child task rows through the existing normal task creation path with `parent_task_id` set, and child preview rows can open through the existing shared full-overlay inspector path for normal task editing and grandchild creation without changing schema, rewards, recurrence, archive/trash, legacy Steps, or flat-view filtering rules.
- In `6.4.9`, valid same-table child tasks and grandchildren are hidden from primary top-level Table/List row arrays, search results, list counts, and status counts, while orphans/cycles remain visible as ordinary rows and full task data still backs the `Child tasks` preview plus child open/edit flows.
- In `6.4.10`, the root layout suppresses benign body-level hydration warnings caused by browser extensions injecting attributes before React hydrates, without changing app-rendered UI behavior.
- In `6.4.11`, Focus clock category titles reuse the softer Focus Activity trend text treatment instead of the previous heavy uppercase label styling.
- In `6.4.12`, Focus clock category titles keep that same body-font treatment but increase to a larger medium-weight size so they read closer to the Activity Summary text.
- In `6.4.13`, Focus clock category titles increase two Tailwind text steps from `text-base` to `text-xl` while preserving the same body-font treatment.
- In `6.4.14`, the full task overlay pivoted the same-table `parent_task_id` hierarchy preview to user-facing Steps language: Add Step created a real task row, nested rows were labeled Step/Substep by depth, and the old lightweight `adhdice_task_subtasks` editor remained in a separate transition-only surface while migration stayed gated. That split user-facing surface is superseded by `6.4.20`.
- In `6.4.15`, the legacy Step promotion bridge gains a durable `adhdice_legacy_subtask_promotions` mapping type/schema record plus dry-run and manual promotion helpers. The dry run reports mapped, eligible, skipped, ambiguous, parent-missing, parent-archived/trashed, ordering, parent mapping, status mapping, and sample rows without creating task rows; live promotion remains an explicit manual action and is not wired to automatic UI execution.
- In `6.4.16`, Settings gains a Legacy Step Promotion operator surface with an explicit dry-run report, reviewed/armed confirmation, and manual promotion action. Workspace loading now fetches `adhdice_legacy_subtask_promotions`, mapped migration-source rows are suppressed from Table/List render data to avoid duplicate Steps, and unmapped migration-source rows remain available during transition.
- In `6.4.17`, Table View parent rows gain an expandable same-table Steps section and List View cards gain a compact Steps preview. Both use the existing `parent_task_id` hierarchy lookup, show Step/Substep depth plus status, due/scheduled date, priority, and estimate metadata where available, and open Steps through the normal task inspector/editor path.
- In `6.4.18`, nested Table/List Step preview rows are directly clickable and keyboard-openable while preserving the normal inspector/editor path. The Step/Substep label helper is shared and covered by focused tests. Inline quick actions and move/reorder/promote/demote remain deferred because the safe path is the existing inspector and hierarchy movement needs explicit product rules.
- In `6.4.19`, Table View corrects the same-table Steps visual architecture: expanded `parent_task_id` Steps render as compact child mini rows under the parent using the parent table column grid for status, schedule, estimate, actual time, tags, link, notes, priority, energy, repeat, and status metadata. The parent task keeps its own normal metadata row, valid same-table Steps remain hidden from top-level rows, and mapped migration-source rows stay suppressed.
- In `6.4.20`, normal task UI returns to one user-facing Steps concept: the full Edit Task UI no longer renders a separate same-table explanation panel, same-table `parent_task_id` Step rows appear inside the unified Steps section with metadata and open the normal editor, Add Step uses the same-table child-task creation path, and unmapped migration-source rows can still appear under the same Steps section without a separate old-checklist label. Settings keeps migration/operator wording because that is the admin surface for dry-run and gated promotion.
- In `6.4.21`, Table View removes the remaining title-cell-only Step tree that showed migration-source rows as a red status icon plus title without metadata. Expanded source-only rows now render under the parent as compact mini rows using the same table column grid with real status/title and honest empty metadata chips, while same-table Steps continue to render with their real task metadata.
- In `6.4.22`, same-table Step rows are restyled to share the parent task row architecture instead of separate card/spreadsheet rows: Table View rows sit on the same white surface with parent-like row spacing, Edit Task/List Step previews remove the `Open` chip, row click selects the Step through the existing editor path, selected Steps get a parent/back affordance, and same-table Step rows expose a trash icon wired to the existing task delete/trash flow. Unmapped migration-source rows remain transitional with status/title only.
- In `6.4.23`, the full Edit Task Steps interaction is corrected so clicking a same-table Step inside the parent editor keeps the parent editor shell open and retargets only the right-side Meta Data panel. The Meta Data helper line now names the active metadata target such as `Moisturize (AM) | Parent` or `Face | Step`, Step field edits continue through existing task update callbacks, and a `Parent metadata` chip returns the right panel to the parent without opening a separate Step editor.
- In `6.4.24`, Step-targeted Meta Data mode restores the Step control row on the right panel: current status icon, all status icon choices, Add Step/Substep through the same-table creation control, and same-table Step delete through the existing task trash/delete flow. Parent metadata mode remains unchanged.
- In `6.4.25`, those Step mode controls move to the selected Step row in the left Steps column instead of living in the right Meta Data panel. The selected same-table Step row now contains the status icon picker plus Add Step/Substep and delete controls, while the right panel remains metadata-only.
- In `6.4.26`, the selected Step-row Add Step/Substep control changes from a text chip to a circular shoeprints icon button while preserving the same same-table child creation behavior.
- In `6.4.27`, normal Table/List Steps labels no longer expose implementation count copy such as `direct steps` or `total step rows`; the UI just says `Steps`. The existing Steps smart-list rule now treats both visible migration-source rows and valid same-table `parent_task_id` children as Steps, so parents with new same-table Steps appear in Steps lists without hiding or mutating old source rows.
- In `6.4.28`, Table View Step title cells fill the Task column like parent rows, use a smaller depth offset, and render Step titles with medium weight so rows sit closer to the parent task name without the bold title look.
- In `6.4.29`, the Table View parent shoeprints Step button opens a focused inline same-table Step title draft row under that parent instead of opening the Edit Task UI or creating an old source Step. Same-table Step titles in the full Edit Task Steps list can also be clicked and renamed through the existing task title update path.
- In `6.4.30`, Table View inline action rows now render directly under the row they edit: parent metadata actions appear before expanded Steps, and same-table Step row clicks/metadata chips open an inline action row under that Step instead of opening the full Edit Task UI.
- In `6.4.31`, Table View Step inline action rows render from Step preview metadata even when the same-table Step is hidden from the top-level row array. Step metadata chips can open action rows directly under the Step, and Step title clicks switch to a compact in-row rename input that uses the existing task title update path.

## 6.5 Checkpoint
- In `6.5.0`, the same-table Steps cleanup pass brings List View previews closer to Table View behavior: Step titles can be renamed in-row, Step metadata uses the shared chip quick-panel pattern for the List-supported status, due, priority, repeat, list, and tag fields, and List parent/Step titles use the shared table title typography.
- Table View Step rows now preserve richer preview metadata for hidden child task rows, including Date Added and task-history streak stats, and the mini-row surface includes the Step icon, history access, delete access, date-added cells, and streak/missed-streak chips where applicable.
- Table View Step due chips use the same concise due copy as parent rows (`Today`, not `Due Today`), expanded Step rows sit closer to the parent Steps toggle area, and clicking an already-open Step metadata chip follows the same close-on-repeat inline action behavior as parent chips.
- The Edit Task Steps area keeps one user-facing Steps section, uses the circular Step icon on Add Step controls, removes the redundant status chip from same-table Step rows, and makes the desktop Meta Data column sticky so it stays available while scrolling the left Steps list.
- In `6.5.1`, the follow-up parity pass restyles parent and Step row action icons as bare icons with hover/focus circles, moves Step shoeprints actions beside history/delete, and uses the shoeprints action to open inline substep drafts under the clicked Step.
- In `6.5.2`, Focus timers become an active-session sandbox: a searchable category picker starts clocks, inactive categories stay out of the clock canvas, pause/play and gear remain as the primary controls, and the gear tray exposes submit, reset, and repeatable five/ten-minute adjustments. Clock-face adjustments use a wider input with external five-minute steppers, and running subtraction now adjusts the displayed elapsed total while clamping at zero.
- In `6.5.3`, the Focus timer picker is reduced to half its prior desktop width, active clock rows center their visible clocks on mobile and desktop, and the timer gear plus quick-adjust numerals are enlarged for clearer recognition.
- In `6.5.4`, Focus timer dropdown and sandbox scrollers hide their scrollbar chrome while preserving scrolling, centered clocks use an exact 10px gap, the timer picker height is tightened toward the chip scale, and the active sandbox moves to 10px below the picker.
- In `6.5.5`, centered Focus clocks use a roomier 24px horizontal gap on mobile and desktop, and the sandbox sits 20px below the timer picker.
- In `6.5.6`, the Session Complete modal hides its internal scrollbar chrome while preserving scrolling and replaces its four native datalist popups with the existing white, site-styled Focus suggestion dropdown.
- In `6.5.7`, the shared hidden-scrollbar utility explicitly suppresses Safari WebKit scrollbar rendering, Master Categories and its nested option list use that utility, and Manual Entry applies it to the modal element that actually owns scrolling. This also removes the stray gray overlay thumb from the Focus clock sandbox.
- In `6.5.8`, Escape closes the current Focus menu through the shared modal shell, including Session Complete, Manual Entry, Category Goals, Focus History editing, and Master Categories. Suggestion dropdowns consume the first Escape press, and category editing returns to the Master Categories list before the modal itself closes.
- In `6.5.9`, the desktop Focus clock sandbox creates a vertical scroll layer only when more than one five-clock row exists. Single-row sandboxes use hidden vertical overflow, removing Safari's stray gray overlay scrollbar thumb at its source.
- List View parent titles now rename inline, List parent/Step metadata rows expose the remaining editable metadata chips through horizontal scrollers, and Step history streak chips render from the same preview metadata used by Table/Edit.
- Task search now keeps valid child rows hidden as standalone rows while allowing Step/Substep title, notes, tag, or link matches to surface the top-level parent and expand its sibling Steps.
- Edit Task Step chip rows scroll horizontally so all Step metadata chips remain reachable, and Step title rename controls stop row-selection propagation more reliably.

## Current Product Shape
- Tasks: primary dashboard with guarded cloud-backed task rows, shared shell controls, Table View, List View, cards, matrix, filters, buckets, same-table Steps mini rows/previews, and migration-source `adhdice_task_subtasks` rows surfaced under the unified Steps concept while promotion remains gated.
- Archive vs Trash: fully split at runtime. Archive is a stable non-active bucket, Trash is the 30-day auto-delete bucket keyed by `trashed_at`, and active task views exclude both.
- Focus: focus categories, timers, active sessions, history, and focus-day task selection.
- Roll: reward/economy surface with boards, prize baskets, free-roll banking, point spending, and history.
- Achievements: dice-face unlock tracking, set progress, and celebration overlays.
- Health: check-ins, meals, weight logging, imported metrics, Apple Health import flow, and care-oriented achievements.
- Notes: note CRUD and task linking.
- Stats: task, focus, and economy aggregates from current workspace state.
- Settings: profile and app-level configuration, including theme, calm-mode preferences, and economy reset.
- Test: isolated sandbox for prototypes that must stay off the live Tasks surface.

## Current Open Issue
- Reload/boot can still briefly show a black or glitched HUD/UI state before loading settles.
- The next recommended ticket should diagnose that seam separately before patching.
- Do not mix that diagnosis with List View, Focus Timer, recurrence, or subtask work.

## Fragile / High-Risk Areas
- `src/components/task-app.tsx`
- `src/hooks/useTaskCrudActions.ts`
- `src/hooks/useTaskHistoryActions.ts`
- `src/hooks/useTaskRewardController.ts`
- `src/hooks/useWorkspaceData.ts`
- `src/components/ui/task-management-table-v2.tsx`
- task revision/conflict handling
- same-table hierarchy rollout work beyond inspector-backed Table/List previews, especially inline quick actions, true nested table rows, movement/reorder rules, and live legacy promotion QA

## Important Deferred Work
- `scheduled_on` remains shadow-only and is not runtime-authoritative yet.
- Legacy subtasks in `adhdice_task_subtasks` are unchanged.
- Custom child-task metadata editors, cross-parent move/promote/demote behavior, nested Table/List row rendering beyond the current same-parent drag slice, child reward rules, and legacy-subtask migration remain deferred.
- `6.4.2` locks the future task hierarchy architecture in `docs/task-hierarchy-plan.md`: user-facing Steps should become same-table `adhdice_clean_tasks` rows through `parent_task_id`, with a hybrid bridge/migration from legacy subtasks and no expansion of `adhdice_task_subtasks` into a duplicate task model.
- Runtime adoption of `scheduled_on`, any `next_scheduled_on` behavior, nested same-table child-task row UI, and reward-economy redesign remain deferred.
- Import update-existing-ID behavior remains deferred because the current live import path does not expose that branch yet.
- Snapshot/restore UX, schema, and SQL-backed restore execution remain deferred to a later phase.

## Historical Notes To Preserve

### Guarded Writes / Archive-Trash Runtime
- Guarded task mutation coverage already includes permanent delete, history-driven live-status sync, and recurring finalization on top of the existing guarded update paths.
- Batch edit remains on the guarded task update helper; import remains insert-only with no live update-existing-ID branch.
- Archive vs Trash is already split at runtime: archive uses `status: "archived"`, trash uses `status: "trashed"` plus `trashed_at`, and restore flows return tasks to `pending` with `trashed_at: null`.

### Same-Table Hierarchy Runway
- Same-table hierarchy helper groundwork exists in shared logic:
  - `isTopLevelTask`
  - `isChildTask`
  - `groupTasksByParentId`
  - `buildTaskTree`
  - `buildTaskHierarchyAdapter`
  - `sortTaskSiblings`
  - `getTaskDescendants`
  - `getTaskAncestors`
  - `detectTaskHierarchyIssues`
- This groundwork has shipped as hidden diagnostics, a same-table inspector preview, child creation, and opening through the existing shared inspector path; nested Table/List row rendering and migration behavior remain deferred.
- `6.4.2` decision: same-table child tasks should render nested under their parent by default, completion should remain independent at first, child reward/XP behavior remains undecided, child recurrence UI should not ship until rules are approved, and parent archive/trash should later hide descendants while preserving rows unless a different cascade rule is explicitly approved.

### HUD / Workspace History
- The 6.1.x line was heavily HUD-focused: lane-preserving widget reorder, edit-mode chrome cleanup, workspace sizing/clipping fixes, snapshot-based HUD layout persistence, and reset-snapshot controls are all part of the current baseline.
- HUD cloud-sync remains a planning/foundation seam rather than a finished broad rollout; local-first persistence is still the safe assumption unless a ticket explicitly proves otherwise.

## Snapshot / Restore Planning Notes
- Recommended snapshot scope for a future task-workspace restore is: `adhdice_clean_tasks`, `adhdice_task_history`, `adhdice_task_subtasks`, task-routing/manual list memberships, task-list definitions, task-note links, focused-task selections by logical day, task-grid/HUD layout state that affects task surfaces, and directly related user profile/settings rows that change task behavior.
- Recommended snapshot task shape should preserve task rows as the primary source, include `parent_task_id` for same-table hierarchy, include legacy `adhdice_task_subtasks` alongside same-table tasks during the transition era, and keep task history separate from live task rows so restores can choose whether to restore live state only or live state plus history.
- Recommended restore boundary for the future SQL/runtime phase is task workspace data only first. Focus sessions, economy ledgers/reward claims, health data, and broader app settings should stay outside the initial restore boundary unless product rules explicitly require a coupled restore.
- Likely SQL-required future boundary: stable snapshot metadata/versioning tables, restore transaction semantics, and explicit overwrite/merge rules for shared keys such as task lists, manual memberships, and note links. No SQL was applied in `5.5.7`.

## Next Recommended Tickets
1. Diagnose the black/glitched HUD/UI reload seam as an isolated ticket before any other UI work in that area.
2. Define the future snapshot payload contract and restore overwrite rules before adding any restore SQL or runtime restore entry points.
3. Extend Step movement only after separate product approval; same-parent drag/drop now exists, but cross-parent movement and promote/demote remain deferred.
4. Run the gated legacy Step promotion only after manual dry-run review, then verify duplicate suppression against real promoted rows.
5. Implement the remaining `Complete` calendar/filter/UI polish phase for `Daily Until Complete` now that `6.7.9` has landed the first QA fixes for blocked rollback and child visibility.

## 6.6.0 Implementation Note

Table View, the full Edit Task Steps section, and List View now expose compact Move Up and Move Down controls for same-table Steps and Substeps. One shared pure reorder planner validates that the row is a valid child, keeps `parent_task_id` unchanged, limits movement to siblings at the same hierarchy depth, deterministically normalizes only that sibling group's `sort_order`, and returns only changed sibling writes. Persistence uses the existing guarded task update path. Cross-parent movement, drag/drop, promote/demote, schema changes, and live promotion remain deferred.

## 6.6.1 Implementation Note

Table View and List View Step rows now show a compact chevron immediately beside the step title when that step has visible same-table substeps. The chevron toggles local collapse and expand for that step's descendants only, preserves the existing rename/open/action behavior on the title and row, and uses one shared preview-visibility helper so descendant hiding follows the same rule in both surfaces. Edit Task behavior, reorder safety, persistence, `parent_task_id`, and broader movement rules are unchanged in this follow-up.

## 6.6.2 Implementation Note

The Table View parent-row `Steps` toggle now uses the same purple hover/focus circle treatment as the new step-level chevrons, so the parent affordance reads like the same control family. List View parent cards now also give the `Steps` section its own collapsible chevron header; the section defaults open, can be collapsed locally per card, and still force-opens during step-search expansion so matched parents continue to reveal their child rows.

## 6.6.3 Implementation Note

The parent-level `Steps` control in List View now matches the Table View control structure instead of using a separate list-specific button treatment. Both surfaces render `Steps` as neutral label text with a separate chevron-only button, so the purple hover/focus highlight applies only to the chevron and not to the word `Steps`.

## 6.7.0 Implementation Note

Table View, the full Edit Task Steps section, and List View now add dedicated grip-handle drag/drop reorder for same-parent Steps and same-parent Substeps. The existing shared sibling reorder helper in `src/lib/task-sibling-reorder.ts` now accepts drag-style before/after placement in addition to Move Up and Move Down, but it still only normalizes `sort_order` inside the affected sibling group and never edits `parent_task_id`. Drag starts only from the compact handle, invalid drops are ignored, the existing Move Up/Move Down controls remain as fallback, and cross-parent movement, promote/demote, parent-task drag, and live promotion remain deferred.

## 6.7.1 Implementation Note

Same-parent Step/Substep drag now keeps high-frequency hover bookkeeping in refs and updates React drop-indicator state only when the target row or before/after placement actually changes. Table View and the shared Edit Task rows no longer rerender their large surface on every native `dragover`; List View uses the same synchronous bookkeeping and deduplication. Reorder planning still uses `src/lib/task-sibling-reorder.ts`, persistence still writes only `sort_order` through the guarded task update path, and Move Up/Move Down remains available.

## 6.7.2 Implementation Note

The remaining same-parent drag delay was mainly in the drop persistence seam rather than in `dragover`. Reorder now applies the planned sibling `sort_order` updates to local task state immediately on drop, then persists only the changed siblings through the existing guarded task-row update path in parallel instead of awaiting one shared full update action per row in sequence. Table View, Edit Task, and List View all benefit because they share the same `reorderChildTask` persistence seam; `parent_task_id` still never changes, `src/lib/task-sibling-reorder.ts` still owns the reorder plan, and a guarded full workspace refresh is reserved only for rare save-error or conflict recovery.

## 6.7.3 Implementation Note

List View no longer caps expanded same-table Steps/Substeps to a four-row preview. The parent card `Steps` section now shows every currently visible same-table descendant when expanded, while the existing parent-section collapse plus per-step chevrons remain the only height controls. The old overflow copy about extra steps being "shown in the inspector" is removed from normal List View, search-matched parents still auto-expand their Steps section, and no movement rules, `parent_task_id` behavior, Table View limits, or Edit Task hierarchy scope changed in this follow-up.

## 6.7.4 Implementation Note

The full Edit Task UI no longer caps same-table Steps/Substeps to a short preview inside the left `Steps` section. All currently visible descendants now render inline there, the old `hidden in preview` overflow copy is removed, and the existing descendant chevrons remain the only row-hiding control inside that editor surface. Same-parent drag/drop, Move Up/Move Down, title rename, metadata targeting, sticky right Meta Data column behavior, `sort_order` logic, and `parent_task_id` rules are unchanged in this follow-up.

## 6.7.5 Implementation Note

Focus surfaces now replace their remaining native-looking category and label dropdowns with the shared ADHDice-styled Focus combobox/select controls. The Focus Goals editor sort control, Master Categories sort/type/subtype controls, and Focus History edit modal saved-category/title/type/subtype fields now use the same site-styled popover language already established in Focus modals, while timer behavior, recurrence/status logic, HUD, and non-Focus dropdowns remain unchanged.

## 6.7.6 Implementation Note

The `Daily Until Complete` / `Complete` feature work now has its manual data-contract foundation only. A new manual SQL migration adds the planned `complete` task status, `daily_until_complete` repeat value, and minimal `adhdice_task_history` metadata columns for `completed_permanently` plus `counted_as_due_occurrence`, while local TypeScript database types and the new `docs/daily-until-complete-plan.md` spec are aligned to that contract. Runtime status menus, recurrence rollover, missed backfill, rewards, archive behavior, confirmation, and calendar rendering remain intentionally unchanged in this release.

## 6.7.7 Implementation Note

`Daily Until Complete` now exists as a real repeat option in the normal repeat-selection surfaces, and the shared client recurrence helpers treat it like the existing daily engine for next-due-date calculation and live due classification. Overdue user-driven `Done` / `Did My Best` completion now backfills one `Missed` history row per skipped day before advancing to the next daily occurrence, while a new manual SQL patch file, `supabase/patch_daily_until_complete_rollover_rpc.sql`, updates the canonical `adhdice_reconcile_task_rollover` path so app-load/day-change rollover can do the same backfill and preserve anchored overdue `due_on` values after the SQL is run manually. `Complete` status action semantics, reward banking, archive cascade, undo/restore behavior, calendar rendering, and active-view filtering remain intentionally deferred to the next phase.

Verification for `6.7.7` should stay narrow: run `git diff --check` plus the focused task recurrence/history tests only, and treat the known unrelated `matchesTaskListRules` memoization failure in `test/task-refactor-helpers.test.ts` as pre-existing if it still appears.

Manual QA focus for `6.7.7`: create a `Daily Until Complete` task and a `Daily Until Complete` Step, confirm the repeat option appears in Table View, List View, and the editor, confirm overdue `Done` / `Did My Best` creates one missed history row per skipped day without duplicates, and confirm ordinary daily tasks still advance exactly as before.

## 6.7.8 Implementation Note

`Complete` now has a first real runtime action path for normal single-task status changes and existing-task editor saves. The action is blocked until all descendants recursively are already `complete`, then confirmed with the locked permanent-completion modal copy before writing one `completed_permanently` task-history row for today, clearing recurrence back to `none`, preserving due-date metadata, and banking rolls exactly once through the existing reward path. In derived task views, `status = 'complete'` is now treated as archive-like so completed rows move out of normal active views without introducing a broader archive-schema redesign in this phase.

Verification for `6.7.8` should stay narrow: run `git diff --check` plus the focused helper/history/archive/reward tests. If `test/task-refactor-helpers.test.ts` still reports the known unrelated `matchesTaskListRules` memoization failure, treat it as pre-existing and do not fix it in this ticket.

Manual QA focus for `6.7.8`: mark a one-off task `Complete` from List View, Table View, and the Edit Task modal; confirm the confirmation modal appears first, the task disappears from active views and appears under Archive, and only one reward bank event is created. Then mark a `Daily Until Complete` task `Complete` both when due today and when overdue, confirm skipped days backfill as `Missed`, confirm only one `Complete` history row exists for today, and confirm a parent task is blocked with `Complete all Steps before completing this task.` until every descendant is already `Complete`.

## 6.7.9 Implementation Note

The first `Complete` QA follow-up now fixes two regressions without broad archive redesign. Blocked parent `Complete` attempts no longer leave a stale local `Complete` chip/circle in the single-task status UI; the table/list status surface stops optimistic local patching for `Complete`, and the Edit Task modal receives a targeted status reset back to the row’s actual prior status when descendant validation fails. Child Steps/Substeps also no longer use archive-like hiding or archive wording on individual completion: they still confirm, stop recurring, write `completed_permanently` history, and bank one reward, but they stay visible under active parents and only hide/archive together through the existing derived parent-child visibility rule once the parent itself becomes completed/archive-like.

Verification for `6.7.9` should stay narrow: run `git diff --check` plus focused Complete/helper/history/archive/derived-view tests only. If unrelated pre-existing failures appear outside that scope, report them and leave them untouched.

Manual QA focus for `6.7.9`: attempt to mark a parent with unfinished Steps `Complete` from Table View, List View, and Edit Task, and confirm the blocked message appears without leaving the status UI on `Complete`. Then mark an individual Step/Substep `Complete`, confirm the child-specific confirmation copy appears, confirm the row stays visible under its active parent as `Complete`, and finally mark a fully completed top-level parent `Complete` to confirm the parent leaves active views while its completed descendants no longer appear independently.

## 6.7.10 Implementation Note

Permanent Complete history rendering now uses a dedicated display label instead of falling through to generic Done styling in the Task History modal. History/calendar entries with `status = "complete"` plus `event_type = "completed_permanently"` now render to the user as `Marked Complete` using the existing dark green Complete tone, while ordinary `Done`, `Did My Best`, `Missed`, and due-schedule rendering remain unchanged. This is a display-only follow-up; Complete action behavior, rewards, recurrence, archive logic, and SQL/manual rollover concerns are unchanged in `6.7.10`.
