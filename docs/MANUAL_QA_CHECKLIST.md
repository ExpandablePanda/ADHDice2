# Manual QA Checklist

Last reviewed: 2026-06-07

Role: active working

Use this as a repeatable browser smoke test after a Codex implementation pass. Keep it fast, focused, and scoped to the surfaces most likely to regress.

## When to use this checklist

- After implementation prompts.
- Before deploy.
- After fixes touching TaskApp, the task table, auth, Supabase, rewards, or routing.

## Auth

- [ ] Sign in succeeds and lands on the expected authenticated surface.
- [ ] Sign out succeeds and returns to the expected signed-out state.
- [ ] Refreshing the page keeps the correct signed-in or signed-out state.

## HUD / Navigation

- [ ] Main navigation loads without obvious missing sections or broken links.
- [ ] HUD controls render and respond without layout breakage.
- [ ] Switching between major surfaces does not show stale or incorrect data.

## Tasks

- [ ] Task list loads without blank states, console-visible crashes, or duplicate rows.
- [ ] Create, edit, complete, and reopen a task all work on the expected row.
- [ ] Task counts, badges, or visible status indicators update after task changes.
- [ ] Edit Task UI for a parent with Steps shows one normal user-facing Steps section.
- [ ] Edit Task UI does not show a separate same-table explanation panel or `Task rows` copy.
- [ ] Add Step in the editor creates a same-table Step.
- [ ] Table View parent rows with same-table Steps expand compact Step/Substep mini rows under the parent row, with no separate Step preview card inside the title cell.
- [ ] Table View Step mini rows show same-table task metadata in or near the parent table columns.
- [ ] Table View Step mini rows sit on the same white surface as parent rows, with no grey card/spreadsheet background or outline.
- [ ] Table View does not show a title-cell-only `x` plus Step title strip; any visible source-only Step rows align under the parent with status/title only and blank metadata cells.
- [ ] List View parent cards with same-table Steps show a compact Steps preview.
- [ ] Table/List/Edit Task same-table Step rows do not show an `Open` chip.
- [ ] Same-table Step rows show a small trash icon that uses the normal task delete/trash flow.
- [ ] Opening a same-table Step from Table/List preview uses the normal inspector/editor path.
- [ ] Selecting a Step in the Edit Task UI keeps the parent editor shell open and changes only the right-side Meta Data panel.
- [ ] The right-side Meta Data helper line names the active target, such as `Moisturize (AM) | Parent` or `Face | Step`.
- [ ] Selecting a Step shows the status icon picker on that selected Step row in the left Steps column, not in the right Meta Data panel.
- [ ] The selected same-table Step row shows a circular shoeprints Add Step/Substep button and a delete control.
- [ ] In Table View, clicking the parent row shoeprints Step button opens a focused inline same-table Step title draft row under that parent instead of opening the Edit Task UI.
- [ ] In Table View, parent metadata action rows appear directly under the parent row and before expanded Steps.
- [ ] In Table View, clicking a same-table Step row opens an inline action row directly under that Step instead of the full Edit Task UI.
- [ ] In Table View, clicking a same-table Step metadata chip opens the matching inline action row directly under that Step.
- [ ] In Table View, clicking a same-table Step title opens a compact in-row rename input without enlarging the Step row typography.
- [ ] In Table View, clicking the same already-open parent or Step metadata chip closes that inline action row.
- [ ] Table View Step rows sit close under the parent Steps toggle, show the Step icon, history access, delete access, Date Added metadata, and streak/missed-streak chips where applicable.
- [ ] Table View parent and Step row action icons render as bare icons until hover/focus, while status circles and metadata chips keep their normal chip styling.
- [ ] Table View Step shoeprints icon appears beside history/delete and opens an inline substep draft directly under that Step.
- [ ] Same-table Step due chips say `Today`, not `Due Today`.
- [ ] Same-table Step history entries produce visible streak/missed-streak chips in Table/List/Edit wherever the same parent task streak chip would appear.
- [ ] List View parent and same-table Step titles match the Table View task/Step typography.
- [ ] List View parent and same-table Step title clicks open in-row rename inputs and save through Enter/blur without opening the full editor.
- [ ] List View same-table Step rows expose clickable metadata chips for status, due, priority, repeat, list, tags, estimate, actual time, energy, link, and notes where applicable.
- [ ] List View parent and Step metadata overflow rows scroll horizontally so every chip remains reachable.
- [ ] List View Step shoeprints icon appears beside history/delete and opens an inline substep draft under that Step.
- [ ] List View same-table Step title click opens in-row rename and the rename persists after Enter/blur and refresh.
- [ ] In the full Edit Task UI, clicking a same-table Step title lets the title be renamed and saved through the normal task title path.
- [ ] In the full Edit Task UI, Step metadata chips scroll horizontally so Focus, Important, Urgent, Repeat, Due, and other chips remain reachable.
- [ ] Edit Task UI Add Step uses the circular Step icon, same-table Step rows do not show a redundant status chip next to due metadata, and the right Meta Data column remains visible while scrolling lower Steps on desktop.
- [ ] Table/List normal UI labels say `Steps` without `direct steps` or `total step rows` count copy.
- [ ] A parent with only new same-table Steps appears in the existing Steps smart list/filter.
- [ ] Old source-only rows remain visible for manual cleanup when they have not been replaced/promoted.
- [ ] The `Parent metadata` chip returns the right-side Meta Data panel from a Step to the parent.
- [ ] Unmapped migration-source rows, if still present, appear under Steps rather than as a separate normal task UI concept.
- [ ] Mapped migration-source rows remain hidden when their promotion mapping exists.
- [ ] Clicking a same-table Step preview row/title opens that Step without triggering parent row actions.
- [ ] Keyboard-opening a same-table Step preview opens that Step without changing parent selection.

## Search

- [ ] Searching returns expected matching tasks or items.
- [ ] Searching for a same-table Step/Substep by title, notes, tag, or link returns the top-level parent, not a standalone child row.
- [ ] Search-matched parents auto-show all sibling Steps/Substeps under that parent.
- [ ] Clearing search restores the unfiltered state.
- [ ] Search does not trap the UI in an empty or stale results view.

## Trash

- [ ] Sending an item to trash removes it from the main active view.
- [ ] Trash view shows the trashed item.
- [ ] Restore or permanent-delete actions produce the expected result.

## Smart Lists

- [ ] Smart list filters load and show the expected subset of items.
- [ ] Switching between smart lists updates results without needing a refresh.
- [ ] Counts or empty states look correct for the selected smart list.

## Rewards / Roll

- [ ] Reward or roll controls are visible where expected.
- [ ] Triggering a reward or roll updates the UI without freezing or duplicate results.
- [ ] Any visible reward balance, result, or history indicator updates correctly.

## Focus

- [ ] Focus entry points open the expected surface or control state.
- [ ] Starting and stopping a focus session behaves as expected.
- [ ] Refreshing during or after focus does not leave the UI in an obviously broken state.

## Health

- [ ] Health page loads without obvious missing cards, blank panels, or crashes.
- [ ] Key health summaries or widgets display plausible values.
- [ ] Health actions or imports, if touched by the change, still respond as expected.

## Notes

- [ ] Notes surface loads the expected content.
- [ ] Create or edit flows save the expected note content.
- [ ] Returning to the notes surface shows the saved state instead of stale data.

## Stats

- [ ] Stats page loads without obvious calculation or rendering failures.
- [ ] Headline metrics look plausible after recent task or reward changes.
- [ ] Navigation away from and back to Stats keeps the page stable.

## Settings

- [ ] Settings page loads without missing controls or broken sections.
- [ ] Changing a safe setting persists or visibly updates as expected.
- [ ] Returning to Settings shows the updated value instead of stale state.

## Steps Migration

- [ ] Legacy Step Promotion dry run shows counts and sample rows without changing data.
- [ ] Settings Step migration dry run remains read-only unless manual promotion is explicitly reviewed and armed.
- [ ] Manual promotion is unavailable until the dry run is reviewed and armed.
- [ ] After manual promotion, real same-table Steps are visible and mapped migration-source rows are hidden.
- [ ] Unmapped migration-source rows still appear under the normal Steps label where task UI surfaces them.
- [ ] Reloading keeps promoted migration-source rows suppressed.

## Public Deploy Smoke Test

- [ ] Public deployed app loads without a blank screen or immediate auth loop.
- [ ] Sign-in, navigation, and the main changed surface behave the same as local expectations.
- [ ] Browser console or visible network failures do not reveal obvious deploy-only regressions.

## How to report failures back to Codex

- Observed behavior.
- Expected behavior.
- Page or surface where it happened.
- Browser and device used.
- Screenshot, console output, or logs if available.
