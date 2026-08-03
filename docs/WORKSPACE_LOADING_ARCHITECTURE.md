# Workspace Loading Architecture

Last reviewed: 2026-08-03
Role: qualified source diagnostic

## Purpose and Evidence Boundary

This document records source-backed observations about authenticated workspace hydration, readiness, loading ownership, and refresh coordination. It is a qualified diagnostic, not canonical runtime proof and not a performance report.

Confirmed claims describe inspected source structure. Inferred ownership is labeled as inference. Proposed repositories, cache layers, or budgets are not implemented architecture. Browser, production, deployment, multi-tab, BFCache, and runtime request behavior remain outside this evidence unless separately validated.

## Confirmed Critical Startup Loads

`useWorkspaceData` owns authenticated workspace hydration and readiness at the application boundary. The critical startup request set includes:

- task rows;
- task Steps/subtasks;
- legacy promotion mappings;
- the authenticated profile;
- bounded current/live History facts needed for current-state evaluation.

Critical History facts are date- and occurrence-scoped rather than a full History table load. The source also schedules secondary workspace data such as categories, focus days, lists, memberships, grid preferences, and folders; that secondary set should not be read as proof that every domain eagerly loads at the root.

Focus History is page-gated and excluded from core startup.

The critical set is intended to establish a usable workspace projection and the facts required by current-state decisions. It is not a promise that every visible surface is complete before the first paint or that all downstream requests have settled.

The startup boundary should be read together with the Task State Engine authority: bounded current/live History facts support state decisions, while consumer detail loaders own broader timelines and page-specific data.

## Deferred and Consumer-Scoped Loads

Full per-task History uses explicit task/page-scoped loaders. The inspected consumers expose loading, ready, error, and retry states for requested data.

Notes, actual-time detail, and full History have explicit loaders and consumer/page triggers where inspected. They are not documented here as unconditional post-startup work, and this pass did not exhaustively trace every consumer or page path.

The appropriate loading boundary depends on the requesting page or feature. A consumer that needs a complete History timeline may start a broader request after the core projection is ready; a consumer that needs only current-state facts should remain on the bounded facts path.

Streak-summary loading can use a compact or paged History path when full task History is not already available. Rollover reloads current task data and does not automatically widen to full History when that data was not already loaded.

## History Loading and Readiness

Critical History loading is bounded to the current logical-day/live-occurrence facts required by the workspace. Full History remains a separate readiness boundary and must not replace canonical task rows with partial detail payloads.

Readiness is consumer-scoped: a page that needs full History or another detail dataset must wait for its requested data, expose retry behavior, and avoid treating an incomplete response as ready. The exact loading policy for every consumer remains a source-validation question.

This readiness model allows current task rows and bounded History facts to remain usable while detail data is pending. It does not establish a universal loading skeleton, timeout policy, or retry implementation across all pages.

When a consumer reports ready, that claim is scoped to the requested dataset. It should not be generalized into a claim that the entire workspace, every History row, or every page-owned resource is loaded.

## Startup Request Registry

`workspaceStartupRequestRegistry` shares authenticated startup requests while they are in flight. Completed request results are not retained as a durable cache by this registry.

Request sharing is therefore not a general repository or cache guarantee. Any longer-lived caching, invalidation, or page-retention behavior must be established from the owning consumer and refresh code rather than inferred from the registry name.

The registry's narrow responsibility also limits what can be concluded about duplicate work: it prevents duplicate in-flight startup requests for the supported key and does not prove durable reuse after completion.

## Realtime and Refresh Ownership

`useWorkspaceData` owns the authenticated workspace hydration and readiness boundary. Source-level refresh coordinators and Realtime subscription paths can trigger targeted refresh or single-flight work for workspace data.

This document records ownership and call structure only. It does not establish the exact production channel lifecycle, event coverage, cross-tab behavior, BFCache behavior, or whether a refresh is observed by every consumer.

Refresh ownership should remain explicit at the workspace boundary, with consumer-specific loaders responsible for their own detail readiness. Realtime invalidation and manual reload paths must not silently replace canonical rows with partial payloads.

The inspected structure supports targeted refresh ownership, but it does not by itself prove refresh ordering, event de-duplication, or visible consistency during concurrent mutations.

## Confirmed Non-Claims

The inspected source does not justify claims that:

- all History, notes, and actual-time data always load after core startup;
- nearly every domain eagerly starts from the root;
- startup paint, request volume, or performance budgets were measured;
- Safari paint behavior is fixed;
- BFCache or cross-tab behavior is proven;
- Realtime runtime behavior is proven;
- cache retention, invalidation, or repository semantics are complete.

## Known Runtime Questions

Separate validation remains needed for startup paint and boot/reload rendering, Safari behavior, BFCache restoration, cross-tab synchronization, Realtime event coverage, request volume, and consumer-visible readiness under slow or failed requests.

The source diagnostic also does not establish whether deployed infrastructure matches the inspected refresh and loading code. Do not promote these questions to confirmed defects or fixes without evidence.

The following are intentionally separate evidence classes:

- static source structure: named loaders, request registries, readiness state, and call ownership;
- inference: likely sequencing or ownership derived from those call sites;
- runtime questions: behavior requiring browser, deployed, multi-tab, or failure-path observation.

## Proposed Architecture, Not Implemented

The following remain design options, not shipped architecture:

- a repository or stable workspace-facts layer separating canonical entities from consumer detail;
- durable cache or invalidation layers beyond in-flight request sharing;
- explicit refresh generations and consumer-scoped cache ownership;
- measured startup, paint, request-volume, or inactive-page performance budgets.

Future work may retain these ideas, but implementation status and measured targets must be documented separately after source and runtime validation.

No proposal in this section is a current cache contract, a required migration phase, or a measured acceptance threshold. A future implementation ticket must define its owner, invalidation boundary, and runtime verification before moving any item into confirmed architecture.

## Change and Review Rules

Review this diagnostic when startup loading, readiness ownership, History loading, Realtime refresh, or caching ownership changes. Label each statement as confirmed source structure, inference, proposed architecture, or runtime-unverified behavior.

Do not add release chronology, transient recovery notes, or measured-looking budgets without evidence. Keep browser and production claims qualified.

## Related Documents

- [Archived prior diagnostic](archive/2026-08-retired/WORKSPACE_LOADING_ARCHITECTURE.md) — historical reference only.
- [Current State](CURRENT_STATE.md) — concise stabilization context and unresolved runtime warnings.
- [Task State Engine](TASK_STATE_ENGINE.md) — current state and History authority.
- [TaskApp architecture](TASKAPP_ARCHITECTURE.md) — application ownership and production routing.
- [TaskApp source map](TASKAPP_SOURCE_MAP.md) — implementation locations.
- [UI system](UI_SYSTEM.md) — visual and interaction authority.
- [Agent workflow](AGENT_WORKFLOW.md) — work modes and scope rules.
- [Verification](VERIFICATION.md) — evidence limits and reporting rules.
- [Core QA](qa/CORE_SMOKE.md) and [deployment QA](qa/DEPLOY.md) — authorized browser checklists.
- [Historical release archive](archive/2026-08-retired/current-state-release-history.md) — release chronology and runtime caveats; historical reference only.
