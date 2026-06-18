# Current State

Last reviewed: 2026-06-17

Role: active working

## Current App Version
- Current working app version: `6.3.40`.
- Current release group: `6.3.x` Focus History search and editing.
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

## Current Product Shape
- Tasks: primary dashboard with guarded cloud-backed task rows, shared shell controls, Table View, List View, cards, matrix, filters, buckets, and legacy subtask support from `adhdice_task_subtasks`.
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
- same-table hierarchy rollout work that has not reached UI or persistence behavior yet

## Important Deferred Work
- `scheduled_on` remains shadow-only and is not runtime-authoritative yet.
- Legacy subtasks in `adhdice_task_subtasks` are unchanged.
- Same-table child-task rendering, drag/drop, cross-parent move/promote/demote behavior, and legacy-subtask migration remain deferred.
- Runtime adoption of `scheduled_on`, any `next_scheduled_on` behavior, and reward-economy redesign remain deferred.
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
  - `sortTaskSiblings`
  - `getTaskDescendants`
  - `getTaskAncestors`
  - `detectTaskHierarchyIssues`
- This groundwork has not yet shipped as visible child-task UI or migration behavior.

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
3. Add non-destructive selectors/adapters that can consume the same-table hierarchy helpers without changing current visible task rendering.
4. Plan the same-table child-task UI rollout separately from legacy subtask migration, with explicit rules for mixed data states.
5. Decide when `scheduled_on` becomes authoritative and gate that behind a dedicated runtime/data contract ticket.
