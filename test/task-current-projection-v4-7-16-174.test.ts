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

test("the V4 migration matches production P0001 stale-fence SQLSTATEs exactly", () => {
  const staleFenceErrors = [...patch.matchAll(/raise exception '([^']+)' using errcode = '([^']+)'/gi)]
    .filter(([, message]) => /stale|older than the stored projection/i.test(message));

  assert.deepEqual(staleFenceErrors.map(([, message, code]) => ({ message, code })), [
    { message: "Current Task projection canonical Task revision is stale.", code: "P0001" },
    { message: "Current Task projection History sync epoch is stale.", code: "P0001" },
    { message: "Current Task projection entity History frontier is stale.", code: "P0001" },
    { message: "Current Task projection logical-day settings revision is stale.", code: "P0001" },
    { message: "Current Task projection logical date is stale.", code: "P0001" },
    { message: "Current Task projection schedule or behavior source fence is stale.", code: "P0001" },
    { message: "Current Task projection candidate is older than the stored projection or would downgrade the current algorithm.", code: "P0001" },
  ]);
  assert.doesNotMatch(patch, /using errcode = '40001'/i);
});
