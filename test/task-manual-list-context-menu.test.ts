import assert from "node:assert/strict";
import test from "node:test";

import { canRemoveTaskFromCurrentList, getBuiltInTaskLists } from "../src/lib/task-lists.ts";

test("manual-list removal eligibility uses direct memberships, not inherited evaluated memberships", () => {
  const projectList = {
    ...getBuiltInTaskLists().find((list) => list.id === "later")!,
    id: "list:project" as const,
    name: "Project",
  };
  const listDefinitions = [...getBuiltInTaskLists(), projectList];
  const evaluatedMembershipsByTaskId = {
    parent: [{ id: "list:project", isManual: true }],
    child: [{ id: "list:project", isManual: true }],
  };
  const directManualMembershipsByTaskId = {
    parent: ["list:project" as const],
    child: [],
  };

  assert.equal(evaluatedMembershipsByTaskId.child[0]?.isManual, true);
  assert.equal(canRemoveTaskFromCurrentList("parent", "list:project", listDefinitions, directManualMembershipsByTaskId), true);
  assert.equal(canRemoveTaskFromCurrentList("child", "list:project", listDefinitions, directManualMembershipsByTaskId), false);

  const childWithDirectMembership = { ...directManualMembershipsByTaskId, child: ["list:project" as const] };
  assert.equal(canRemoveTaskFromCurrentList("child", "list:project", listDefinitions, childWithDirectMembership), true);
});

test("manual-list removal excludes Smart Lists and All", () => {
  const listDefinitions = getBuiltInTaskLists();
  const directManualMembershipsByTaskId = { parent: ["later" as const] };

  assert.equal(canRemoveTaskFromCurrentList("parent", "today", listDefinitions, directManualMembershipsByTaskId), false);
  assert.equal(canRemoveTaskFromCurrentList("parent", "all", listDefinitions, directManualMembershipsByTaskId), false);
});
