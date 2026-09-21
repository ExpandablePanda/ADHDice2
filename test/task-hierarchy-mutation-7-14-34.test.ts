import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Task } from "../src/lib/database.types.ts";
import { getRootTaskContentFolderId, moveTaskHierarchy } from "../src/lib/task-hierarchy-mutation.ts";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const hierarchySql = readFileSync(new URL("../supabase/patch_task_hierarchy_move_7_14_34.sql", import.meta.url), "utf8");
const runtimeActionsSource = readFileSync(new URL("../src/lib/task-state-runtime-actions.ts", import.meta.url), "utf8");

function task(
  id: string,
  parentTaskId: string | null = null,
  taskContentFolderId: string | null = null,
  overrides: Partial<Task> = {},
) {
  return {
    id,
    parent_task_id: parentTaskId,
    task_content_folder_id: taskContentFolderId,
    user_id: "user-1",
    revision: 1,
    title: id,
    ...overrides,
  } as Task;
}

function roleAfterMove(
  tasks: readonly Task[],
  movedTaskId: string,
  newParentTaskId: string | null,
) {
  const byId = new Map(tasks.map((entry) => [entry.id, entry]));
  const movedRole = newParentTaskId === null
    ? "parent"
    : byId.get(newParentTaskId)?.parent_task_id === null ? "step" : "substep";
  const childRole = movedRole === "parent" ? "step" : "substep";
  return {
    movedRole,
    childRole,
    directChildIds: tasks.filter((entry) => entry.parent_task_id === movedTaskId).map((entry) => entry.id),
  };
}

test("Unlinking a Step with a Substep makes the moved row a parent and the direct child a Step", () => {
  const roles = roleAfterMove([
    task("step", "parent"),
    task("substep", "step"),
  ], "step", null);

  assert.equal(roles.movedRole, "parent");
  assert.equal(roles.childRole, "step");
  assert.deepEqual(roles.directChildIds, ["substep"]);
  assert.match(hierarchySql, /v_next_child_entity_kind := case[\s\S]*when v_next_entity_kind = 'parent' then 'step'[\s\S]*else 'substep'/);
});

test("Moving a Parent under a root Task makes it a Step and its direct child a Substep", () => {
  const roles = roleAfterMove([
    task("root"),
    task("parent"),
    task("step", "parent"),
  ], "parent", "root");

  assert.equal(roles.movedRole, "step");
  assert.equal(roles.childRole, "substep");
  assert.deepEqual(roles.directChildIds, ["step"]);
});

test("Moving a Substep between parents leaves its Substep children unchanged", () => {
  const roles = roleAfterMove([
    task("root"),
    task("source", "root"),
    task("moved", "source"),
    task("child", "moved"),
  ], "moved", "source");

  assert.equal(roles.movedRole, "substep");
  assert.equal(roles.childRole, "substep");
  assert.match(hierarchySql, /child\.entity_kind is distinct from v_next_child_entity_kind/);
  assert.match(hierarchySql, /return next v_updated_child/);
});

test("A leaf Step has no descendant row to reconcile", () => {
  const roles = roleAfterMove([task("step", "parent")], "step", null);
  assert.deepEqual(roles.directChildIds, []);
  assert.match(hierarchySql, /and child\.parent_task_id = p_task_id/);
});

test("The hierarchy client returns every authoritative row in RPC order", async () => {
  const returnedRows = [task("moved", null, null, { entity_kind: "parent" }), task("child", "moved", null, { entity_kind: "step" })];
  const client = {
    rpc: async () => ({ data: returnedRows, error: null }),
  };

  const result = await moveTaskHierarchy(client, {
    expectedCanonicalRevision: 4,
    expectedRevision: 8,
    newParentTaskId: null,
    newTaskContentFolderId: null,
    taskId: "moved",
  });

  assert.deepEqual(result.data.map((entry) => entry.id), ["moved", "child"]);
  assert.match(hierarchySql, /return next v_task;[\s\S]*for v_child in/);
});

test("The replacement RPC keeps owner, destination, cycle, and revision fences", () => {
  assert.match(hierarchySql, /returns setof public\.adhdice_clean_tasks/);
  assert.match(hierarchySql, /p_new_parent_task_id is not null and p_new_task_content_folder_id is not null/);
  assert.match(hierarchySql, /task\.user_id = v_owner_id/);
  assert.match(hierarchySql, /folder\.user_id = v_owner_id/);
  assert.match(hierarchySql, /p_new_parent_task_id = p_task_id/);
  assert.match(hierarchySql, /v_parent_cursor = p_task_id/);
  assert.match(hierarchySql, /v_task\.revision is distinct from p_expected_revision/);
  assert.match(hierarchySql, /v_task\.canonical_revision is distinct from p_expected_canonical_revision/);
  assert.match(hierarchySql, /using errcode = '40001'/);
});

test("The browser marks the moved Task and direct children pending and merges every returned row", () => {
  assert.match(appSource, /const pendingTaskIds = \[[\s\S]*task\.id,[\s\S]*hierarchy\.getChildren\(task\.id\)/);
  assert.match(appSource, /markPendingTaskMutations\(pendingTaskIds\)/);
  assert.match(appSource, /const authoritativeRowsById = new Map\(result\.data\.map/);
  assert.match(appSource, /const authoritativeRow = authoritativeRowsById\.get\(candidate\.id\)/);
  assert.match(appSource, /clearPendingTaskMutations\(pendingTaskIds\)/);
});

test("Only canonically changed direct children increment their canonical projection", () => {
  assert.match(hierarchySql, /child\.canonical_revision is not null/);
  assert.match(hierarchySql, /canonical_revision = v_child\.canonical_revision \+ 1/);
  assert.match(hierarchySql, /projection_source_canonical_revision = v_child\.canonical_revision \+ 1/);
  assert.match(hierarchySql, /canonical_updated_at = now\(\)/);
  assert.match(hierarchySql, /projection_source_fingerprint = md5\(concat_ws/);
});

test("Hierarchy moves leave historical facts and schedule boundaries untouched", () => {
  assert.doesNotMatch(hierarchySql, /adhdice_task_history_facts|adhdice_task_schedule_boundaries/);
  assert.doesNotMatch(hierarchySql, /set\s+(status|due_on|repeat_frequency)\s*=/i);
  assert.doesNotMatch(hierarchySql, /reward|streak/i);
});

test("The generic Task State guard still forbids arbitrary parent mutations", () => {
  assert.match(runtimeActionsSource, /"parent_task_id"/);
  assert.match(runtimeActionsSource, /legacyStateFallback: "forbidden"/);
  assert.match(runtimeActionsSource, /unsupported_state_mutation/);
});

test("Unlink in a nested Folder inherits the root Task's direct Folder", () => {
  const tasks = [
    task("root", null, "folder-a"),
    task("step", "root"),
    task("substep", "step"),
  ];
  assert.equal(getRootTaskContentFolderId(tasks, "substep"), "folder-a");
  assert.match(appSource, /persistTaskHierarchyRow\(\s*task,\s*null,\s*inheritedFolderId/);
});
