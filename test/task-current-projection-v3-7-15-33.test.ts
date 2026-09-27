import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CURRENT_TASK_PROJECTION_ALGORITHM_VERSION,
  CURRENT_TASK_PROJECTION_SCHEMA_VERSION,
} from "../src/lib/task-current-projection.ts";

const migration = readFileSync(new URL("../supabase/patch_task_current_projection_v3_7_15_33.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

test("7.15.33 uses projection schema V2 with algorithm V3", () => {
  assert.equal(CURRENT_TASK_PROJECTION_SCHEMA_VERSION, "task-current-projection-schema-v2");
  assert.equal(CURRENT_TASK_PROJECTION_ALGORITHM_VERSION, "task-current-projection-algorithm-v3");
  assert.match(migration, /task-current-projection-algorithm-v3/);
  assert.match(migration, /projection_algorithm_version <> 'task-current-projection-algorithm-v3'/);
  assert.match(migration, /projection_algorithm_version in \('task-current-projection-algorithm-v2', 'task-current-projection-algorithm-v3'\)/);
  assert.match(schema, /projection_algorithm_version in \('task-current-projection-algorithm-v1', 'task-current-projection-algorithm-v2', 'task-current-projection-algorithm-v3'\)/);
});

test("7.15.33 rebuild candidate functions treat every non-V3 row as stale", () => {
  const candidateSlices = migration.split("create or replace function public.adhdice_").slice(2);
  assert.equal(candidateSlices.length, 2);
  for (const slice of candidateSlices) {
    assert.match(slice, /projection_algorithm_version <> 'task-current-projection-algorithm-v3'/);
  }
});
