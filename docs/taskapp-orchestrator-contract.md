# TaskApp Orchestrator Contract (Step 1 Addendum)

Last reviewed: 2026-06-04

This addendum locks the `TaskApp` core boundary while extraction continues.

## What `TaskApp` Owns
- Top-level route composition across `Home`, `Tasks`, `Focus`, `Health`, `Roll`, `Achievements`, `Games`, `Stats`, `Notes`, `Settings`, and `Test`.
- Top-level `next/dynamic` boundaries and route-level error isolation for page workspaces. Page implementation modules must not be added back to the initial static client graph without a documented reason.
- Hook composition and wiring:
  - `useWorkspaceData` for workspace load/sync/fallback entry.
  - `useTaskActions` for task mutations and persistence side effects.
  - `useTaskUiState` for persisted UI mode/filter/layout state.
  - `useEconomy`, `useAchievements`, `useFocus`, and `useHealth` for cross-surface state and persistence.
- Cross-surface callback plumbing between extracted page adapters/components.
- Session/auth shell flow (`ConfigSplash`, `LoadingSplash`, `AuthSplash`).
- Route-level overlays and orchestration concerns such as reward resolution, achievement celebrations, and dock-driven page switching.
- HUD persistence and event callbacks remain orchestrated here, but one-second timer/alarm display ticks are owned by `HudRuntimeClock` inside the HUD subtree so they do not rerender every page workspace.

## What Must Move Out (or Stay Out)
- Pure derived data calculations (filters, list counts, bucket splits, planning candidates, list option shaping).
- Live Tasks table rows are derived inside the Tasks workspace/list adapter through `src/lib/task-table-row.ts`; do not reintroduce a TaskApp-level `AgentPlanTaskItem` conversion layer for the table.
- Standalone page UIs and modal assemblies.
- Format/parse/helper logic that does not need component lifecycle state.

## Invariants During Extraction
- No behavior drift in task list semantics (`urgent`, `important`, `focus`) or routing buckets.
- Existing persistence keys and restore/reset behavior remain stable.
- Supabase fallback and migration behavior remain unchanged.
- Every extraction pass removes dead imports/constants tied to the moved block.
- Test-page prototype surfaces remain isolated unless explicitly promoted.
- Route loading fallbacks stay lightweight and do not mutate persisted page or task state.
- The live Tasks table has one incremental row-loading owner: `TaskManagementTableV2`. `TaskApp` should pass the full selected bucket and must not slice rows with a second rendered-count state.
- Focus-alarm ringing uses the persisted absolute `nextRingAt` timestamp with one scheduled timeout. Live countdown rendering belongs to the HUD runtime clock rather than a TaskApp-level polling state.
