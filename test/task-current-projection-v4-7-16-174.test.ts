import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
  CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
} from "../src/lib/task-current-projection.ts";

const patch = readFileSync(new URL("../supabase/patch_task_current_projection_algorithm_v4_7_16_174.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

test("7.16.174 identifies V4 projections and keeps the schema at V2", () => {
  assert.equal(CURRENT_TASK_PROJECTION_SCHEMA_VERSION, "task-current-projection-schema-v2");
  assert.equal(CURRENT_TASK_PROJECTION_ALGORITHM_VERSION, "task-current-projection-algorithm-v4");
  assert.match(schema, /projection_algorithm_version in \('task-current-projection-algorithm-v1', 'task-current-projection-algorithm-v2', 'task-current-projection-algorithm-v3', 'task-current-projection-algorithm-v4'\)/);
  assert.match(patch, /projection_algorithm_version in \('task-current-projection-algorithm-v1', 'task-current-projection-algorithm-v2', 'task-current-projection-algorithm-v3', 'task-current-projection-algorithm-v4'\)/);
});

test("V4 refresh selects V3 projections as stale and the writer prevents algorithm downgrade", () => {
  const candidateFunctions = patch.split("create or replace function public.adhdice_").slice(2);
  assert.equal(candidateFunctions.length, 2);
  for (const functionSource of candidateFunctions) {
    assert.match(functionSource, /projection_algorithm_version <> 'task-current-projection-algorithm-v4'/);
    assert.match(functionSource, /projected_logical_date is distinct from v_current_logical_date/);
  }

  assert.match(patch, /projection\.projection_algorithm_version = 'task-current-projection-algorithm-v4'[\s\S]*excluded\.projection_algorithm_version in \('task-current-projection-algorithm-v2', 'task-current-projection-algorithm-v3'\)/);
  assert.match(patch, /projection\.updated_at <= excluded\.updated_at/);
  assert.match(patch, /adhdice_get_task_current_projection_source_fences/);
});
