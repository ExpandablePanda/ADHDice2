# Task Hierarchy Decisions

Last reviewed: 2026-08-03
Role: active product decisions

## Purpose

This document records current product decisions for the canonical same-table task hierarchy, Steps, and Substeps. It preserves unresolved product choices without duplicating Task State Engine, TaskApp, or subsystem QA contracts.

## Shipped Hierarchy Model

- Same-table hierarchy uses task rows linked by `parent_task_id`.
- Valid descendants are excluded from primary top-level rows and rendered in nested Steps/Substeps contexts.
- Table View, List View, and Edit Task support the current hierarchy rendering and normal child-task editing path.
- Child creation, editing, inline actions, task metadata, collapse/expand behavior, and search-parent reveal are current behavior.
- Same-parent sibling reorder and same-parent drag reorder are current behavior.
- Current child metadata follows the normal task fields already supported by the parent task surfaces; the hierarchy renderer does not create a reduced child-only task model.
- Same-table descendants can be opened, renamed, edited, and given deeper children through the shared task paths.
- Invalid rows such as orphans, cycles, and self-parenting remain diagnosable and must not be trusted as valid nested descendants.
- Separate legacy subtask storage and promotion mappings are retired. Canonical Steps/Substeps come only from `adhdice_clean_tasks.parent_task_id`.

## Parent, Step, and Substep Rules

- Steps and Substeps are nested task context by default and do not duplicate as primary rows.
- Parent, Step, and Substep task identity remains explicit; opening a child uses the normal task inspector/editor path.
- Child creation can create a Step or deeper descendant through the same-table task path.
- Parent and child status, History, recurrence, and reward behavior are not implicitly merged by the hierarchy renderer.
- Search that matches a child reveals its top-level parent and the relevant sibling context.
- The hierarchy contract does not define the full task-state transition model; see the linked authority documents.

## Rendering and Interaction Boundaries

Table and List use shared hierarchy-derived data for nested previews and metadata affordances. Edit Task uses the same user-facing Steps concept and the normal task metadata editor.

Collapse controls affect the local rendered context only. Inline title editing, metadata chips, child creation, open/edit actions, and available quick actions must use existing task seams rather than a second legacy-subtask editor. Detailed component ownership belongs to TaskApp architecture.

When search matches a descendant, the parent is the primary reveal context; this does not promote the child into an independent top-level result. Invalid hierarchy rows remain separately findable until a repair UI and product rule exist.

## Reorder and Movement Rules

Same-parent Move Up/Move Down and drag reorder are shipped. The shared reorder planner preserves sibling identity and relative order, changes `sort_order` within the affected parent group, rejects invalid hierarchy rows, and does not change `parent_task_id`.

Cross-parent movement, changing `parent_task_id` through drag, promote, and demote are not shipped hierarchy decisions. They remain unresolved because they require cycle/orphan guardrails and explicit product semantics.

Current reorder behavior is same-parent only and persistence is drop-scoped through the existing guarded task-update seam. A conflict or save failure reloads current cloud order; it does not authorize a second movement or repair policy.

## Completion and Archive Semantics

Hierarchy rendering does not auto-complete parents when descendants complete, and it does not silently complete descendants when a parent changes status. Permanent completion and recurrence removal follow the active Daily Until Complete and Task State Engine rules.

Whether parent archive/trash should cascade, hide descendants while preserving rows, or allow independent archive state remains an unresolved product decision. The current hierarchy document does not authorize destructive cascade writes or infer restore behavior.

## Confirmed Unresolved Decisions

- Cross-parent movement and its conflict, cycle, orphan, and undo behavior.
- Promote and demote behavior and whether either should be exposed to users.
- Broader legacy-subtask migration retirement policy and source-row cleanup.
- Child reward behavior, reward continuity during promotion, and parent/child aggregation.
- Child recurrence behavior and any parent/child recurrence coupling.
- Parent completion, archive, trash, restore, and descendant visibility semantics beyond current rendering.
- Remaining unlink, detach, conversion, or invalid-hierarchy repair rules.

## Non-Authorities

- [Task State Engine](TASK_STATE_ENGINE.md) owns state evaluation, History identity, recurrence facts, action planning, and persistence projection.
- [TaskApp architecture](TASKAPP_ARCHITECTURE.md) and [source map](TASKAPP_SOURCE_MAP.md) own production routing and implementation locations.
- [Task State QA](qa/TASK_HIERARCHY.md) and [Step migration QA](qa/STEP_MIGRATION.md) own browser checklist procedures.
- [Daily Until Complete rules](daily-until-complete-plan.md) own recurrence and permanent-completion product rules.

## Related Documents

- [Task State Engine](TASK_STATE_ENGINE.md)
- [TaskApp architecture](TASKAPP_ARCHITECTURE.md)
- [TaskApp source map](TASKAPP_SOURCE_MAP.md)
- [UI system](UI_SYSTEM.md)
- [Agent workflow](AGENT_WORKFLOW.md)
- [Verification](VERIFICATION.md)
- [Hierarchy QA](qa/TASK_HIERARCHY.md) and [Step migration QA](qa/STEP_MIGRATION.md)
- [Current State](CURRENT_STATE.md)
- [Archived prior hierarchy plan](archive/2026-08-retired/task-hierarchy-plan.md)

## Historical Plan

The earlier release rollout and implementation chronology are preserved in the [archived hierarchy plan](archive/2026-08-retired/task-hierarchy-plan.md). The archive is historical reference only.
