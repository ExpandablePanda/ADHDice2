# TaskApp Orchestrator Contract (Step 1 Addendum)

This addendum locks the `TaskApp` core boundary while extraction continues.

## What `TaskApp` Owns
- Top-level route composition across `Home`, `Tasks`, `Focus`, `Roll`, `Stats`, `Notes`, `Settings`, and `Games`.
- Hook composition and wiring:
  - `useWorkspaceData` for workspace load/sync/fallback entry.
  - `useTaskActions` for task mutations and persistence side effects.
  - `useTaskUiState` for persisted UI mode/filter/layout state.
- Cross-surface callback plumbing between extracted page adapters/components.
- Session/auth shell flow (`ConfigSplash`, `LoadingSplash`, `AuthSplash`).

## What Must Move Out (or Stay Out)
- Pure derived data calculations (filters, list counts, bucket splits, planning candidates, list option shaping).
- Standalone page UIs and modal assemblies.
- Format/parse/helper logic that does not need component lifecycle state.

## Invariants During Extraction
- No behavior drift in task list semantics (`urgent`, `important`, `focus`) or routing buckets.
- Existing persistence keys and restore/reset behavior remain stable.
- Supabase fallback and migration behavior remain unchanged.
- Every extraction pass removes dead imports/constants tied to the moved block.
