# Task Hierarchy

Last reviewed: 2026-08-03
Role: active working

## When to use this checklist

Use when a ticket changes same-table Steps/Substeps, Table View, List View, Edit Task, inspector routing, child metadata, or same-parent ordering. Use `STEP_MIGRATION.md` separately for migration-source compatibility.

## Checklist

### Cross-surface rendering and routing

- [ ] In Table View, List View, and Edit Task, same-table Steps/Substeps appear inline under the correct parent with no preview cap, retired preview card, or overflow copy.
- [ ] In Edit Task, a parent with Steps shows one normal user-facing Steps section and no separate same-table explanation panel or `Task rows` copy.
- [ ] Table View Step mini rows use the parent table surface and show same-table metadata in or near the parent columns; they do not use a grey card/spreadsheet background or outline.
- [ ] Table/List/Edit Task same-table Step rows do not show an `Open` chip.
- [ ] Same-table Step rows expose the normal delete/trash flow.
- [ ] Opening a same-table Step from a Table/List preview uses the normal inspector/editor path without triggering parent actions.
- [ ] Keyboard-opening a same-table Step opens that Step without changing parent selection.
- [ ] Selecting a Step in Edit Task keeps the parent editor shell open and changes only the right-side Meta Data panel.
- [ ] The Meta Data helper line identifies the active target, such as `Moisturize (AM) | Parent` or `Face | Step`.
- [ ] The selected same-table Step row shows its status icon picker in the left Steps column, not in the Meta Data panel.
- [ ] The selected same-table Step row has the circular shoeprints Add Step/Substep button and a delete control.
- [ ] The `Parent metadata` chip returns the Meta Data panel from a Step to the parent.

### Table View

- [ ] Parent rows with same-table Steps expand compact Step/Substep mini rows under the parent, without a separate Step preview card inside the title cell.
- [ ] Clicking the parent-row shoeprints Step button opens a focused inline same-table Step title draft under that parent.
- [ ] Parent metadata action rows appear directly under the parent row and before expanded Steps.
- [ ] Clicking a same-table Step row or metadata chip opens its inline action row directly under that Step.
- [ ] Clicking a same-table Step title opens a compact in-row rename input without enlarging Step typography.
- [ ] Clicking the same already-open parent or Step metadata chip closes that inline action row.
- [ ] Step rows sit close under the parent Steps toggle and expose the Step icon, History access, delete access, Date Added metadata, and applicable streak/missed-streak chips.
- [ ] Same-table Step History entries produce visible streak/missed-streak chips in Table View, List View, and Edit Task wherever the same parent task streak chip would appear.
- [ ] Parent and Step action icons are bare icons until hover/focus; status circles and metadata chips retain normal chip styling.
- [ ] The Step shoeprints icon opens an inline substep draft directly under that Step.
- [ ] Same-table Step due chips say `Today`, not `Due Today`.
- [ ] The parent-row Steps toggle uses the same purple hover/focus circle treatment as child chevrons, while its text remains neutral.
- [ ] A Step with substeps has a chevron beside its title; collapsing hides only that Step's descendants and expanding restores them without breaking rename or row actions.

### List View

- [ ] Parent cards show a collapsible Steps section; expanding it shows all visible same-table Steps/Substeps inline.
- [ ] Parent and same-table Step titles match Table View task/Step typography.
- [ ] Parent and Step title clicks open in-row rename inputs and save through Enter or blur without opening the full editor.
- [ ] Same-table Step rows expose applicable clickable metadata chips for status, due, priority, repeat, list, tags, estimate, actual time, energy, link, and notes.
- [ ] Parent and Step metadata overflow rows scroll horizontally so every chip remains reachable.
- [ ] The Step shoeprints icon opens an inline substep draft under that Step.
- [ ] Same-table Step title rename persists after Enter/blur and refresh.
- [ ] In expanded List View Steps sections, no `shown in the inspector` or `more step(s)` overflow copy appears.
- [ ] A Step with substeps has a chevron beside its title; collapsing hides only that Step's descendants and expanding restores them without opening rename or the full editor.
- [ ] The parent-card Steps header has its own chevron toggle, independently collapses the section, and still auto-expands Steps for search-matched parents.
- [ ] The parent-card Steps control matches the Table View control structure and only the chevron button receives the hover/focus highlight.

### Edit Task

- [ ] A same-table Step title can be renamed and saved through the normal task title path.
- [ ] Step metadata chips scroll horizontally so Focus, Important, Urgent, Repeat, Due, and other chips remain reachable.
- [ ] Add Step uses the circular Step icon, same-table Step rows do not show a redundant status chip beside due metadata, and the right Meta Data column remains visible while scrolling lower Steps on desktop.
- [ ] The left Steps section shows all visible same-table Steps/Substeps inline with no preview cap or `hidden in preview` copy.

### Reorder, drag, and boundaries

- [ ] In Table View, Edit Task, and List View, Move Up/Move Down reorders sibling Steps and sibling Substeps, persists after refresh, preserves their parents, and preserves selection, rename, metadata, Step creation, and collapse/expand behavior.
- [ ] In Table View, Edit Task, and List View, the drag handle reorders sibling Steps and sibling Substeps only within the same parent group, shows the new order immediately after drop, persists after refresh, and immediately clears the drag visual state.
- [ ] Drag indicators change cleanly between before/after positions without excessive flicker or sluggish row rerenders; Edit Task keeps the Meta Data column sticky and targeted to the selected row.
- [ ] Table View reorder controls do not break row selection, metadata chips, rename, right-click, Step creation, horizontal scroll, or the sticky Tasks column.
- [ ] Invalid drop zones do nothing, cross-parent drag/drop and promote/demote are not exposed, and dragging a List View grip does not trigger the parent card click.
- [ ] Reordered Steps/Substeps remain hidden from top-level task rows and are not duplicated.

### Labels and smart-list parity

- [ ] Table/List normal UI labels say `Steps` without `direct steps` or `total step rows` count copy.
- [ ] A parent with only new same-table Steps appears in the existing Steps smart list/filter.

### Hierarchy-specific search

- [ ] Searching for a same-table Step/Substep by title, notes, tag, or link returns the top-level parent rather than a standalone child row.
- [ ] Search-matched parents auto-show all sibling Steps/Substeps under that parent.
