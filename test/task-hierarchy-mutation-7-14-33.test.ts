import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Task } from "../src/lib/database.types.ts";
import { getRootTaskContentFolderId, moveTaskHierarchy } from "../src/lib/task-hierarchy-mutation.ts";

const appSource = readFileSync(new URL("../src/components/task-app.tsx", import.meta.url), "utf8");
const folderActionsSource = readFileSync(new URL("../src/hooks/useTaskContentFolderActions.ts", import.meta.url), "utf8");
const hierarchySql = readFileSync(new URL("../supabase/patch_task_hierarchy_move_7_14_33.sql", import.meta.url), "utf8");
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

test("Step under an ungrouped Task detaches as an ungrouped top-level Task", () => {
  const tasks = [task("parent"), task("step", "parent")];
  assert.equal(getRootTaskContentFolderId(tasks, "step"), null);
  assert.match(appSource, /persistTaskHierarchyRow\(\s*task,\s*null,\s*inheritedFolderId/);
});

test("Step under a Folder Task inherits the root Task's direct Folder", () => {
  const tasks = [task("parent", null, "folder-a"), task("step", "parent")];
  assert.equal(getRootTaskContentFolderId(tasks, "step"), "folder-a");
});

test("Nested Substep inherits the root Task's Folder through every Task ancestor", () => {
  const tasks = [task("parent", null, "folder-a"), task("step", "parent"), task("substep", "step")];
  assert.equal(getRootTaskContentFolderId(tasks, "substep"), "folder-a");
});

test("Nested content Folder membership is inherited exactly, without using the child Folder field", () => {
  const tasks = [task("parent", null, "nested-folder"), task("step", "parent", null), task("substep", "step", null)];
  assert.equal(getRootTaskContentFolderId(tasks, "substep"), "nested-folder");
});

test("The hierarchy client sends Step to Folder as parent=null and returns the authoritative same-ID row", async () => {
  let received: { name: string; args: Record<string, unknown> } | null = null;
  const returned = task("step", null, "folder-b", { revision: 2 });
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      received = { name, args };
      return { data: [returned], error: null };
    },
  };
  const result = await moveTaskHierarchy(client, {
    expectedCanonicalRevision: null,
    expectedRevision: 1,
    newParentTaskId: null,
    newTaskContentFolderId: "folder-b",
    taskId: "step",
  });
  assert.equal(result.data[0]?.id, "step");
  assert.deepEqual(received, {
    name: "adhdice_move_task_hierarchy",
    args: {
      p_expected_canonical_revision: null,
      p_expected_revision: 1,
      p_new_parent_task_id: null,
      p_new_task_content_folder_id: "folder-b",
      p_task_id: "step",
    },
  });
});

test("Top-level Task to parent sends parent=target and Folder=null", async () => {
  let args: Record<string, unknown> | null = null;
  const client = {
    rpc: async (_name: string, nextArgs: Record<string, unknown>) => {
      args = nextArgs;
      return { data: [task("task", "target")], error: null };
    },
  };
  await moveTaskHierarchy(client, {
    expectedCanonicalRevision: 4,
    expectedRevision: 8,
    newParentTaskId: "target",
    newTaskContentFolderId: null,
    taskId: "task",
  });
  assert.deepEqual(args, {
    p_expected_canonical_revision: 4,
    p_expected_revision: 8,
    p_new_parent_task_id: "target",
    p_new_task_content_folder_id: null,
    p_task_id: "task",
  });
});

test("The database authority rejects parent plus Folder and checks owner-scoped destinations", () => {
  assert.match(hierarchySql, /p_new_parent_task_id uuid/);
  assert.match(hierarchySql, /p_new_task_content_folder_id uuid/);
  assert.match(hierarchySql, /p_new_parent_task_id is not null and p_new_task_content_folder_id is not null/);
  assert.match(hierarchySql, /folder\.user_id = v_owner_id/);
  assert.match(hierarchySql, /task\.user_id = v_owner_id/);
});

test("Self-parent and descendant-cycle moves remain blocked", () => {
  assert.match(hierarchySql, /p_new_parent_task_id = p_task_id/);
  assert.match(hierarchySql, /v_parent_cursor = p_task_id/);
  assert.match(appSource, /task\.id === parentTask\.id/);
  assert.match(appSource, /descendantIds\.has\(parentTask\.id\)/);
});

test("Stale legacy and canonical revisions are rejected before the atomic update", () => {
  assert.match(hierarchySql, /v_task\.revision is distinct from p_expected_revision/);
  assert.match(hierarchySql, /v_task\.canonical_revision is distinct from p_expected_canonical_revision/);
  assert.match(hierarchySql, /using errcode = '40001'/);
});

test("The move is one atomic Task update and returns the committed row", () => {
  assert.match(hierarchySql, /update public\.adhdice_clean_tasks as task[\s\S]*parent_task_id = p_new_parent_task_id,[\s\S]*task_content_folder_id = p_new_task_content_folder_id,[\s\S]*returning task\.\* into v_task/);
  assert.match(hierarchySql, /returns setof public\.adhdice_clean_tasks/);
  assert.doesNotMatch(hierarchySql, /adhdice_task_history_facts|adhdice_task_schedule_boundaries|reward/i);
});

test("Canonical moves refresh current entity role and revision without rewriting historical evidence", () => {
  assert.match(hierarchySql, /entity_kind = case/);
  assert.match(hierarchySql, /canonical_revision = v_next_canonical_revision/);
  assert.match(hierarchySql, /projection_source_canonical_revision = v_next_canonical_revision/);
  assert.doesNotMatch(hierarchySql, /insert into public\.adhdice_task_history_facts/);
  assert.doesNotMatch(hierarchySql, /insert into public\.adhdice_task_schedule_boundaries/);
});

test("Folder actions use the hierarchy authority rather than generic TaskUpdate", () => {
  assert.match(folderActionsSource, /moveTaskHierarchy\(task, null, folder\.id\)/);
  assert.match(folderActionsSource, /moveTaskHierarchy\(task, null, folderId\)/);
  assert.doesNotMatch(folderActionsSource, /updateTaskRow|buildTaskContentFolderAssignmentPatch/);
  assert.match(hierarchySql, /adhdice_move_task_hierarchy\([\s\S]*v_task\.revision[\s\S]*v_promoted_parent_id/);
});

test("The canonical generic guard keeps parent_task_id protected", () => {
  assert.match(runtimeActionsSource, /"parent_task_id"/);
  assert.match(runtimeActionsSource, /legacyStateFallback: "forbidden"/);
  assert.match(runtimeActionsSource, /unsupported_state_mutation/);
});

test("The migration grants only authenticated RPC execution and uses an owner check", () => {
  assert.match(hierarchySql, /security definer/);
  assert.match(hierarchySql, /auth\.uid\(\)/);
  assert.match(hierarchySql, /revoke all on function public\.adhdice_move_task_hierarchy/);
  assert.match(hierarchySql, /grant execute on function public\.adhdice_move_task_hierarchy[\s\S]*to authenticated/);
});

test("Milestone detach still calls the shared unlink path before setup", () => {
  assert.match(appSource, /const didDetach = await unlinkSameTableTask\(taskId\);/);
  assert.match(appSource, /setMilestoneSetupTaskId\(taskId\);/);
});

test("The same Task ID is reconciled locally from the returned row", () => {
  assert.match(appSource, /const authoritativeRowsById = new Map\(result\.data\.map/);
  assert.match(appSource, /mergeTaskWithCanonicalScheduleProjection\(candidate, authoritativeRow\)/);
  assert.match(appSource, /taskSnapshots\.set\(\s*candidate\.id,/);
});

test("Hierarchy moves do not route or mutate status, schedule, recurrence, or reward state", () => {
  assert.doesNotMatch(hierarchySql, /set status\s*=/i);
  assert.doesNotMatch(hierarchySql, /due_on\s*=/i);
  assert.doesNotMatch(hierarchySql, /repeat_frequency\s*=/i);
  assert.doesNotMatch(hierarchySql, /task_reward|streak|reward/i);
});

test("No legacy hierarchy persistence fallback remains on the new runtime paths", () => {
  const unlinkBlock = appSource.slice(appSource.indexOf("const unlinkSameTableTask"), appSource.indexOf("const openMilestoneSetup"));
  const moveBlock = appSource.slice(appSource.indexOf("const moveTaskIntoParent"), appSource.indexOf("// Delay is a user action"));
  assert.doesNotMatch(unlinkBlock, /applyTaskMutationWithoutHistory/);
  assert.doesNotMatch(moveBlock, /applyTaskMutationWithoutHistory/);
});
