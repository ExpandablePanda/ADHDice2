import test from "node:test";
import assert from "node:assert/strict";
import { useTaskRoutingActions } from "../src/hooks/useTaskRoutingActions.ts";
import { getBuiltInTaskLists } from "../src/lib/task-lists.ts";
import type { TaskListManualMembership as DbTaskListManualMembership } from "../src/lib/database.types.ts";
import type { TaskListManualMembership } from "../src/lib/task-lists.ts";

test("Routine membership uses the explicit system-list action without opening other app-owned lists", async () => {
  let memberships: TaskListManualMembership[] = [];
  const routineDbMembership = {
    created_at: "2026-09-18T12:00:00.000Z",
    id: "routine-membership",
    list_id: "routine",
    task_id: "task-1",
    user_id: "u1",
  } as DbTaskListManualMembership;
  const messages: Array<{ text: string; tone: string }> = [];
  const client = {
    from: () => ({
      delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: routineDbMembership, error: null }) }) }),
    }),
  } as never;
  const useRouting = () => useTaskRoutingActions({
    client,
    currentUserId: "u1",
    isMissingTaskListManualMembershipsTableError: () => false,
    manualMembershipsByTaskId: {
      "task-1": memberships.some((membership) => membership.list_id === "routine") ? ["routine"] : [],
    },
    mapTaskListManualMembershipRow: (row: DbTaskListManualMembership) => row as unknown as TaskListManualMembership,
    setMessage: (updater) => {
      const next = typeof updater === "function" ? updater(null) : updater;
      if (next) messages.push(next);
    },
    setTaskListManualMemberships: (updater) => {
      memberships = typeof updater === "function" ? updater(memberships) : updater;
    },
    setTaskRouting: () => {},
    taskListDefinitions: getBuiltInTaskLists(),
    taskListManualMemberships: memberships,
  });

  assert.equal(await useRouting().setTaskManualListMembership("task-1", "routine", true), true);
  assert.equal(memberships[0]?.list_id, "routine");

  assert.equal(await useRouting().toggleTaskManualListMembership("task-1", "routine"), true);
  assert.equal(memberships.length, 0);
  assert.equal(await useRouting().setTaskManualListMembership("task-1", "attention", true), false);
  assert.equal(await useRouting().setTaskManualListMembership("task-1", "milestones", true), false);
  assert.deepEqual(messages, []);
});
