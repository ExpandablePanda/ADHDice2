# Notes, Stats, and Settings

Last reviewed: 2026-08-03
Role: active working

## When to use this checklist

Use the relevant subsection when a ticket changes Notes, Stats, or Settings. Do not run unrelated subsections unless the ticket crosses those surfaces.

## Checklist

### Notes

- [ ] The Notes surface loads the expected content.
- [ ] Create or edit flows save the expected note content.
- [ ] Returning to Notes shows the saved state instead of stale data.

### Stats

- [ ] The Stats page loads without obvious calculation or rendering failures.
- [ ] Headline metrics look plausible after recent task or reward changes.
- [ ] Navigating away from and back to Stats keeps the page stable.

### Settings

- [ ] The Settings page loads without missing controls or broken sections.
- [ ] Changing a safe setting persists or visibly updates as expected.
- [ ] Returning to Settings shows the updated value instead of stale state.
- [ ] Backup & Recovery distinguishes unavailable RPCs from an available empty list.
- [ ] Recovery refresh shows the recorded count, latest success, storage warnings, and scheduler uncertainty without claiming automatic backups are active.
- [ ] Create a manual Home point when the recovery RPC is available; confirm clear success, unchanged, and failure messaging.
- [ ] Select a point and check the ordered Home Todo, Urgent, and Routine preview, changes against the preceding saved point, and missing Task references.
- [ ] Download a selected point and confirm the JSON says Home-only, includes schema/version metadata, and warns that Scratchpad content may be private.
- [ ] Confirm Restore stays disabled and browsing recovery information leaves Home unchanged.
