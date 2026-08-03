# Tasks

Last reviewed: 2026-08-03
Role: active working

## When to use this checklist

Use when a ticket changes general task loading, task CRUD, search, Trash, Smart Lists, or ordinary task refresh and persistence. Add `TASK_HIERARCHY.md` for Step/Substep behavior and `STEP_MIGRATION.md` for migration compatibility.

## Checklist

### General tasks

- [ ] The task list loads without task-specific blank states, console-visible crashes, or duplicate top-level rows.
- [ ] A normal task can be created, edited, saved, completed, and reopened on the expected row.
- [ ] Task counts, badges, and visible status indicators update after task changes.
- [ ] A normal task edit remains correct after the relevant refresh or return-to-surface flow.

### Search

- [ ] Searching returns the expected matching tasks or items.
- [ ] Clearing search restores the unfiltered state.
- [ ] Search does not trap the UI in an empty or stale results view.

### Trash

- [ ] Sending an item to Trash removes it from the main active view.
- [ ] Trash shows the trashed item.
- [ ] Restore and permanent-delete actions produce the expected result.

### Smart Lists

- [ ] Smart List filters load and show the expected subset of items.
- [ ] Switching between Smart Lists updates results without requiring a refresh.
- [ ] Counts and empty states look correct for the selected Smart List.
