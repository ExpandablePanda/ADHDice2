# Workspace Efficiency Release Gate

Status: 7.15.52 measurement infrastructure
Last reviewed: 2026-09-26

## Purpose and evidence boundary

This is the repeatable final audit for the 7.15 current-read migration:

```text
Canonical facts -> Canonical Task engine -> persisted current projection -> ordinary UI
```

Canonical Task History remains authoritative evidence, but it is not a normal current-workspace read requirement. This document defines the manual scenarios Andrew runs and the offline HAR measurements used to record comparable evidence. It does not change production loading behavior.

Run the analyzer locally against a Safari or Chrome HAR:

```text
npm run audit:workspace-har -- /path/to/workspace.har
```

The analyzer reads the HAR without modifying it. It reports request/byte totals, safe JSON row counts, read classifications, and architecture flags without printing URLs, query values, headers, request bodies, or response bodies. Keep HAR files local; do not commit them or send them to the application.

HAR evidence has a deliberate Realtime boundary. A WebSocket handshake can be counted when represented in the HAR, but message activity is reported as measurable only when message frames are actually present. The analyzer never infers message counts. Use the existing development Realtime diagnostics for message-level evidence.

## Initial release budgets

These are architecture budgets, not invented latency or byte targets:

| Scope | Hard budget |
| --- | ---: |
| Normal startup full workspace History reads | 0 |
| Normal startup command-ledger bulk reads | 0 |
| Normal startup per-Task History fallback fanout | 0 |
| Stats full History reads | 0 |
| Fresh Records Edge recalculations | 0 |
| Forced/stale Records browser bulk source loads | 0 |
| History modal workspace-wide History reads | 0 |

For total request counts, Supabase requests, transferred bytes, and scenario-specific row counts, the first measured 7.15.52 QA run is the baseline. Numeric targets are not asserted until comparable scenario HARs establish that baseline.

## Manual scenarios

Run each scenario from a clean, documented starting state and save the resulting measurements in the matrix below. “Violations” means analyzer hard flags, not a subjective performance judgment.

| ID | Scenario | Expected architecture |
| --- | --- | --- |
| A | Cold login | Signed-out to authenticated workspace ready uses Tasks/current projections/current required domains; no full workspace History, command-ledger reconstruction, or uncontrolled per-Task History fanout. |
| B | Warm reload | Current projections are used; trusted projection repair occurs only when actually stale or missing; no full History. |
| C | Idle 60 seconds | No polling storm or repeated workspace snapshots; an open Realtime connection may remain. |
| D | Change one Task status | Small mutation/write path and affected Task/projection reconciliation; no full History reload or broad workspace replacement. |
| E | Change one due date | Affected Task/schedule/projection work; no full History reconstruction. |
| F | Open one Task | Ordinary editor/current state does not require full History. |
| G | Open Task History | Bounded newest-window/date/entity History; Load Older is explicit; no workspace-wide History hydration. |
| H | Switch browser tab briefly and return | No unconditional universe reload; only targeted refresh/reconciliation when needed. |
| I | Switch away for more than 5 minutes and return | Bounded resume/gap recovery; no broad History fallback except a specifically documented repair case. |
| J | Open Stats | `adhdice_get_task_activity_summary`; no full History. |
| K | Open Records while fresh | Latest completed run, source-state check, persisted current Records, valid events; no `records-recalculate`. |
| L | Explicit Refresh Records | One `records-recalculate` Edge call; no browser Tasks/History/Focus source datasets; persisted current and valid-event reload afterward. |
| M | Show invalidated Record History | Lazy invalid/superseded Record-event pagination only; no Records recalculation. |
| N | Sign out | Authenticated owner state is cleared; no stale-owner data is applied after sign-out. |

## Measurement matrix

Record one row per scenario. Use `unknown` when the HAR does not contain the relevant response body or size. The matrix intentionally leaves the first 7.15.52 measurements blank until Andrew performs the manual run.

| Scenario | Total requests | Supabase requests | Transferred bytes | Relevant rows | Projection reads | History reads | Delta reads | Edge calls | Realtime notes | Violations | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| A. Cold login | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |
| B. Warm reload | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |
| C. Idle 60 seconds | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |
| D. Change one Task status | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |
| E. Change one due date | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |
| F. Open one Task | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |
| G. Open Task History | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |
| H. Brief tab switch | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |
| I. Return after >5 minutes | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |
| J. Open Stats | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |
| K. Fresh Records | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |
| L. Refresh Records | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |
| M. Invalidated Record History | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |
| N. Sign out | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record during QA | record handshake/messages separately | pending | pending |

## Known-current manual evidence

Manual HAR QA during 7.15.x has already proven these architectural invariants:

- ordinary startup can run with zero full History hydration;
- Stats uses Task Activity Summary;
- Home uses a bounded current-day successful History slice;
- fresh Records uses source-state plus persisted Records;
- forced Records refresh uses one Edge recalculation and zero browser bulk Tasks/History/Focus source loads; and
- invalidated Record events paginate lazily.

Those observations are architectural evidence, not byte/request totals. Do not reconstruct numeric totals from memory. The 7.15.52 audit matrix establishes comparable measurements for the release gate.

## Diagnostics and interpretation

- `scripts/audit-workspace-har.mjs` is the offline request/transfer/read-class analyzer.
- `workspace-performance-diagnostics` measures computation duration and dependency churn; it is not a network budget.
- Existing development Realtime diagnostics remain the source for message-level analysis.
- A hard violation requires investigation before release. An informational classification records expected architecture, such as a bounded History read, projection rebuild, Records Edge recalculation, or persisted Records fast path.
- Missing HAR response bodies produce `unknown` row counts rather than guessed counts.
