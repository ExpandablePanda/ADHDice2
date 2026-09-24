import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isCurrentTaskProjectionFresh,
  type CurrentTaskProjectionFreshnessContext,
} from "../src/lib/task-current-projection-freshness.ts";
import {
  CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
  CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
} from "../src/lib/task-current-projection.ts";
import type { TaskCurrentProjection } from "../src/lib/database.types.ts";

const sql = readFileSync(
  new URL("../supabase/patch_task_current_projection_invalidation_matrix_7_15_24.sql", import.meta.url),
  "utf8",
);
const persistenceSql = readFileSync(
  new URL("../supabase/patch_task_current_projection_persistence_7_15_14.sql", import.meta.url),
  "utf8",
);

function functionSource(name: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = sql.indexOf("$function$;", start);
  assert.ok(end > start, `unterminated ${name}`);
  return sql.slice(start, end + "$function$;".length);
}

const entityHelper = functionSource("adhdice_invalidate_task_current_projection_entity");
const ownerHelper = functionSource("adhdice_invalidate_task_current_projection_owner");
const subtreeHelper = functionSource("adhdice_invalidate_task_current_projection_subtree");
const sourceFence = functionSource("adhdice_get_task_current_projection_source_fences");

test("7.15.24 preserves canonical-revision invalidation and adds only secondary repair triggers", () => {
  assert.match(persistenceSql, /adhdice_clean_tasks_invalidate_task_current_projection[\s\S]*after update of canonical_revision/i);
  assert.match(sql, /adhdice_clean_tasks_invalidate_task_current_projection_behavior\s+after update of task_type, custom_ruleset_id/i);
  assert.match(sql, /adhdice_clean_tasks_invalidate_task_current_projection_tracking_subtree\s+after update of parent_task_id, exclude_from_tracking/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.adhdice_task_current_projections/i);
  assert.doesNotMatch(sql, /adhdice_task_history_changes/i);
});

test("entity and owner helpers are repair-only and never fabricate projection rows", () => {
  for (const helper of [entityHelper, ownerHelper]) {
    assert.match(helper, /update\s+public\.adhdice_task_current_projections/i);
    assert.match(helper, /set validity = 'repair_required'/i);
    assert.match(helper, /updated_at = now\(\)/i);
    assert.doesNotMatch(helper, /insert\s+into|delete\s+from|adhdice_clean_tasks\s+set|adhdice_task_history/i);
  }
});

test("7.15.24 covers every entity-scoped semantic source for insert/update/delete", () => {
  for (const table of [
    "adhdice_task_history_facts",
    "adhdice_task_schedule_boundaries",
    "adhdice_task_occurrences",
    "adhdice_task_occurrence_effective_overrides",
    "adhdice_task_calendar_overrides",
  ]) {
    assert.match(
      sql,
      new RegExp(`${table}_invalidate_task_current_projection[\\s\\S]*after insert or update or delete on public\\.${table}`, "i"),
    );
  }
  assert.match(sql, /adhdice_task_behavior_selections_invalidate_task_current_projection[\s\S]*after insert or update or delete on public\.adhdice_task_behavior_selections/i);
  assert.match(functionSource("adhdice_invalidate_task_current_projection_behavior_selection_trigger"), /old\.task_id[\s\S]*new\.task_id/i);
});

test("behavior policy, logical-day, and History epoch changes are owner-scoped", () => {
  for (const table of [
    "adhdice_task_type_behavior_profiles",
    "adhdice_custom_behavior_rulesets",
    "adhdice_custom_behavior_ruleset_revisions",
    "adhdice_user_profiles",
  ]) {
    assert.match(sql, new RegExp(`after insert or update or delete on public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`${table}_invalidate_task_current_projection_owner`, "i"));
  }
  const syncTrigger = functionSource("adhdice_invalidate_task_current_projection_history_sync_state_trigger");
  assert.match(sql, /after insert or update or delete on public\.adhdice_task_history_sync_state/i);
  assert.match(syncTrigger, /old\.sync_epoch[\s\S]*new\.sync_epoch/i);
  assert.match(syncTrigger, /old\.protocol_version[\s\S]*new\.protocol_version/i);
  assert.doesNotMatch(syncTrigger, /current_revision/);
});

test("tracking and hierarchy invalidation is bounded, subtree-scoped, and fails closed", () => {
  assert.match(subtreeHelper, /with recursive ancestry/i);
  assert.match(subtreeHelper, /with recursive subtree/i);
  assert.match(subtreeHelper, /depth < 256/i);
  assert.match(subtreeHelper, /cycle_detected/i);
  assert.match(subtreeHelper, /orphan[\s\S]*parent_task_id[\s\S]*not exists/i);
  assert.match(subtreeHelper, /invalidate_task_current_projection_owner\(p_user_id\)/i);
  assert.match(subtreeHelper, /entity_id in \(select subtree\.id from subtree\)/i);
  assert.match(sql, /old\.parent_task_id is not distinct from new\.parent_task_id/i);
  assert.match(sql, /old\.exclude_from_tracking is not distinct from new\.exclude_from_tracking/i);
});

test("the trusted behavior fence includes tracking ancestry for stale-rebuild rejection", () => {
  assert.match(sourceFence, /task-current-projection-behavior-fence-v3/i);
  assert.match(sourceFence, /tracking_ancestry/i);
  assert.match(sourceFence, /effective_tracking_exclusion/i);
  assert.match(sourceFence, /adhdice_clean_tasks[\s\S]*parent_task_id[\s\S]*exclude_from_tracking/i);
  assert.match(sourceFence, /depth < 256/i);
  assert.match(sourceFence, /using errcode = '55000'/i);
});

const projection = {
  user_id: "owner-1",
  entity_id: "task-1",
  entity_kind: "step",
  validity: "valid",
  canonical_task_revision: 7,
  history_sync_epoch: "epoch-1",
  logical_day_settings_revision: 4,
  projected_logical_date: "2026-09-23",
  projection_schema_version: CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
  projection_algorithm_version: CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
  last_handled_logical_date: null,
  last_handled_at: null,
  last_handled_at_kind: null,
  last_done_logical_date: null,
  last_done_at: null,
  last_done_at_kind: null,
} as TaskCurrentProjection;

const current: CurrentTaskProjectionFreshnessContext = {
  userId: "owner-1",
  entityId: "task-1",
  entityKind: "step",
  canonicalTaskRevision: 7,
  historySyncEpoch: "epoch-1",
  logicalDaySettingsRevision: 4,
  projectedLogicalDate: "2026-09-23",
};

test("future consumer freshness predicate accepts the current row", () => {
  assert.equal(isCurrentTaskProjectionFresh(projection, current), true);
});

test("future consumer freshness predicate rejects invalid identity, validity, revisions, date, and versions", () => {
  const cases: Array<Partial<typeof current> & Partial<Pick<TaskCurrentProjection, "validity" | "projection_schema_version" | "projection_algorithm_version">>> = [
    { userId: "other-owner" },
    { entityId: "other-task" },
    { entityKind: "substep" },
    { canonicalTaskRevision: 8 },
    { historySyncEpoch: "epoch-2" },
    { logicalDaySettingsRevision: 5 },
    { projectedLogicalDate: "2026-09-24" },
    { validity: "repair_required" },
    { projection_schema_version: "task-current-projection-schema-v0" },
    { projection_algorithm_version: "task-current-projection-algorithm-v0" },
  ];
  for (const change of cases) {
    const nextProjection = {
      ...projection,
      ...(change.validity ? { validity: change.validity } : {}),
      ...(change.projection_schema_version ? { projection_schema_version: change.projection_schema_version } : {}),
      ...(change.projection_algorithm_version ? { projection_algorithm_version: change.projection_algorithm_version } : {}),
    } as TaskCurrentProjection;
    const nextCurrent = { ...current, ...change };
    assert.equal(isCurrentTaskProjectionFresh(nextProjection, nextCurrent), false, JSON.stringify(change));
  }
});
