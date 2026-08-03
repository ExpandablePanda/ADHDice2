# Step Migration

Last reviewed: 2026-08-03
Role: active working

## When to use this checklist

Use only when a ticket touches Step migration or migration-compatibility behavior. This checklist is preserved because current documentation does not establish that the migration flow is retired. Its product freshness requires a separate source-backed review. It is not part of normal task QA.

## Checklist

### Promotion safety

- [ ] Legacy Step Promotion dry run shows counts and sample rows without changing data.
- [ ] The Settings Step migration dry run remains read-only unless manual promotion is explicitly reviewed and armed.
- [ ] Manual promotion is unavailable until the dry run is reviewed and armed.

### Migration results

- [ ] After manual promotion, real same-table Steps are visible and mapped migration-source rows are hidden.
- [ ] Unmapped migration-source rows still appear under the normal Steps label where task UI surfaces them.
- [ ] Source-only rows that have not been replaced or promoted remain visible for manual cleanup.
- [ ] Any visible source-only Step rows align under the parent with status/title only and blank metadata cells, rather than a title-cell-only `x` plus Step title strip.
- [ ] Reloading keeps promoted migration-source rows suppressed.
